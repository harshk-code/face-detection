import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {CaptureScreen} from '../components/CaptureScreen';
import {generateFaceEmbedding} from '../faceAuth/embeddingModel';
import {averageEmbeddings} from '../faceAuth/enrollment';
import {LivenessEngine, type LivenessConfig} from '../faceAuth/liveness/engine';
import type {MeshLandmarks} from '../faceAuth/liveness/geometry';
import {createNormalizedFaceCrop} from '../faceAuth/preprocessing';
import type {CapturedFacePhoto, FaceEmbedding} from '../faceAuth/types';
import {
  detectMediaPipeFaceMesh,
  type MediaPipeFaceMeshResult,
} from '../native/MediaPipeFaceMesh';
import {logInfo, logWarning} from '../utils/logError';
import {traceNative} from '../utils/nativeTrace';

type Props = {
  onBack: () => void;
  onFaceDataReady: (embedding: FaceEmbedding) => void;
};

type LivenessStep = 'liveness' | 'capture-face';

const FIRST_AUTO_CAPTURE_DELAY_MS = 850;
const AUTO_CAPTURE_RETRY_DELAY_MS = 1050;
const NEXT_STEP_DELAY_MS = 650;
// Enroll from several frames and average the embeddings for a robust template.
const ENROLL_FRAME_COUNT = 3;
const MIN_ENROLL_FRAMES = 2;
const ENROLL_FRAME_GAP_MS = 180;

// Liveness tuned for the still-capture cadence (frames arrive ~1s apart, so the
// window is generous). HEAD_TURN: turn to one side, then return to centre.
const ONBOARD_LIVENESS_CONFIG: Partial<LivenessConfig> = {
  windowMs: 30000,
  maxAttempts: 3,
  yawTurn: 0.08,
  yawCenter: 0.05,
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function toMeshLandmarks(faceMesh: MediaPipeFaceMeshResult): MeshLandmarks {
  const map: MeshLandmarks = {};
  for (const landmark of faceMesh.landmarks) {
    map[landmark.index] = {x: landmark.x, y: landmark.y, z: landmark.z};
  }
  return map;
}

export function OnboardFaceScreen({onBack, onFaceDataReady}: Props) {
  traceNative('onboard-screen-render', {});
  const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const livenessEngineRef = useRef<LivenessEngine | null>(null);
  const isMountedRef = useRef(true);
  const isCaptureInFlightRef = useRef(false);
  const isCompletedRef = useRef(false);
  const stepRef = useRef<LivenessStep>('liveness');
  const capturePhotoRef = useRef<(() => Promise<CapturedFacePhoto>) | null>(
    null,
  );
  const [cameraActive, setCameraActive] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState(
    'Turn your head to one side, then back to centre',
  );
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const engine = new LivenessEngine(ONBOARD_LIVENESS_CONFIG);
    engine.issueChallenge('HEAD_TURN');
    livenessEngineRef.current = engine;
    scheduleAutoCapture(FIRST_AUTO_CAPTURE_DELAY_MS);

    return () => {
      isMountedRef.current = false;
      clearAutoCaptureTimer();
    };
    // The auto-capture loop reads refs so it can keep sampling across prompts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleAutoCapture() {
    if (isCaptureInFlightRef.current || isCompletedRef.current) {
      return;
    }

    if (!capturePhotoRef.current) {
      scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
      return;
    }

    const currentStep = stepRef.current;
    isCaptureInFlightRef.current = true;
    setIsBusy(true);
    setError(null);
    logInfo('face-auth:liveness:auto-capture-start', {step: currentStep});

    try {
      const {path, photoHeight, photoWidth} = await capturePhotoRef.current();
      logInfo('face-auth:liveness:photo-saved', {
        path,
        photoHeight,
        photoWidth,
        step: currentStep,
      });

      if (currentStep === 'capture-face') {
        const vectors: number[][] = [];
        let modelVersion = '';
        for (let frame = 0; frame < ENROLL_FRAME_COUNT; frame += 1) {
          const photo =
            frame === 0
              ? {path, photoHeight, photoWidth}
              : await capturePhotoRef.current();
          try {
            const faceCrop = await createNormalizedFaceCrop({
              photoHeight: photo.photoHeight,
              photoPath: photo.path,
              photoWidth: photo.photoWidth,
            });
            const frameEmbedding = await generateFaceEmbedding(faceCrop);
            vectors.push(frameEmbedding.vector);
            modelVersion = frameEmbedding.modelVersion;
          } catch (frameError) {
            logWarning('face-auth:onboard:frame-skip', frameError);
          }
          if (frame < ENROLL_FRAME_COUNT - 1) {
            await delay(ENROLL_FRAME_GAP_MS);
          }
        }

        if (vectors.length < MIN_ENROLL_FRAMES) {
          setStatus('Hold steady for a clear capture');
          setError('Could not capture enough clear frames. Try again.');
          scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
          return;
        }

        const embedding: FaceEmbedding = {
          vector: averageEmbeddings(vectors),
          modelVersion,
        };

        logInfo('face-auth:onboard:embedding-ready', {
          framesUsed: vectors.length,
          modelVersion: embedding.modelVersion,
          vectorLength: embedding.vector.length,
          vectorSample: embedding.vector
            .slice(0, 8)
            .map(value => Number(value.toFixed(6))),
        });
        isCompletedRef.current = true;
        setStatus('Face data captured. Opening onboarding form...');
        setCameraActive(false);
        setTimeout(() => {
          logInfo('face-auth:onboard:navigate-form', {
            modelVersion: embedding.modelVersion,
            vectorLength: embedding.vector.length,
          });
          onFaceDataReady(embedding);
        }, 250);
        return;
      }

      const faceMesh = await detectMediaPipeFaceMesh(path);
      const landmarks = toMeshLandmarks(faceMesh);
      const engine = livenessEngineRef.current;
      if (!engine) {
        scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
        return;
      }

      const update = engine.update(landmarks, Date.now());
      setProgress(update.progress);
      logInfo('face-auth:liveness:update', {
        challenge: update.challenge,
        landmarkCount: faceMesh.landmarks.length,
        passed: update.passed,
        progress: Number(update.progress.toFixed(2)),
        state: update.state,
      });

      if (update.passed) {
        setStepValue('capture-face');
        setStatus('Liveness verified. Capturing face data...');
        setError(null);
        scheduleAutoCapture(NEXT_STEP_DELAY_MS);
        return;
      }

      if (update.state === 'FAILED') {
        engine.issueChallenge('HEAD_TURN');
        setProgress(0);
        setStatus("Let's try the liveness check again");
        setError('Turn your head to one side, then back to centre');
        scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
        return;
      }

      setStatus('Turn your head to one side, then back to centre');
      setError(null);
      scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
    } catch (onboardError) {
      logWarning('OnboardFaceScreen.handlePrimaryAction', onboardError);
      setStatus('Keep your face centered in the frame');
      setError(
        onboardError instanceof Error
          ? onboardError.message
          : 'Unable to complete onboarding step.',
      );
      scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
    } finally {
      if (isMountedRef.current && !isCompletedRef.current) {
        setIsBusy(false);
        isCaptureInFlightRef.current = false;
      }
    }
  }

  return (
    <CaptureScreen
      title="Onboard"
      subtitle="Follow the prompts. Capture happens automatically."
      primaryLabel=""
      cameraActive={cameraActive}
      enableLiveFaceDetector={false}
      primaryVisible={false}
      isBusy={isBusy}
      isFaceDetected
      onBack={onBack}
      onCapture={() => undefined}
      onCapturePhotoReady={capturePhoto => {
        capturePhotoRef.current = capturePhoto;
        if (capturePhoto) {
          scheduleAutoCapture(FIRST_AUTO_CAPTURE_DELAY_MS);
        }
      }}
      onFaceDetectedChange={() => undefined}
      onFaceSnapshotChange={() => undefined}
      secondaryContent={
        <View style={styles.promptCard}>
          <Text style={styles.promptLabel}>
            {stepRef.current === 'capture-face'
              ? 'Capturing face'
              : 'Liveness check · head turn'}
          </Text>
          <Text style={styles.promptText}>{status}</Text>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {width: `${Math.round(Math.min(1, progress) * 100)}%`},
              ]}
            />
          </View>
          {isBusy ? <Text style={styles.busy}>Checking...</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
    />
  );

  function setStepValue(nextStep: LivenessStep) {
    stepRef.current = nextStep;
  }

  function scheduleAutoCapture(delayMs: number) {
    if (!isMountedRef.current || isCompletedRef.current) {
      return;
    }

    clearAutoCaptureTimer();
    autoCaptureTimeoutRef.current = setTimeout(() => {
      void handleAutoCapture();
    }, delayMs);
  }

  function clearAutoCaptureTimer() {
    if (autoCaptureTimeoutRef.current) {
      clearTimeout(autoCaptureTimeoutRef.current);
      autoCaptureTimeoutRef.current = null;
    }
  }
}


const styles = StyleSheet.create({
  promptCard: {
    gap: 6,
  },
  promptLabel: {
    color: '#d7dde8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  promptText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '900',
  },
  busy: {
    color: '#d7edf8',
    fontSize: 13,
    fontWeight: '800',
  },
  error: {
    color: '#ffb4b4',
    fontWeight: '700',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
    marginTop: 4,
  },
  progressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#4f9dff',
  },
});

import React, {useCallback, useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {CaptureScreen} from '../components/CaptureScreen';
import {syncAuthEventFireAndForget} from '../faceAuth/backendApi';
import {LivenessEngine, type LivenessConfig} from '../faceAuth/liveness/engine';
import type {MeshLandmarks} from '../faceAuth/liveness/geometry';
import {createNormalizedFaceCrop} from '../faceAuth/preprocessing';
import {FaceAuth, TfliteEmbedder, type LivenessFrame} from '../faceAuth/sdk';
import type {
  CapturedFacePhoto,
  DetectedFaceSnapshot,
  FaceTemplate,
} from '../faceAuth/types';
import {
  detectMediaPipeFaceMesh,
  type MediaPipeFaceMeshResult,
} from '../native/MediaPipeFaceMesh';
import {logError, logInfo} from '../utils/logError';

type Props = {
  localTemplate: FaceTemplate;
  onAuthenticated: () => void;
  onBack: () => void;
};

type MatchDisplay = 'matched' | 'rejected' | null;
type Phase = 'liveness' | 'matching';

const CAMERA_SETTLE_MS = 500;
const SAMPLE_DELAY_MS = 900;
const RETRY_DELAY_MS = 1400;

// Head-turn liveness gate before a login match (turn to one side, back to centre).
const VERIFY_LIVENESS_CONFIG: Partial<LivenessConfig> = {
  windowMs: 20000,
  maxAttempts: 3,
  yawTurn: 0.08,
  yawCenter: 0.05,
};

function toMeshLandmarks(faceMesh: MediaPipeFaceMeshResult): MeshLandmarks {
  const map: MeshLandmarks = {};
  for (const landmark of faceMesh.landmarks) {
    map[landmark.index] = {x: landmark.x, y: landmark.y, z: landmark.z};
  }
  return map;
}

export function VerifyFaceScreen({
  localTemplate,
  onAuthenticated,
  onBack,
}: Props) {
  const sampleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInFlightRef = useRef(false);
  const latestFaceRef = useRef<DetectedFaceSnapshot | null>(null);
  const capturePhotoRef = useRef<(() => Promise<CapturedFacePhoto>) | null>(
    null,
  );
  const engineRef = useRef(new LivenessEngine(VERIFY_LIVENESS_CONFIG));
  const framesRef = useRef<LivenessFrame[]>([]);
  const faceAuthRef = useRef(
    new FaceAuth({
      embedder: new TfliteEmbedder(),
      livenessConfig: VERIFY_LIVENESS_CONFIG,
      matcherThreshold: localTemplate.threshold,
    }),
  );
  const startedAtRef = useRef(0);
  const isMountedRef = useRef(true);
  const doneRef = useRef(false);

  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('liveness');
  const [progress, setProgress] = useState(0);
  const [score, setScore] = useState<number | null>(null);
  const [matchDisplay, setMatchDisplay] = useState<MatchDisplay>(null);
  const [toast, setToast] = useState('Turn your head, then look at the camera');

  useEffect(() => {
    isMountedRef.current = true;
    engineRef.current.issueChallenge('HEAD_TURN');
    startedAtRef.current = Date.now();
    return () => {
      isMountedRef.current = false;
      if (sampleTimeoutRef.current) {
        clearTimeout(sampleTimeoutRef.current);
        sampleTimeoutRef.current = null;
      }
    };
  }, []);

  const handleFaceSnapshotChange = useCallback(
    (face: DetectedFaceSnapshot | null) => {
      latestFaceRef.current = face;
    },
    [],
  );

  // Single driver: the capture/liveness loop self-schedules via scheduleNext
  // (guarded by isMounted/done), kicked off once the camera is ready.
  function scheduleNext(delayMs: number) {
    if (!isMountedRef.current || doneRef.current) {
      return;
    }
    if (sampleTimeoutRef.current) {
      clearTimeout(sampleTimeoutRef.current);
    }
    sampleTimeoutRef.current = setTimeout(() => {
      void handleSample();
    }, delayMs);
  }

  async function handleSample() {
    if (isInFlightRef.current || !isMountedRef.current || doneRef.current) {
      return;
    }
    isInFlightRef.current = true;
    setIsBusy(true);
    let authenticated = false;

    try {
      await delay(CAMERA_SETTLE_MS);
      if (!capturePhotoRef.current) {
        throw new Error('Camera is not ready yet. Please try again.');
      }
      const photo = await capturePhotoRef.current();

      // Phase 1: gather head-turn liveness frames until the engine passes.
      const faceMesh = await detectMediaPipeFaceMesh(photo.path);
      const landmarks = toMeshLandmarks(faceMesh);
      const ts = Date.now();
      framesRef.current.push({landmarks, ts});
      const update = engineRef.current.update(landmarks, ts);
      setProgress(update.progress);

      if (!update.passed) {
        if (update.state === 'FAILED') {
          engineRef.current.issueChallenge('HEAD_TURN');
          framesRef.current = [];
          setProgress(0);
          setToast("Let's try again — turn your head, then back to centre");
        } else {
          setToast('Turn your head to one side, then back to centre');
        }
        await delay(0);
        scheduleNext(SAMPLE_DELAY_MS);
        return;
      }

      // Phase 2: liveness passed — run recognition via the SDK facade.
      setPhase('matching');
      setToast('Liveness verified. Matching...');
      const faceCrop = await createNormalizedFaceCrop({
        detectedFace: latestFaceRef.current,
        photoHeight: photo.photoHeight,
        photoPath: photo.path,
        photoWidth: photo.photoWidth,
      });

      const outcome = await faceAuthRef.current.authenticate({
        templateEmbedding: localTemplate.embedding,
        threshold: localTemplate.threshold,
        challenge: 'HEAD_TURN',
        frames: framesRef.current,
        sample: {crop: faceCrop},
      });
      setScore(outcome.score);

      syncAuthEventFireAndForget({
        capturedAt: new Date().toISOString(),
        latencyMs: Date.now() - startedAtRef.current,
        matchResult: {
          matched: outcome.matched,
          score: outcome.score,
          threshold: localTemplate.threshold,
        },
        template: localTemplate,
        livenessPassed: outcome.livenessPassed,
        challengeTypes: [outcome.challenge],
      });
      logInfo('face-auth:verify:outcome', {
        matched: outcome.matched,
        reason: outcome.reason,
        score: Number(outcome.score.toFixed(4)),
      });

      setMatchDisplay(outcome.matched ? 'matched' : 'rejected');
      if (outcome.matched) {
        setToast('Face matched. Logging you in...');
        doneRef.current = true;
        authenticated = true;
        return;
      }

      // Reset for another attempt.
      setToast('Face did not match. Please try again.');
      engineRef.current.issueChallenge('HEAD_TURN');
      framesRef.current = [];
      setPhase('liveness');
      setProgress(0);
      await delay(RETRY_DELAY_MS);
      scheduleNext(SAMPLE_DELAY_MS);
    } catch (captureError) {
      const message =
        captureError instanceof Error ? captureError.message : '';
      // "No face" / "camera not ready" are normal transient conditions while the
      // user gets into frame — surface a calm prompt, not a red error.
      const transient =
        message.includes('did not detect a face') ||
        message.includes('Camera is not ready');
      if (transient) {
        logInfo('face-auth:verify:waiting', {reason: message});
        setToast('Position your face in the frame, then turn your head');
      } else {
        logError('VerifyFaceScreen.handleSample', captureError);
        setToast(message || 'Unable to match face.');
      }
      await delay(transient ? 0 : RETRY_DELAY_MS);
      scheduleNext(SAMPLE_DELAY_MS);
    } finally {
      setIsBusy(false);
      isInFlightRef.current = false;
      if (authenticated) {
        onAuthenticated();
      }
    }
  }

  return (
    <CaptureScreen
      title="Login"
      subtitle="Liveness + face match start automatically"
      primaryLabel="Matching"
      enableLiveFaceDetector={false}
      primaryVisible={false}
      isBusy={isBusy}
      isFaceDetected={isFaceDetected}
      onBack={onBack}
      onCapture={() => undefined}
      onCapturePhotoReady={capturePhoto => {
        capturePhotoRef.current = capturePhoto;
        if (capturePhoto) {
          scheduleNext(SAMPLE_DELAY_MS);
        }
      }}
      onFaceDetectedChange={setIsFaceDetected}
      onFaceSnapshotChange={handleFaceSnapshotChange}
      secondaryContent={
        <View
          style={[
            styles.statusCard,
            matchDisplay === 'matched'
              ? styles.statusMatched
              : matchDisplay
                ? styles.statusRejected
                : null,
          ]}>
          <Text style={styles.statusLabel}>
            {phase === 'matching' ? 'Recognition' : 'Liveness check · head turn'}
          </Text>
          <Text style={styles.statusTitle}>{toast}</Text>
          {phase === 'liveness' && !matchDisplay ? (
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {width: `${Math.round(Math.min(1, progress) * 100)}%`},
                ]}
              />
            </View>
          ) : null}
          {score !== null ? (
            <Text style={styles.statusMeta}>
              Match score {(score * 100).toFixed(1)}% · threshold{' '}
              {(localTemplate.threshold * 100).toFixed(0)}%
            </Text>
          ) : (
            <Text style={styles.statusMeta}>
              Verifying against {localTemplate.personnelId}
            </Text>
          )}
        </View>
      }
    />
  );
}

function delay(durationMs: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, durationMs);
  });
}

const styles = StyleSheet.create({
  statusCard: {
    minHeight: 64,
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(0, 0, 0, 0.36)',
    padding: 12,
    gap: 6,
  },
  statusMatched: {
    borderColor: 'rgba(110, 231, 168, 0.55)',
    backgroundColor: 'rgba(22, 101, 52, 0.6)',
  },
  statusRejected: {
    borderColor: 'rgba(255, 180, 180, 0.55)',
    backgroundColor: 'rgba(127, 29, 29, 0.58)',
  },
  statusLabel: {
    color: '#d7dde8',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  statusTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '900',
    textAlign: 'center',
  },
  statusMeta: {
    color: '#e7edf5',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#4f9dff',
  },
});

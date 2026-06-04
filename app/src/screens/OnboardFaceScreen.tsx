import React, {useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {CaptureScreen} from '../components/CaptureScreen';
import {generateFaceEmbedding} from '../faceAuth/embeddingModel';
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

type LivenessStep = 'turn-first' | 'turn-opposite' | 'capture-face';

const HEAD_TURN_THRESHOLD_RATIO = 0.07;
const OPPOSITE_POSE_DELTA_RATIO = 0.06;
const OPPOSITE_FACE_CENTER_DELTA_RATIO = 0.025;

type HeadTurnResult = ReturnType<typeof evaluateHeadTurn>;

export function OnboardFaceScreen({onBack, onFaceDataReady}: Props) {
  traceNative('onboard-screen-render', {});
  const firstTurnSignRef = useRef<number | null>(null);
  const firstTurnPoseRef = useRef<HeadTurnResult | null>(null);
  const isCaptureInFlightRef = useRef(false);
  const capturePhotoRef = useRef<(() => Promise<CapturedFacePhoto>) | null>(
    null,
  );
  const [step, setStep] = useState<LivenessStep>('turn-first');
  const [cameraActive, setCameraActive] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('Turn your head slightly to one side');
  const [error, setError] = useState<string | null>(null);

  async function handlePrimaryAction() {
    if (isCaptureInFlightRef.current || isBusy) {
      logInfo('face-auth:liveness:ignored-press', {
        isBusy,
        isCaptureInFlight: isCaptureInFlightRef.current,
        step,
      });
      return;
    }

    isCaptureInFlightRef.current = true;
    setIsBusy(true);
    setError(null);
    logInfo('face-auth:liveness:capture-start', {step});

    try {
      if (!capturePhotoRef.current) {
        throw new Error('Camera is not ready yet. Please try again.');
      }

      const {path, photoHeight, photoWidth} = await capturePhotoRef.current();
      logInfo('face-auth:liveness:photo-saved', {
        path,
        photoHeight,
        photoWidth,
        step,
      });

      if (step === 'capture-face') {
        const faceCrop = await createNormalizedFaceCrop({
          photoHeight,
          photoPath: path,
          photoWidth,
        });
        const embedding = await generateFaceEmbedding(faceCrop);

        logInfo('face-auth:onboard:embedding-ready', {
          modelVersion: embedding.modelVersion,
          vectorLength: embedding.vector.length,
          vectorSample: embedding.vector
            .slice(0, 8)
            .map(value => Number(value.toFixed(6))),
        });
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
      const headTurn = evaluateHeadTurn(faceMesh);
      logInfo('face-auth:liveness:head-turn', {
        firstTurnSign: firstTurnSignRef.current,
        firstTurnYawOffsetRatio:
          firstTurnPoseRef.current?.yawOffsetRatio ?? null,
        landmarkCount: faceMesh.landmarks.length,
        mediaPipeBounds: faceMesh.bounds,
        mediaPipeImageHeight: faceMesh.imageHeight,
        mediaPipeImageWidth: faceMesh.imageWidth,
        requiredAbsYawOffsetRatio: HEAD_TURN_THRESHOLD_RATIO,
        requiredFaceCenterDeltaRatio: OPPOSITE_FACE_CENTER_DELTA_RATIO,
        requiredYawDeltaRatio: OPPOSITE_POSE_DELTA_RATIO,
        ...headTurn,
        step,
      });

      if (!headTurn.passed) {
        logInfo('face-auth:liveness:turn-too-small', {
          requiredAbsYawOffsetRatio: HEAD_TURN_THRESHOLD_RATIO,
          step,
          yawOffsetRatio: headTurn.yawOffsetRatio,
        });
        throw new Error(
          `Turn a little more and try again. Score ${Math.abs(
            headTurn.yawOffsetRatio,
          ).toFixed(3)} / ${HEAD_TURN_THRESHOLD_RATIO}.`,
        );
      }

      if (step === 'turn-first') {
        firstTurnSignRef.current = headTurn.sign;
        firstTurnPoseRef.current = headTurn;
        logInfo('face-auth:liveness:first-turn-recorded', {
          faceCenterX: headTurn.faceCenterX,
          normalizedFaceCenterX: headTurn.normalizedFaceCenterX,
          recordedSign: headTurn.sign,
          yawOffset: headTurn.yawOffset,
          yawOffsetRatio: headTurn.yawOffsetRatio,
        });
        setStep('turn-opposite');
        setStatus('Good. Now move slightly to the other side');
        return;
      }

      const oppositeTurn = evaluateOppositeTurn(
        firstTurnPoseRef.current,
        headTurn,
      );

      if (!oppositeTurn.passed) {
        logInfo('face-auth:liveness:opposite-turn-rejected', {
          ...oppositeTurn,
          currentSign: headTurn.sign,
          firstTurnSign: firstTurnSignRef.current,
          firstTurnYawOffsetRatio:
            firstTurnPoseRef.current?.yawOffsetRatio ?? null,
          requiredFaceCenterDeltaRatio: OPPOSITE_FACE_CENTER_DELTA_RATIO,
          requiredYawDeltaRatio: OPPOSITE_POSE_DELTA_RATIO,
          yawOffset: headTurn.yawOffset,
          yawOffsetRatio: headTurn.yawOffsetRatio,
        });
        throw new Error(
          `Turn in the opposite direction and try again. Delta ${oppositeTurn.yawDelta.toFixed(
            3,
          )} / ${OPPOSITE_POSE_DELTA_RATIO}.`,
        );
      }

      logInfo('face-auth:liveness:opposite-turn-recorded', {
        ...oppositeTurn,
        currentSign: headTurn.sign,
        firstTurnSign: firstTurnSignRef.current,
        requiredFaceCenterDeltaRatio: OPPOSITE_FACE_CENTER_DELTA_RATIO,
        requiredYawDeltaRatio: OPPOSITE_POSE_DELTA_RATIO,
        yawOffset: headTurn.yawOffset,
        yawOffsetRatio: headTurn.yawOffsetRatio,
      });
      setStep('capture-face');
      setStatus('Liveness verified. Face data is ready to capture.');
    } catch (onboardError) {
      logWarning('OnboardFaceScreen.handlePrimaryAction', onboardError);
      setError(
        onboardError instanceof Error
          ? onboardError.message
          : 'Unable to complete onboarding step.',
      );
    } finally {
      setIsBusy(false);
      isCaptureInFlightRef.current = false;
    }
  }

  return (
    <CaptureScreen
      title="Onboard"
      subtitle="Complete liveness before face data capture"
      primaryLabel={getPrimaryLabel(step)}
      cameraActive={cameraActive}
      enableLiveFaceDetector={false}
      primaryVisible
      isBusy={isBusy}
      isFaceDetected
      onBack={onBack}
      onCapture={handlePrimaryAction}
      onCapturePhotoReady={capturePhoto => {
        capturePhotoRef.current = capturePhoto;
      }}
      onFaceDetectedChange={() => undefined}
      onFaceSnapshotChange={() => undefined}
      secondaryContent={
        <View style={styles.promptCard}>
          <Text style={styles.promptLabel}>Liveness check</Text>
          <Text style={styles.promptText}>{status}</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      }
    />
  );
}

function getPrimaryLabel(step: LivenessStep) {
  if (step === 'turn-first') {
    return 'Check First Movement';
  }

  if (step === 'turn-opposite') {
    return 'Check Second Movement';
  }

  return 'Capture Face Data';
}

function evaluateHeadTurn(faceMesh: MediaPipeFaceMeshResult) {
  const nose = faceMesh.landmarks.find(landmark => landmark.index === 1);
  const leftEye = faceMesh.landmarks.find(landmark => landmark.index === 33);
  const rightEye = faceMesh.landmarks.find(landmark => landmark.index === 263);

  if (!nose || !leftEye || !rightEye) {
    return {
      denominator: 1,
      faceCenterX: 0,
      missingLandmarks: {
        leftEye: !leftEye,
        nose: !nose,
        rightEye: !rightEye,
      },
      normalizedFaceCenterX: 0,
      passed: false,
      rawEyeDistance: 0,
      sign: 0,
      yawOffset: 0,
      yawOffsetRatio: 0,
    };
  }

  const faceCenterX = (leftEye.x + rightEye.x) / 2;
  const rawEyeDistance = Math.abs(rightEye.x - leftEye.x);
  const minEyeDistance = faceMesh.bounds.width * 0.28;
  const denominator = Math.max(rawEyeDistance, minEyeDistance, 1);
  const yawOffset = nose.x - faceCenterX;
  const yawOffsetRatio = yawOffset / denominator;
  const sign = Math.sign(yawOffsetRatio);

  return {
    denominator,
    faceCenterX,
    missingLandmarks: null,
    normalizedFaceCenterX: faceCenterX / Math.max(faceMesh.imageWidth, 1),
    passed: Math.abs(yawOffsetRatio) >= HEAD_TURN_THRESHOLD_RATIO && sign !== 0,
    rawEyeDistance,
    sign,
    yawOffset,
    yawOffsetRatio,
  };
}

function evaluateOppositeTurn(
  firstTurn: HeadTurnResult | null,
  currentTurn: HeadTurnResult,
) {
  if (!firstTurn) {
    return {
      faceCenterDelta: 0,
      passed: false,
      reason: 'missing-first-turn',
      signChanged: false,
      yawDelta: 0,
    };
  }

  const signChanged =
    firstTurn.sign !== 0 &&
    currentTurn.sign !== 0 &&
    firstTurn.sign !== currentTurn.sign;
  const yawDelta = Math.abs(
    currentTurn.yawOffsetRatio - firstTurn.yawOffsetRatio,
  );
  const faceCenterDelta = Math.abs(
    currentTurn.normalizedFaceCenterX - firstTurn.normalizedFaceCenterX,
  );
  const poseChangedEnough =
    yawDelta >= OPPOSITE_POSE_DELTA_RATIO ||
    faceCenterDelta >= OPPOSITE_FACE_CENTER_DELTA_RATIO;

  return {
    faceCenterDelta,
    passed: signChanged || poseChangedEnough,
    reason: signChanged
      ? 'sign-changed'
      : poseChangedEnough
        ? 'pose-delta'
        : 'same-pose',
    signChanged,
    yawDelta,
  };
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
  error: {
    color: '#ffb4b4',
    fontWeight: '700',
  },
});

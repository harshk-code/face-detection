import React, {useEffect, useRef, useState} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {CaptureScreen} from '../components/CaptureScreen';
import {generateFaceEmbedding} from '../faceAuth/embeddingModel';
import {createEnrollmentFaceEmbedding} from '../faceAuth/enrollmentTemplate';
import {createNormalizedFaceCrop} from '../faceAuth/preprocessing';
import type {
  CapturedFacePhoto,
  EnrollmentEmbedding,
  EnrollmentPose,
  FaceEmbedding,
} from '../faceAuth/types';
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

type LivenessStep =
  | 'capture-front'
  | 'capture-left'
  | 'capture-right'
  | 'turn-first'
  | 'turn-opposite';

const HEAD_TURN_THRESHOLD_RATIO = 0.07;
const OPPOSITE_POSE_DELTA_RATIO = 0.06;
const OPPOSITE_FACE_CENTER_DELTA_RATIO = 0.025;
const FIRST_AUTO_CAPTURE_DELAY_MS = 850;
const ENROLLMENT_CAPTURE_DELAY_MS = 1100;
const AUTO_CAPTURE_RETRY_DELAY_MS = 1050;
const NEXT_STEP_DELAY_MS = 650;

type HeadTurnResult = ReturnType<typeof evaluateHeadTurn>;

export function OnboardFaceScreen({onBack, onFaceDataReady}: Props) {
  traceNative('onboard-screen-render', {});
  const autoCaptureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const firstTurnSignRef = useRef<number | null>(null);
  const firstTurnPoseRef = useRef<HeadTurnResult | null>(null);
  const enrollmentSamplesRef = useRef<EnrollmentEmbedding[]>([]);
  const isMountedRef = useRef(true);
  const isCaptureInFlightRef = useRef(false);
  const isCompletedRef = useRef(false);
  const stepRef = useRef<LivenessStep>('turn-first');
  const capturePhotoRef = useRef<(() => Promise<CapturedFacePhoto>) | null>(
    null,
  );
  const [cameraActive, setCameraActive] = useState(true);
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState('Turn your head slightly to one side');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

      if (isEnrollmentCaptureStep(currentStep)) {
        await captureEnrollmentSample({
          path,
          photoHeight,
          photoWidth,
          step: currentStep,
        });
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
        step: currentStep,
      });

      if (!headTurn.passed) {
        logInfo('face-auth:liveness:turn-too-small', {
          requiredAbsYawOffsetRatio: HEAD_TURN_THRESHOLD_RATIO,
          step: currentStep,
          yawOffsetRatio: headTurn.yawOffsetRatio,
        });
        setStatus(
          currentStep === 'turn-first'
            ? 'Tilt your head slightly left or right'
            : 'Now tilt slightly to the other side',
        );
        setError('Keep your face inside the frame');
        scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
        return;
      }

      if (currentStep === 'turn-first') {
        firstTurnSignRef.current = headTurn.sign;
        firstTurnPoseRef.current = headTurn;
        logInfo('face-auth:liveness:first-turn-recorded', {
          faceCenterX: headTurn.faceCenterX,
          normalizedFaceCenterX: headTurn.normalizedFaceCenterX,
          recordedSign: headTurn.sign,
          yawOffset: headTurn.yawOffset,
          yawOffsetRatio: headTurn.yawOffsetRatio,
        });
        setStepValue('turn-opposite');
        setStatus('Good. Now move slightly to the other side');
        scheduleAutoCapture(NEXT_STEP_DELAY_MS);
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
        setStatus('Turn slightly in the opposite direction');
        setError('Small movement is enough. Keep your face steady.');
        scheduleAutoCapture(AUTO_CAPTURE_RETRY_DELAY_MS);
        return;
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
      enrollmentSamplesRef.current = [];
      setStepValue('capture-front');
      setStatus('Liveness verified. Look straight at the camera');
      scheduleAutoCapture(ENROLLMENT_CAPTURE_DELAY_MS);
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
          <Text style={styles.promptLabel}>Liveness check</Text>
          <Text style={styles.promptText}>{status}</Text>
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

  async function captureEnrollmentSample({
    path,
    photoHeight,
    photoWidth,
    step,
  }: {
    path: string;
    photoHeight: number;
    photoWidth: number;
    step: EnrollmentCaptureStep;
  }) {
    const pose = getEnrollmentPose(step);
    const faceCrop = await createNormalizedFaceCrop({
      photoHeight,
      photoPath: path,
      photoWidth,
    });
    const embedding = await generateFaceEmbedding(faceCrop);
    const sample: EnrollmentEmbedding = {
      capturedAt: new Date().toISOString(),
      modelVersion: embedding.modelVersion,
      pose,
      vector: embedding.vector,
    };

    enrollmentSamplesRef.current = [...enrollmentSamplesRef.current, sample];
    logInfo('face-auth:onboard:sample-ready', {
      capturedSamples: enrollmentSamplesRef.current.length,
      modelVersion: embedding.modelVersion,
      pose,
      vectorLength: embedding.vector.length,
      vectorSample: embedding.vector
        .slice(0, 8)
        .map(value => Number(value.toFixed(6))),
    });

    if (step === 'capture-front') {
      setStepValue('capture-left');
      setStatus('Good. Turn slightly left');
      scheduleAutoCapture(ENROLLMENT_CAPTURE_DELAY_MS);
      return;
    }

    if (step === 'capture-left') {
      setStepValue('capture-right');
      setStatus('Good. Turn slightly right');
      scheduleAutoCapture(ENROLLMENT_CAPTURE_DELAY_MS);
      return;
    }

    let enrollmentEmbedding: FaceEmbedding;
    try {
      enrollmentEmbedding = createEnrollmentFaceEmbedding(
        enrollmentSamplesRef.current,
      );
    } catch (sampleError) {
      logWarning('face-auth:onboard:sample-set-error', sampleError);
      enrollmentSamplesRef.current = [];
      setStepValue('capture-front');
      setStatus('Samples were not consistent. Look straight at the camera');
      setError('Keep the same face centered for all samples.');
      scheduleAutoCapture(ENROLLMENT_CAPTURE_DELAY_MS);
      return;
    }
    logInfo('face-auth:onboard:embedding-ready', {
      modelVersion: enrollmentEmbedding.modelVersion,
      sampleCount: enrollmentEmbedding.samples?.length ?? 0,
      vectorLength: enrollmentEmbedding.vector.length,
      vectorSample: enrollmentEmbedding.vector
        .slice(0, 8)
        .map(value => Number(value.toFixed(6))),
    });
    isCompletedRef.current = true;
    setStatus('Face data captured. Opening onboarding form...');
    setCameraActive(false);
    setTimeout(() => {
      logInfo('face-auth:onboard:navigate-form', {
        modelVersion: enrollmentEmbedding.modelVersion,
        sampleCount: enrollmentEmbedding.samples?.length ?? 0,
        vectorLength: enrollmentEmbedding.vector.length,
      });
      onFaceDataReady(enrollmentEmbedding);
    }, 250);
  }
}

type EnrollmentCaptureStep =
  | 'capture-front'
  | 'capture-left'
  | 'capture-right';

function isEnrollmentCaptureStep(
  step: LivenessStep,
): step is EnrollmentCaptureStep {
  return (
    step === 'capture-front' ||
    step === 'capture-left' ||
    step === 'capture-right'
  );
}

function getEnrollmentPose(step: EnrollmentCaptureStep): EnrollmentPose {
  if (step === 'capture-left') {
    return 'left';
  }

  if (step === 'capture-right') {
    return 'right';
  }

  return 'front';
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
  busy: {
    color: '#d7edf8',
    fontSize: 13,
    fontWeight: '800',
  },
  error: {
    color: '#ffb4b4',
    fontWeight: '700',
  },
});

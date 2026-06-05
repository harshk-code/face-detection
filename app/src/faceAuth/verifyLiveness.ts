import type {
  MediaPipeFaceMeshLandmark,
  MediaPipeFaceMeshResult,
} from '../native/MediaPipeFaceMesh';

/**
 * Offline liveness signals for the login (verify) flow, computed from a
 * MediaPipe FaceMesh result. Two independent, scale-invariant signals:
 *
 *  - Head-turn: nose offset from the eye-centre line, normalised by eye
 *    distance (same geometry the onboarding gate uses).
 *  - Blink: eye-aspect-ratio (EAR) — vertical eyelid gap over horizontal eye
 *    width — sampled across frames; a real blink shows both an open and a
 *    closed state, which a static photo/screen never does.
 *
 * A live person passes by EITHER turning their head slightly OR blinking. A
 * printed photo or replayed video frame does neither, so the match is gated.
 */

// MediaPipe FaceMesh landmark indices.
const NOSE_TIP = 1;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
// Left eye (subject's left): outer 33, inner 133, top 159, bottom 145.
const LEFT_EYE = {bottom: 145, inner: 133, outer: 33, top: 159} as const;
// Right eye: outer 263, inner 362, top 386, bottom 374.
const RIGHT_EYE = {bottom: 374, inner: 362, outer: 263, top: 386} as const;

// Head-turn: |nose offset / eye distance| must exceed this to count as a turn.
export const HEAD_TURN_RATIO = 0.07;
// EAR thresholds: below CLOSED = eye shut, above OPEN = eye open. Observing
// both across the window means the eyelid actually moved (a blink).
export const EAR_CLOSED = 0.19;
export const EAR_OPEN = 0.27;

export type LivenessSignal = 'BLINK' | 'HEAD_TURN';

/**
 * Map a detected signal to a backend-accepted challenge type. The backend's
 * `allowedChallenges` set is {BLINK, SMILE, TURN_LEFT, TURN_RIGHT, NOD,
 * FACE_PRESENT}, so a head-turn is reported as TURN_LEFT and the (unused)
 * no-signal fallback as FACE_PRESENT. Sending an out-of-vocabulary type would
 * make the backend reject the sync event (and it would never purge).
 */
export function livenessChallengeType(signal: LivenessSignal | null): string {
  if (signal === 'BLINK') {
    return 'BLINK';
  }
  if (signal === 'HEAD_TURN') {
    return 'TURN_LEFT';
  }
  return 'FACE_PRESENT';
}

export type LivenessFrame = {
  ear: number | null;
  yawRatio: number | null;
};

export type LivenessProgress = {
  passed: boolean;
  signal: LivenessSignal | null;
  blinkSeen: boolean;
  headTurnSeen: boolean;
  /** 0..1 hint for the UI (max of the two signals' progress). */
  progress: number;
};

function point(faceMesh: MediaPipeFaceMeshResult, index: number) {
  return faceMesh.landmarks.find(
    (landmark: MediaPipeFaceMeshLandmark) => landmark.index === index,
  );
}

function distance(
  a: MediaPipeFaceMeshLandmark,
  b: MediaPipeFaceMeshLandmark,
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Eye-aspect-ratio for one eye: vertical gap / horizontal width. */
function singleEyeAspectRatio(
  faceMesh: MediaPipeFaceMeshResult,
  eye: {top: number; bottom: number; inner: number; outer: number},
): number | null {
  const top = point(faceMesh, eye.top);
  const bottom = point(faceMesh, eye.bottom);
  const inner = point(faceMesh, eye.inner);
  const outer = point(faceMesh, eye.outer);
  if (!top || !bottom || !inner || !outer) {
    return null;
  }
  const width = distance(inner, outer);
  if (width <= 0) {
    return null;
  }
  return distance(top, bottom) / width;
}

/** Average EAR across both eyes (null if landmarks are missing). */
export function eyeAspectRatio(
  faceMesh: MediaPipeFaceMeshResult,
): number | null {
  const left = singleEyeAspectRatio(faceMesh, LEFT_EYE);
  const right = singleEyeAspectRatio(faceMesh, RIGHT_EYE);
  if (left === null && right === null) {
    return null;
  }
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return (left + right) / 2;
}

/** Signed, scale-invariant head-turn ratio (null if landmarks are missing). */
export function headTurnRatio(
  faceMesh: MediaPipeFaceMeshResult,
): number | null {
  const nose = point(faceMesh, NOSE_TIP);
  const leftEye = point(faceMesh, LEFT_EYE_OUTER);
  const rightEye = point(faceMesh, RIGHT_EYE_OUTER);
  if (!nose || !leftEye || !rightEye) {
    return null;
  }
  const faceCenterX = (leftEye.x + rightEye.x) / 2;
  const rawEyeDistance = Math.abs(rightEye.x - leftEye.x);
  const denominator = Math.max(rawEyeDistance, faceMesh.bounds.width * 0.28, 1);
  return (nose.x - faceCenterX) / denominator;
}

/** Reduce one captured frame to its liveness signals. */
export function sampleLivenessFrame(
  faceMesh: MediaPipeFaceMeshResult,
): LivenessFrame {
  return {
    ear: eyeAspectRatio(faceMesh),
    yawRatio: headTurnRatio(faceMesh),
  };
}

/**
 * Evaluate accumulated frames. Passes when a blink (EAR open→closed observed)
 * OR a head-turn is detected. Pure function so it is unit-testable.
 */
export function evaluateLiveness(frames: LivenessFrame[]): LivenessProgress {
  const ears = frames
    .map(frame => frame.ear)
    .filter((value): value is number => value !== null);
  const yaws = frames
    .map(frame => frame.yawRatio)
    .filter((value): value is number => value !== null);

  const sawOpen = ears.some(ear => ear >= EAR_OPEN);
  const sawClosed = ears.some(ear => ear <= EAR_CLOSED);
  const blinkSeen = sawOpen && sawClosed;

  const maxYaw = yaws.reduce((max, yaw) => Math.max(max, Math.abs(yaw)), 0);
  const headTurnSeen = maxYaw >= HEAD_TURN_RATIO;

  const signal: LivenessSignal | null = blinkSeen
    ? 'BLINK'
    : headTurnSeen
      ? 'HEAD_TURN'
      : null;

  // Progress hint: how far toward either signal we are.
  const blinkProgress = sawOpen && sawClosed ? 1 : sawOpen || sawClosed ? 0.5 : 0;
  const headProgress = Math.min(1, maxYaw / HEAD_TURN_RATIO);

  return {
    blinkSeen,
    headTurnSeen,
    passed: signal !== null,
    progress: Math.max(blinkProgress, headProgress),
    signal,
  };
}

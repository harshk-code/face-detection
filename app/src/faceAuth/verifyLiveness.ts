import type {
  MediaPipeFaceMeshLandmark,
  MediaPipeFaceMeshResult,
} from '../native/MediaPipeFaceMesh';

/**
 * Offline liveness signals for the login (verify) flow, computed from a
 * MediaPipe FaceMesh result. Four independent, scale-invariant challenges, each
 * detected from a *temporal change* in face geometry that a static photo or a
 * replayed still frame cannot reproduce:
 *
 *  - BLINK: eye-aspect-ratio (EAR) crosses from open to closed.
 *  - SMILE: mouth-width ratio crosses from neutral to widened.
 *  - TURN_LEFT / TURN_RIGHT: signed nose offset from the eye-centre line passes
 *    the turn threshold in the requested direction.
 *
 * To resist replay attacks the verify screen picks ONE challenge at random per
 * attempt (`pickLivenessChallenge`) and only that challenge is accepted
 * (`evaluateLiveness(frames, challenge)`). A recording of yesterday's blink no
 * longer satisfies a prompt that today asks for a right head-turn.
 *
 * The thresholds below are tuned for typical front-camera framing; the blink
 * and head-turn values are device-verified, while the SMILE band is new and may
 * want on-device tuning (it is exported for exactly that reason).
 */

// MediaPipe FaceMesh landmark indices.
const NOSE_TIP = 1;
const LEFT_EYE_OUTER = 33;
const RIGHT_EYE_OUTER = 263;
// Left eye (subject's left): outer 33, inner 133, top 159, bottom 145.
const LEFT_EYE = {bottom: 145, inner: 133, outer: 33, top: 159} as const;
// Right eye: outer 263, inner 362, top 386, bottom 374.
const RIGHT_EYE = {bottom: 374, inner: 362, outer: 263, top: 386} as const;
// Mouth corners: left 61, right 291.
const MOUTH_LEFT_CORNER = 61;
const MOUTH_RIGHT_CORNER = 291;

// Head-turn: |nose offset / eye distance| must exceed this to count as a turn.
export const HEAD_TURN_RATIO = 0.07;
// EAR thresholds: below CLOSED = eye shut, above OPEN = eye open. Observing
// both across the window means the eyelid actually moved (a blink).
export const EAR_CLOSED = 0.19;
export const EAR_OPEN = 0.27;
// Smile thresholds: mouth-width / inter-ocular distance. Below NEUTRAL = relaxed
// mouth, above ACTIVE = widened (smiling). Observing both across the window
// means the mouth actually widened — a constant value (a photo) never does.
export const SMILE_NEUTRAL = 0.5;
export const SMILE_ACTIVE = 0.58;

/** A backend-accepted liveness challenge, also used as the detected signal. */
export type LivenessChallenge = 'BLINK' | 'SMILE' | 'TURN_LEFT' | 'TURN_RIGHT';

/** @deprecated alias kept for SDK back-compat — prefer {@link LivenessChallenge}. */
export type LivenessSignal = LivenessChallenge;

/** The pool the verify screen draws a random challenge from each attempt. */
export const LIVENESS_CHALLENGE_POOL: LivenessChallenge[] = [
  'BLINK',
  'SMILE',
  'TURN_LEFT',
  'TURN_RIGHT',
];

/**
 * Pick a random challenge for one verification attempt. `random` is injectable
 * so the choice is deterministic in tests; defaults to Math.random in the app.
 */
export function pickLivenessChallenge(
  random: () => number = Math.random,
): LivenessChallenge {
  const index = Math.min(
    LIVENESS_CHALLENGE_POOL.length - 1,
    Math.floor(random() * LIVENESS_CHALLENGE_POOL.length),
  );
  return LIVENESS_CHALLENGE_POOL[index];
}

/** Short, action-specific prompt to show the user for a challenge. */
export function challengePrompt(challenge: LivenessChallenge): string {
  switch (challenge) {
    case 'BLINK':
      return 'Blink to prove you are live';
    case 'SMILE':
      return 'Smile to prove you are live';
    case 'TURN_LEFT':
      return 'Turn your head slightly left to prove you are live';
    case 'TURN_RIGHT':
      return 'Turn your head slightly right to prove you are live';
  }
}

/**
 * Map a detected challenge to a backend-accepted challenge type. The backend's
 * `allowedChallenges` set is {BLINK, SMILE, TURN_LEFT, TURN_RIGHT, NOD,
 * FACE_PRESENT}; our four challenges are already in-vocabulary, so this is a
 * pass-through with a FACE_PRESENT fallback for the no-signal case. Sending an
 * out-of-vocabulary type would make the backend reject the sync event (and it
 * would never purge).
 */
export function livenessChallengeType(signal: LivenessChallenge | null): string {
  return signal ?? 'FACE_PRESENT';
}

export type LivenessFrame = {
  ear: number | null;
  smileRatio: number | null;
  yawRatio: number | null;
};

export type LivenessProgress = {
  /** Whether the required challenge has been satisfied. */
  passed: boolean;
  /** The challenge that was required this attempt. */
  challenge: LivenessChallenge;
  /** The detected signal (equals `challenge` once passed, else null). */
  signal: LivenessChallenge | null;
  /** 0..1 hint for the UI: progress toward the required challenge. */
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

/**
 * Scale-invariant smile ratio: mouth width (corner-to-corner) over inter-ocular
 * distance (outer eye corners). Inter-ocular distance is stable under smiling,
 * so a widening mouth raises the ratio. Null if landmarks are missing.
 */
export function mouthSmileRatio(
  faceMesh: MediaPipeFaceMeshResult,
): number | null {
  const leftCorner = point(faceMesh, MOUTH_LEFT_CORNER);
  const rightCorner = point(faceMesh, MOUTH_RIGHT_CORNER);
  const leftEye = point(faceMesh, LEFT_EYE_OUTER);
  const rightEye = point(faceMesh, RIGHT_EYE_OUTER);
  if (!leftCorner || !rightCorner || !leftEye || !rightEye) {
    return null;
  }
  const interOcular = distance(leftEye, rightEye);
  const denominator = Math.max(interOcular, faceMesh.bounds.width * 0.28, 1);
  return distance(leftCorner, rightCorner) / denominator;
}

/**
 * Signed, scale-invariant head-turn ratio (null if landmarks are missing).
 * Sign convention (image space): nose right of the eye-centre is positive and
 * reported as TURN_RIGHT; left is negative and reported as TURN_LEFT. The
 * front-camera preview may be mirrored on some devices — if a "turn right"
 * prompt is satisfied by turning left on-device, flip the mapping in
 * {@link evaluateLiveness}.
 */
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
    smileRatio: mouthSmileRatio(faceMesh),
    yawRatio: headTurnRatio(faceMesh),
  };
}

function values<T>(items: (T | null)[]): T[] {
  return items.filter((value): value is T => value !== null);
}

/** Was a low→high crossing observed for the given band across the window? */
function sawTransition(
  samples: number[],
  low: number,
  high: number,
): {below: boolean; above: boolean; crossed: boolean} {
  const below = samples.some(value => value <= low);
  const above = samples.some(value => value >= high);
  return {above, below, crossed: below && above};
}

/**
 * Evaluate accumulated frames against the ONE challenge required this attempt.
 * Pure function so it is unit-testable. Replay resistance comes from the caller
 * picking the challenge at random per attempt.
 */
export function evaluateLiveness(
  frames: LivenessFrame[],
  challenge: LivenessChallenge,
): LivenessProgress {
  const ears = values(frames.map(frame => frame.ear));
  const smiles = values(frames.map(frame => frame.smileRatio));
  const yaws = values(frames.map(frame => frame.yawRatio));

  let passed = false;
  let progress = 0;

  switch (challenge) {
    case 'BLINK': {
      const blink = sawTransition(ears, EAR_CLOSED, EAR_OPEN);
      passed = blink.crossed;
      progress = blink.crossed ? 1 : blink.below || blink.above ? 0.5 : 0;
      break;
    }
    case 'SMILE': {
      const smile = sawTransition(smiles, SMILE_NEUTRAL, SMILE_ACTIVE);
      passed = smile.crossed;
      progress = smile.crossed ? 1 : smile.below || smile.above ? 0.5 : 0;
      break;
    }
    case 'TURN_LEFT': {
      // Most-negative yaw seen, as a positive magnitude.
      const maxLeft = yaws.reduce((max, yaw) => Math.max(max, -yaw), 0);
      passed = maxLeft >= HEAD_TURN_RATIO;
      progress = Math.min(1, maxLeft / HEAD_TURN_RATIO);
      break;
    }
    case 'TURN_RIGHT': {
      const maxRight = yaws.reduce((max, yaw) => Math.max(max, yaw), 0);
      passed = maxRight >= HEAD_TURN_RATIO;
      progress = Math.min(1, maxRight / HEAD_TURN_RATIO);
      break;
    }
  }

  return {
    challenge,
    passed,
    progress,
    signal: passed ? challenge : null,
  };
}

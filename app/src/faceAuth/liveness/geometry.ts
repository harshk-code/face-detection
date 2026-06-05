/**
 * Landmark geometry for liveness — no extra ML model required. Signals are
 * derived from MediaPipe FaceMesh landmarks (normalized coordinates), so they
 * are scale-invariant and run on every mid-range phone.
 */

export type MeshPoint = {x: number; y: number; z?: number};
export type MeshLandmarks = Record<number, MeshPoint | undefined>;

/** MediaPipe FaceMesh landmark indices used by the geometry signals. */
export const MESH = {
  noseTip: 1,
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  mouthLeft: 61,
  mouthRight: 291,
  mouthTop: 13,
  mouthBottom: 14,
  // 6-point eye contours (outer, upper x2, inner, lower x2) for EAR.
  rightEye: [33, 160, 158, 133, 153, 144] as const,
  leftEye: [362, 385, 387, 263, 373, 380] as const,
} as const;

function dist(a: MeshPoint, b: MeshPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function require6(
  landmarks: MeshLandmarks,
  indices: readonly number[],
): MeshPoint[] | null {
  const points: MeshPoint[] = [];
  for (const index of indices) {
    const point = landmarks[index];
    if (!point) {
      return null;
    }
    points.push(point);
  }
  return points;
}

/** Eye Aspect Ratio for a 6-point eye [p1..p6]. High = open, low = closed. */
export function eyeAspectRatio(eye: MeshPoint[]): number {
  const [p1, p2, p3, p4, p5, p6] = eye;
  const horizontal = dist(p1, p4);
  if (horizontal === 0) {
    return 0;
  }
  return (dist(p2, p6) + dist(p3, p5)) / (2 * horizontal);
}

/** Mean EAR across both eyes, or null if landmarks are missing. */
export function blinkEAR(landmarks: MeshLandmarks): number | null {
  const right = require6(landmarks, MESH.rightEye);
  const left = require6(landmarks, MESH.leftEye);
  if (!right || !left) {
    return null;
  }
  return (eyeAspectRatio(right) + eyeAspectRatio(left)) / 2;
}

/** Outer-eye-corner distance — the natural scale normalizer for the face. */
export function interocularDistance(landmarks: MeshLandmarks): number | null {
  const left = landmarks[MESH.leftEyeOuter];
  const right = landmarks[MESH.rightEyeOuter];
  if (!left || !right) {
    return null;
  }
  return dist(left, right);
}

/** Mouth width normalized by interocular distance — rises with a smile. */
export function smileRatio(landmarks: MeshLandmarks): number | null {
  const mouthLeft = landmarks[MESH.mouthLeft];
  const mouthRight = landmarks[MESH.mouthRight];
  const interocular = interocularDistance(landmarks);
  if (!mouthLeft || !mouthRight || !interocular || interocular === 0) {
    return null;
  }
  return dist(mouthLeft, mouthRight) / interocular;
}

/**
 * Signed yaw signal: nose offset from the eye midpoint, normalized by
 * interocular distance. ~0 looking straight; magnitude grows as the head turns.
 */
export function yawRatio(landmarks: MeshLandmarks): number | null {
  const nose = landmarks[MESH.noseTip];
  const left = landmarks[MESH.leftEyeOuter];
  const right = landmarks[MESH.rightEyeOuter];
  if (!nose || !left || !right) {
    return null;
  }
  const eyeMidX = (left.x + right.x) / 2;
  const interocular = dist(left, right);
  if (interocular === 0) {
    return 0;
  }
  return (nose.x - eyeMidX) / interocular;
}

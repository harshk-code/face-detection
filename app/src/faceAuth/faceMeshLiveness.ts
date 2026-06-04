export const FACE_MESH_LANDMARKS = {
  leftEyeCorner: 33,
  noseTip: 1,
  rightEyeCorner: 263,
} as const;

export const HEAD_TURN_LEFT_THRESHOLD_RATIO = 0.18;
export const HEAD_TURN_LEFT_THRESHOLD_PX = 25;

export type FaceMeshPoint = {
  x: number;
  y: number;
  z?: number;
};

export type FaceMeshLandmarks = Record<number, FaceMeshPoint | undefined>;

export type HeadTurnResult = {
  passed: boolean;
  yawOffset: number;
  yawOffsetRatio: number;
};

export function evaluateHeadTurnLeft(
  landmarks: FaceMeshLandmarks,
): HeadTurnResult {
  const nose = landmarks[FACE_MESH_LANDMARKS.noseTip];
  const leftEye = landmarks[FACE_MESH_LANDMARKS.leftEyeCorner];
  const rightEye = landmarks[FACE_MESH_LANDMARKS.rightEyeCorner];

  if (!nose || !leftEye || !rightEye) {
    return {
      passed: false,
      yawOffset: 0,
      yawOffsetRatio: 0,
    };
  }

  const faceCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeDistance = Math.max(Math.abs(rightEye.x - leftEye.x), 1);
  const yawOffset = nose.x - faceCenterX;
  const yawOffsetRatio = yawOffset / eyeDistance;

  return {
    passed: yawOffsetRatio >= HEAD_TURN_LEFT_THRESHOLD_RATIO,
    yawOffset,
    yawOffsetRatio,
  };
}

export function evaluateHeadTurnLeftInPixels(
  landmarks: FaceMeshLandmarks,
): HeadTurnResult {
  const result = evaluateHeadTurnLeft(landmarks);

  return {
    ...result,
    passed: result.yawOffset >= HEAD_TURN_LEFT_THRESHOLD_PX,
  };
}

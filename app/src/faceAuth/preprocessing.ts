import {FACE_AUTH_CONFIG} from './modelConfig';
import type {DetectedFaceSnapshot, NormalizedFaceCrop} from './types';
import {
  createNativeNormalizedFaceCrop,
  detectMediaPipeFaceMesh,
  type MediaPipeFaceMeshResult,
} from '../native/MediaPipeFaceMesh';
import {logInfo} from '../utils/logError';

type CreateFaceCropInput = {
  detectedFace?: DetectedFaceSnapshot | null;
  photoHeight: number;
  photoPath: string;
  photoWidth: number;
};

type CreateSquareFaceCropInput = {
  imageHeight: number;
  imageWidth: number;
  mediaPipeFaceMesh: MediaPipeFaceMeshResult;
};

export async function createNormalizedFaceCrop(
  input: CreateFaceCropInput,
): Promise<NormalizedFaceCrop> {
  if (input.detectedFace) {
    validateDetectedFace(input.detectedFace);
  }

  const mediaPipeFaceMesh = await detectMediaPipeFaceMesh(input.photoPath);
  const cropRect = createSquareFaceCrop({
    imageHeight: mediaPipeFaceMesh.imageHeight,
    imageWidth: mediaPipeFaceMesh.imageWidth,
    mediaPipeFaceMesh,
  });
  logInfo('face-auth:preprocess:crop-input', {
    cropRect,
    detectorFrame: input.detectedFace?.frameSize ?? null,
    faceBounds: input.detectedFace?.bounds ?? null,
    imageHeight: mediaPipeFaceMesh.imageHeight,
    imageWidth: mediaPipeFaceMesh.imageWidth,
    mediaPipeBounds: mediaPipeFaceMesh.bounds,
    mediaPipeImageHeight: mediaPipeFaceMesh.imageHeight,
    mediaPipeImageWidth: mediaPipeFaceMesh.imageWidth,
    mediaPipeLandmarkCount: mediaPipeFaceMesh.landmarks.length,
    mediaPipeLandmarkSample: mediaPipeFaceMesh.landmarks.slice(0, 6),
    mediaPipeRotationDegrees:
      mediaPipeFaceMesh.detectionRotationDegrees ?? null,
    photoHeight: input.photoHeight,
    photoPath: input.photoPath,
    photoWidth: input.photoWidth,
  });

  const nativeCrop = await createNativeNormalizedFaceCrop(
    input.photoPath,
    cropRect,
    FACE_AUTH_CONFIG.inputWidth,
    FACE_AUTH_CONFIG.inputHeight,
  );
  logInfo('face-auth:preprocess:raw-pixels', {
    byteLength: nativeCrop.byteLength,
    height: nativeCrop.height,
    pixelFormat: nativeCrop.pixelFormat,
    targetHeight: FACE_AUTH_CONFIG.inputHeight,
    targetWidth: FACE_AUTH_CONFIG.inputWidth,
    width: nativeCrop.width,
  });

  const normalizedRgb = Float32Array.from(nativeCrop.normalizedRgb);
  logInfo('face-auth:preprocess:tensor', {
    inputHeight: FACE_AUTH_CONFIG.inputHeight,
    inputWidth: FACE_AUTH_CONFIG.inputWidth,
    rawHeight: nativeCrop.height,
    rawWidth: nativeCrop.width,
    sample: Array.from(normalizedRgb.slice(0, 12)),
    stats: getTensorStats(normalizedRgb),
    values: normalizedRgb.length,
  });

  return {
    height: FACE_AUTH_CONFIG.inputHeight,
    normalizedRgb,
    sourcePhotoPath: input.photoPath,
    width: FACE_AUTH_CONFIG.inputWidth,
  };
}

export function normalizeRgbPixel(value: number) {
  return (value - FACE_AUTH_CONFIG.normalizeMean) / FACE_AUTH_CONFIG.normalizeStd;
}

function validateDetectedFace(face: DetectedFaceSnapshot) {
  if (face.bounds.width <= 0 || face.bounds.height <= 0) {
    throw new Error('Invalid detected face bounds.');
  }

  if (face.frameSize.width <= 0 || face.frameSize.height <= 0) {
    throw new Error('Invalid face detector frame size.');
  }
}

function createSquareFaceCrop(input: CreateSquareFaceCropInput) {
  const landmarkCrop = createLandmarkAlignedFaceCrop(input);

  if (landmarkCrop) {
    return landmarkCrop;
  }

  const {bounds} = input.mediaPipeFaceMesh;
  const scaleX = input.imageWidth / input.mediaPipeFaceMesh.imageWidth;
  const scaleY = input.imageHeight / input.mediaPipeFaceMesh.imageHeight;
  const faceX = bounds.x * scaleX;
  const faceY = bounds.y * scaleY;
  const faceWidth = bounds.width * scaleX;
  const faceHeight = bounds.height * scaleY;
  const centerX = faceX + faceWidth / 2;
  const centerY = faceY + faceHeight / 2;
  const side = Math.max(faceWidth, faceHeight) * 1.55;
  const boundedSide = Math.min(side, input.imageWidth, input.imageHeight);
  const startX = clamp(centerX - boundedSide / 2, 0, input.imageWidth - boundedSide);
  const startY = clamp(centerY - boundedSide / 2, 0, input.imageHeight - boundedSide);

  return {
    endX: Math.round(startX + boundedSide),
    endY: Math.round(startY + boundedSide),
    strategy: 'mesh-bounds',
    startX: Math.round(startX),
    startY: Math.round(startY),
  };
}

function createLandmarkAlignedFaceCrop(input: CreateSquareFaceCropInput) {
  const leftEyeOuter = getScaledLandmark(input, 33);
  const rightEyeOuter = getScaledLandmark(input, 263);
  const leftMouth = getScaledLandmark(input, 61);
  const rightMouth = getScaledLandmark(input, 291);
  const chin = getScaledLandmark(input, 152);
  const forehead = getScaledLandmark(input, 10);

  if (
    !leftEyeOuter ||
    !rightEyeOuter ||
    !leftMouth ||
    !rightMouth ||
    !chin ||
    !forehead
  ) {
    return null;
  }

  const eyeCenter = midpoint(leftEyeOuter, rightEyeOuter);
  const mouthCenter = midpoint(leftMouth, rightMouth);
  const eyeDistance = distance(leftEyeOuter, rightEyeOuter);
  const eyeToMouthDistance = distance(eyeCenter, mouthCenter);
  const faceHeight = Math.abs(chin.y - forehead.y);
  const side = Math.max(
    eyeDistance / 0.38,
    eyeToMouthDistance / 0.34,
    faceHeight * 1.12,
  );
  const boundedSide = Math.min(side, input.imageWidth, input.imageHeight);
  const startX = clamp(
    eyeCenter.x - boundedSide * 0.5,
    0,
    input.imageWidth - boundedSide,
  );
  const startY = clamp(
    eyeCenter.y - boundedSide * 0.38,
    0,
    input.imageHeight - boundedSide,
  );

  return {
    endX: Math.round(startX + boundedSide),
    endY: Math.round(startY + boundedSide),
    strategy: 'landmark-eye-mouth',
    startX: Math.round(startX),
    startY: Math.round(startY),
  };
}

function getScaledLandmark(
  input: CreateSquareFaceCropInput,
  landmarkIndex: number,
) {
  const landmark = input.mediaPipeFaceMesh.landmarks.find(
    item => item.index === landmarkIndex,
  );

  if (!landmark) {
    return null;
  }

  return {
    x:
      landmark.x *
      (input.imageWidth / input.mediaPipeFaceMesh.imageWidth),
    y:
      landmark.y *
      (input.imageHeight / input.mediaPipeFaceMesh.imageHeight),
  };
}

function midpoint(
  first: {x: number; y: number},
  second: {x: number; y: number},
) {
  return {
    x: (first.x + second.x) / 2,
    y: (first.y + second.y) / 2,
  };
}

function distance(
  first: {x: number; y: number},
  second: {x: number; y: number},
) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getTensorStats(values: Float32Array) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }

  return {
    max: Number(max.toFixed(6)),
    mean: Number((sum / values.length).toFixed(6)),
    min: Number(min.toFixed(6)),
  };
}

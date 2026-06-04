import {NativeModules} from 'react-native';

export type MediaPipeFaceMeshLandmark = {
  index: number;
  normalizedX: number;
  normalizedY: number;
  x: number;
  y: number;
  z: number;
};

export type MediaPipeFaceMeshResult = {
  bounds: {
    height: number;
    width: number;
    x: number;
    y: number;
  };
  detectionRotationDegrees?: number;
  imageHeight: number;
  imageWidth: number;
  landmarks: MediaPipeFaceMeshLandmark[];
};

export type NativeNormalizedFaceCrop = {
  byteLength: number;
  height: number;
  normalizedRgb: number[];
  pixelFormat: 'RGB';
  width: number;
};

type MediaPipeFaceMeshModule = {
  detectFaceMesh: (imagePath: string) => Promise<MediaPipeFaceMeshResult>;
  createNormalizedFaceCrop: (
    imagePath: string,
    crop: {endX: number; endY: number; startX: number; startY: number},
    targetWidth: number,
    targetHeight: number,
  ) => Promise<NativeNormalizedFaceCrop>;
};

const nativeMediaPipeFaceMesh = NativeModules.MediaPipeFaceMesh as
  | MediaPipeFaceMeshModule
  | undefined;

export async function detectMediaPipeFaceMesh(imagePath: string) {
  if (!nativeMediaPipeFaceMesh) {
    throw new Error(
      'MediaPipeFaceMesh native module is not available. Rebuild the native app after installing MediaPipe.',
    );
  }

  return nativeMediaPipeFaceMesh.detectFaceMesh(imagePath);
}

export async function createNativeNormalizedFaceCrop(
  imagePath: string,
  crop: {endX: number; endY: number; startX: number; startY: number},
  targetWidth: number,
  targetHeight: number,
) {
  if (!nativeMediaPipeFaceMesh?.createNormalizedFaceCrop) {
    throw new Error(
      'MediaPipeFaceMesh crop native method is not available. Rebuild the native app after adding the native crop pipeline.',
    );
  }

  return nativeMediaPipeFaceMesh.createNormalizedFaceCrop(
    imagePath,
    crop,
    targetWidth,
    targetHeight,
  );
}

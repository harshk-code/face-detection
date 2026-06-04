export type FaceEmbedding = {
  vector: number[];
  modelVersion: string;
};

export type NormalizedFaceCrop = {
  height: 112;
  normalizedRgb: Float32Array;
  sourcePhotoPath: string;
  width: 112;
};

export type CapturedFacePhoto = {
  path: string;
  photoHeight: number;
  photoWidth: number;
};

export type Point2D = {
  x: number;
  y: number;
};

export type FaceLandmarkSnapshot = {
  leftCheek?: Point2D;
  leftEar?: Point2D;
  leftEye?: Point2D;
  mouthBottom?: Point2D;
  mouthLeft?: Point2D;
  mouthRight?: Point2D;
  noseBase?: Point2D;
  rightCheek?: Point2D;
  rightEar?: Point2D;
  rightEye?: Point2D;
};

export type DetectedFaceSnapshot = {
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  frameSize: {
    width: number;
    height: number;
  };
  landmarks?: FaceLandmarkSnapshot;
  leftEyeOpenProbability?: number;
  rightEyeOpenProbability?: number;
  smilingProbability?: number;
  pitchAngle: number;
  rollAngle: number;
  yawAngle: number;
};

export type FaceTemplate = {
  templateId: string;
  personnelId: string;
  displayName: string;
  embedding: number[];
  modelVersion: string;
  threshold: number;
  createdAt: string;
};

export type RegisterFaceTemplateRequest = {
  personnelId: string;
  displayName: string;
  embedding: FaceEmbedding;
  modelVersion: string;
};

export type RegisterFaceTemplateResponse = {
  templateId: string;
  threshold: number;
};

export type FaceMatchResult = {
  matched: boolean;
  score: number;
  threshold: number;
};

export type PendingAuthRecord = {
  id: string;
  personnelId: string;
  capturedAt: string;
  result: 'authenticated' | 'rejected';
  similarityScore: number;
  syncedAt?: string;
};

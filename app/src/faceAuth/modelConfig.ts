export const FACE_AUTH_MODEL_VERSION = 'mobilefacenet_arcface_w600k_fp16_v1';

export const FACE_AUTH_CONFIG = {
  embeddingSize: 512,
  inputChannels: 3,
  inputHeight: 112,
  inputWidth: 112,
  modelAssetName: 'w600k_mbf_float16.tflite',
  modelVersion: FACE_AUTH_MODEL_VERSION,
  normalizeMean: 127.5,
  normalizeStd: 128,
  similarityThreshold: 0.60,
} as const;

export const FACE_AUTH_ASSET_PATHS = {
  androidAssetPath: 'models/w600k_mbf_float16.tflite',
  iosBundlePath: 'Models/w600k_mbf_float16.tflite',
  jsAssetPath: 'src/assets/models/w600k_mbf_float16.tflite',
} as const;

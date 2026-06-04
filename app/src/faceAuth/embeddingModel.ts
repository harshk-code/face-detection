import {FACE_AUTH_CONFIG} from './modelConfig';
import type {FaceEmbedding, NormalizedFaceCrop} from './types';
import {logError, logInfo} from '../utils/logError';

type TensorflowLiteModel = {
  inputs?: Array<{
    dataType: string;
    shape: number[];
  }>;
  outputs?: Array<{
    dataType: string;
    shape: number[];
  }>;
  run: (inputs: TensorInput[]) => Promise<TensorInput[]>;
  runSync?: (inputs: TensorInput[]) => TensorInput[];
};

type FastTfliteModule = {
  loadTensorflowModel: (
    asset: unknown,
    delegate?: 'default' | 'metal' | 'core-ml' | 'nnapi' | 'android-gpu',
  ) => Promise<TensorflowLiteModel>;
};

type TensorInput =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

let mobileFaceNetModelPromise: Promise<TensorflowLiteModel> | null = null;

export async function generateFaceEmbedding(
  crop: NormalizedFaceCrop,
): Promise<FaceEmbedding> {
  validateFaceCrop(crop);

  const vector = await runMobileFaceNet(crop.normalizedRgb);

  if (vector.length !== FACE_AUTH_CONFIG.embeddingSize) {
    throw new Error(
      `MobileFaceNet returned ${vector.length} values; expected ${FACE_AUTH_CONFIG.embeddingSize}.`,
    );
  }

  return {
    modelVersion: FACE_AUTH_CONFIG.modelVersion,
    vector: l2Normalize(vector),
  };
}

async function runMobileFaceNet(normalizedRgb: Float32Array): Promise<number[]> {
  const model = await loadMobileFaceNetModel();
  logInfo('face-auth:tflite:run', {
    inputByteLength: normalizedRgb.byteLength,
    inputs: model.inputs,
    outputs: model.outputs,
  });

  const outputs = model.runSync
    ? model.runSync([normalizedRgb])
    : await model.run([normalizedRgb]);
  const embedding = outputs[0];

  if (!embedding) {
    throw new Error('MobileFaceNet did not return an embedding output.');
  }

  const vector = readOutputTensor(embedding, model.outputs?.[0]?.dataType);
  logInfo('face-auth:tflite:output', {
    byteLength: embedding.byteLength,
    outputDataType: model.outputs?.[0]?.dataType ?? 'float32-default',
    sample: vector.slice(0, 12),
    stats: getVectorStats(vector),
    values: vector.length,
  });

  return vector;
}

async function loadMobileFaceNetModel() {
  if (!mobileFaceNetModelPromise) {
    mobileFaceNetModelPromise = createMobileFaceNetModel();
  }

  return mobileFaceNetModelPromise;
}

async function createMobileFaceNetModel() {
  try {
    const {loadTensorflowModel} = requireFastTflite();
    const modelAsset = require('../assets/models/w600k_mbf_float16.tflite');
    logInfo('face-auth:tflite:load-model', {modelAsset});

    return loadTensorflowModel(modelAsset, 'default');
  } catch (error) {
    logError('face-auth:tflite:load-model-error', error);
    throw new Error(
      'react-native-fast-tflite is not installed or linked. Run yarn add react-native-fast-tflite, then run pods before using real MobileFaceNet verification.',
    );
  }
}

function requireFastTflite(): FastTfliteModule {
  return require('react-native-fast-tflite') as FastTfliteModule;
}

function readOutputTensor(tensor: TensorInput, dataType = 'float32') {
  if (dataType === 'float32') {
    return Array.from(tensor, Number);
  }

  if (dataType === 'float16') {
    return Array.from(tensor as Uint16Array, halfToFloat);
  }

  if (dataType === 'int8') {
    return Array.from(tensor as Int8Array);
  }

  if (dataType === 'uint8') {
    return Array.from(tensor as Uint8Array);
  }

  throw new Error(`Unsupported MobileFaceNet output tensor type: ${dataType}.`);
}

function halfToFloat(value: number) {
  /* eslint-disable no-bitwise */
  const sign = (value & 0x8000) ? -1 : 1;
  const exponent = (value >> 10) & 0x1f;
  const fraction = value & 0x03ff;
  /* eslint-enable no-bitwise */

  if (exponent === 0) {
    return sign * Math.pow(2, -14) * (fraction / 1024);
  }

  if (exponent === 31) {
    return fraction ? NaN : sign * Infinity;
  }

  return sign * Math.pow(2, exponent - 15) * (1 + fraction / 1024);
}

function validateFaceCrop(crop: NormalizedFaceCrop) {
  const expectedLength =
    FACE_AUTH_CONFIG.inputWidth *
    FACE_AUTH_CONFIG.inputHeight *
    FACE_AUTH_CONFIG.inputChannels;

  if (crop.width !== FACE_AUTH_CONFIG.inputWidth) {
    throw new Error(`Face crop width must be ${FACE_AUTH_CONFIG.inputWidth}.`);
  }

  if (crop.height !== FACE_AUTH_CONFIG.inputHeight) {
    throw new Error(`Face crop height must be ${FACE_AUTH_CONFIG.inputHeight}.`);
  }

  if (crop.normalizedRgb.length !== expectedLength) {
    throw new Error(
      `Face crop tensor has ${crop.normalizedRgb.length} values; expected ${expectedLength}.`,
    );
  }
}

function l2Normalize(vector: number[]) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  if (magnitude === 0) {
    throw new Error('MobileFaceNet returned an empty embedding.');
  }

  const normalized = vector.map(value => value / magnitude);
  logInfo('face-auth:embedding:normalized', {
    magnitude,
    sample: normalized.slice(0, 12),
    stats: getVectorStats(normalized),
    values: normalized.length,
  });

  return normalized;
}

function getVectorStats(values: number[]) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let nanCount = 0;

  for (const value of values) {
    if (Number.isNaN(value)) {
      nanCount += 1;
      continue;
    }

    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
  }

  const validCount = Math.max(values.length - nanCount, 1);

  return {
    max: Number(max.toFixed(6)),
    mean: Number((sum / validCount).toFixed(6)),
    min: Number(min.toFixed(6)),
    nanCount,
  };
}

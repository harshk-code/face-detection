/**
 * Device adapters that satisfy the SDK interfaces using the real native modules.
 * Kept separate from the facade so the core has no native imports.
 */
import {generateFaceEmbedding} from '../embeddingModel';
import {FACE_AUTH_MODEL_VERSION} from '../modelConfig';
import type {Embedder, FaceSample} from './interfaces';

/** Embedder backed by the on-device MobileFaceNet TFLite model. */
export class TfliteEmbedder implements Embedder {
  readonly modelVersion = FACE_AUTH_MODEL_VERSION;

  async embed(sample: FaceSample): Promise<number[]> {
    if (!sample.crop) {
      throw new Error('TfliteEmbedder requires a normalized face crop');
    }
    const embedding = await generateFaceEmbedding(sample.crop);
    return embedding.vector;
  }
}

/* eslint-disable no-bitwise -- intentional hashing / PRNG bit math */
/**
 * Deterministic test doubles so the SDK facade can be exercised end-to-end in
 * plain Node — no camera, TFLite, or native modules. Mirrors the reference
 * MockEmbedder (NHAIHackathon/packages/faceauth/src/embedder/embedder.ts).
 */
import {l2Normalize} from '../enrollment';
import type {Embedder, FaceSample} from './interfaces';

function hashSeed(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Produces a stable L2-normalized vector per `syntheticId`; `lightingSeed` adds
 * bounded jitter so multiple "frames" of the same identity differ slightly,
 * letting tests verify that averaging produces a robust template.
 */
export class MockEmbedder implements Embedder {
  readonly modelVersion = 'mock-embedder-v1';
  private readonly dim: number;
  private readonly noise: number;

  constructor(dim = 128, noise = 0.05) {
    this.dim = dim;
    this.noise = noise;
  }

  async embed(sample: FaceSample): Promise<number[]> {
    const id = sample.syntheticId ?? 'unknown';
    const base = mulberry32(hashSeed(id));
    const vector = new Array<number>(this.dim);
    for (let i = 0; i < this.dim; i += 1) {
      vector[i] = base() * 2 - 1;
    }
    if (sample.lightingSeed !== undefined && this.noise > 0) {
      const jitter = mulberry32(hashSeed(id) ^ (sample.lightingSeed >>> 0));
      for (let i = 0; i < this.dim; i += 1) {
        vector[i] += (jitter() * 2 - 1) * this.noise;
      }
    }
    return l2Normalize(vector);
  }
}

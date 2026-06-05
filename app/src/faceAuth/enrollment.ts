/**
 * Multi-frame enrollment: average several quality-gated face embeddings into one
 * robust template. A single frame over-fits to one pose/lighting; averaging L2-
 * normalized embeddings from a few good frames yields a stabler template.
 */

export const ENROLLMENT_CONFIG = {
  minFrames: 3,
  minQuality: 0.6, // 0..1 capture quality gate
} as const;

export type FrameQualitySignals = {
  /** Detected face width as a fraction of frame width (too small = far away). */
  faceWidthRatio: number;
  /** Mean luminance 0..1 (too dark/bright hurts the embedder). */
  brightness: number;
  /** How many of the expected mesh landmarks were detected (0..1). */
  landmarkCoverage: number;
};

/** Score a captured frame 0..1; below ENROLLMENT_CONFIG.minQuality is rejected. */
export function assessFrameQuality(signals: FrameQualitySignals): number {
  const sizeScore = clamp01(signals.faceWidthRatio / 0.4); // ~40% width = full
  const brightnessScore = 1 - Math.min(1, Math.abs(signals.brightness - 0.55) / 0.45);
  const coverageScore = clamp01(signals.landmarkCoverage);
  // Coverage is the hard gate; size and brightness shape the rest.
  return clamp01(coverageScore * (0.5 * sizeScore + 0.5 * brightnessScore));
}

export function l2Normalize(vector: number[]): number[] {
  let sumSquares = 0;
  for (const value of vector) {
    sumSquares += value * value;
  }
  const magnitude = Math.sqrt(sumSquares);
  if (magnitude === 0) {
    return vector.slice();
  }
  return vector.map(value => value / magnitude);
}

/**
 * Average L2-normalized embeddings and re-normalize the result. Throws on empty
 * input or dimension mismatch so callers fail loudly rather than store garbage.
 */
export function averageEmbeddings(embeddings: number[][]): number[] {
  if (embeddings.length === 0) {
    throw new Error('averageEmbeddings requires at least one embedding');
  }
  const dim = embeddings[0].length;
  const accumulator = new Array<number>(dim).fill(0);
  for (const embedding of embeddings) {
    if (embedding.length !== dim) {
      throw new Error(
        `embedding dimension mismatch: expected ${dim}, got ${embedding.length}`,
      );
    }
    const normalized = l2Normalize(embedding);
    for (let i = 0; i < dim; i += 1) {
      accumulator[i] += normalized[i];
    }
  }
  for (let i = 0; i < dim; i += 1) {
    accumulator[i] /= embeddings.length;
  }
  return l2Normalize(accumulator);
}

export type EnrollmentFrame = {
  embedding: number[];
  quality: number;
};

export type EnrollmentResult = {
  embedding: number[];
  framesUsed: number;
  framesRejected: number;
};

/**
 * Build a template from captured frames: drop frames below the quality gate,
 * require a minimum count, then average. Throws if too few good frames.
 */
export function buildEnrollmentTemplate(
  frames: EnrollmentFrame[],
  config: {minFrames?: number; minQuality?: number} = {},
): EnrollmentResult {
  const minFrames = config.minFrames ?? ENROLLMENT_CONFIG.minFrames;
  const minQuality = config.minQuality ?? ENROLLMENT_CONFIG.minQuality;

  const good = frames.filter(frame => frame.quality >= minQuality);
  if (good.length < minFrames) {
    throw new Error(
      `enrollment needs >= ${minFrames} frames at quality >= ${minQuality}; got ${good.length}`,
    );
  }
  return {
    embedding: averageEmbeddings(good.map(frame => frame.embedding)),
    framesUsed: good.length,
    framesRejected: frames.length - good.length,
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

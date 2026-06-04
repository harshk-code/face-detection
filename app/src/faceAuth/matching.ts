import type {FaceMatchResult, FaceTemplate} from './types';
import {FACE_AUTH_CONFIG} from './modelConfig';
import {logInfo} from '../utils/logError';

export function matchFaceEmbedding(
  liveEmbedding: number[],
  template: FaceTemplate,
): FaceMatchResult {
  const score = cosineSimilarity(liveEmbedding, template.embedding);
  const threshold = FACE_AUTH_CONFIG.similarityThreshold;
  const matched = score >= threshold;

  logInfo('face-auth:match', {
    live: getVectorSummary(liveEmbedding),
    matched,
    score: Number(score.toFixed(6)),
    stored: getVectorSummary(template.embedding),
    templateId: template.templateId,
    storedThreshold: template.threshold,
    threshold,
  });

  return {
    matched,
    score,
    threshold,
  };
}

export function cosineSimilarity(a: number[], b: number[]) {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index];
    magnitudeA += a[index] * a[index];
    magnitudeB += b[index] * b[index];
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}

function getVectorSummary(vector: number[]) {
  const magnitude = Math.sqrt(
    vector.reduce((sum, value) => sum + value * value, 0),
  );

  return {
    length: vector.length,
    magnitude: Number(magnitude.toFixed(6)),
    sample: vector.slice(0, 8).map(value => Number(value.toFixed(6))),
  };
}

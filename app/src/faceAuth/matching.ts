import type {FaceMatchResult, FaceTemplate} from './types';
import {FACE_AUTH_CONFIG} from './modelConfig';
import {logInfo} from '../utils/logError';

const POSE_SAMPLE_MATCH_THRESHOLD = 0.8;

export function matchFaceEmbedding(
  liveEmbedding: number[],
  template: FaceTemplate,
): FaceMatchResult {
  const centroidScore = cosineSimilarity(liveEmbedding, template.embedding);
  const sampleScores =
    template.enrollmentEmbeddings?.map(sample => ({
      pose: sample.pose,
      score: cosineSimilarity(liveEmbedding, sample.vector),
    })) ?? [];
  const bestSample = sampleScores.reduce<{
    pose: string | null;
    score: number;
  }>(
    (best, sample) => (sample.score > best.score ? sample : best),
    {pose: null, score: 0},
  );
  const score = Math.max(centroidScore, bestSample.score);
  const threshold = FACE_AUTH_CONFIG.similarityThreshold;
  const matched =
    centroidScore >= threshold ||
    bestSample.score >= POSE_SAMPLE_MATCH_THRESHOLD;

  logInfo('face-auth:match', {
    bestSamplePose: bestSample.pose,
    bestSampleScore: Number(bestSample.score.toFixed(6)),
    centroidScore: Number(centroidScore.toFixed(6)),
    live: getVectorSummary(liveEmbedding),
    matched,
    poseSampleThreshold: POSE_SAMPLE_MATCH_THRESHOLD,
    score: Number(score.toFixed(6)),
    sampleScores: sampleScores.map(sample => ({
      pose: sample.pose,
      score: Number(sample.score.toFixed(6)),
    })),
    stored: getVectorSummary(template.embedding),
    storedSampleCount: template.enrollmentEmbeddings?.length ?? 0,
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

export type RosterEntry = {
  templateId: string;
  personnelId: string;
  embedding: number[];
};

export type IdentifyResult = {
  personnelId: string | null;
  templateId: string | null;
  score: number;
  margin: number;
};

/**
 * Anti-look-alike margin for 1:N identification. The winner must beat the
 * runner-up by at least this much, otherwise the match is rejected as ambiguous.
 */
export const LOOKALIKE_MARGIN = 0.08;

/**
 * 1:N identification: pick the roster entry most similar to the live embedding.
 * Accept only if the best score clears the threshold AND beats the second-best
 * by LOOKALIKE_MARGIN — this defeats confident-but-wrong matches on look-alikes.
 */
export function identifyFace(
  liveEmbedding: number[],
  roster: RosterEntry[],
  options: {threshold?: number; margin?: number} = {},
): IdentifyResult {
  const threshold = options.threshold ?? FACE_AUTH_CONFIG.similarityThreshold;
  const margin = options.margin ?? LOOKALIKE_MARGIN;

  let best: {entry: RosterEntry; score: number} | null = null;
  let secondScore = -Infinity;

  for (const entry of roster) {
    const score = cosineSimilarity(liveEmbedding, entry.embedding);
    if (!best || score > best.score) {
      secondScore = best ? best.score : secondScore;
      best = {entry, score};
    } else if (score > secondScore) {
      secondScore = score;
    }
  }

  if (!best) {
    return {personnelId: null, templateId: null, score: 0, margin: 0};
  }

  const runnerUp = secondScore === -Infinity ? 0 : secondScore;
  const gap = best.score - runnerUp;
  const accepted = best.score >= threshold && gap >= margin;

  return {
    personnelId: accepted ? best.entry.personnelId : null,
    templateId: accepted ? best.entry.templateId : null,
    score: best.score,
    margin: gap,
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

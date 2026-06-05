import type {FaceMatchResult, FaceTemplate} from './types';
import {FACE_AUTH_CONFIG} from './modelConfig';
import {cosineSimilarity} from './vectorMath';
import {logInfo} from '../utils/logError';

const POSE_SAMPLE_MATCH_THRESHOLD = 0.8;

export function matchFaceEmbedding(
  liveEmbedding: number[],
  template: FaceTemplate,
): FaceMatchResult {
  const centroidScore = cosineSimilarity(liveEmbedding, template.embedding);
  const sampleScores = template.enrollmentEmbeddings?.map(sample => ({
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
    centroidScore >= threshold || bestSample.score >= POSE_SAMPLE_MATCH_THRESHOLD;

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

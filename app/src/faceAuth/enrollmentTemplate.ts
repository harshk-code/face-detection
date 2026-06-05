import type {EnrollmentEmbedding, FaceEmbedding} from './types';
import {cosineSimilarity, createCentroidEmbedding} from './vectorMath';
import {logInfo} from '../utils/logError';

const MIN_ACCEPTED_ENROLLMENT_SAMPLES = 2;
const MIN_SAMPLE_TO_CENTROID_SCORE = 0.55;

export function createEnrollmentFaceEmbedding(
  samples: EnrollmentEmbedding[],
): FaceEmbedding {
  if (!samples.length) {
    throw new Error('No enrollment samples were captured.');
  }

  if (samples.length === 1) {
    return {
      modelVersion: samples[0].modelVersion,
      samples,
      vector: samples[0].vector,
    };
  }

  const initialCentroid = createCentroidEmbedding(
    samples.map(sample => sample.vector),
  );
  const scoredSamples = samples.map(sample => ({
    ...sample,
    centroidScore: cosineSimilarity(sample.vector, initialCentroid),
  }));
  const acceptedSamples = scoredSamples.filter(
    sample => sample.centroidScore >= MIN_SAMPLE_TO_CENTROID_SCORE,
  );

  if (acceptedSamples.length < MIN_ACCEPTED_ENROLLMENT_SAMPLES) {
    logInfo('face-auth:onboard:sample-set-rejected', {
      minAcceptedEnrollmentSamples: MIN_ACCEPTED_ENROLLMENT_SAMPLES,
      minSampleToCentroidScore: MIN_SAMPLE_TO_CENTROID_SCORE,
      samples: scoredSamples.map(sample => ({
        centroidScore: Number(sample.centroidScore.toFixed(6)),
        pose: sample.pose,
      })),
    });
    throw new Error(
      'Captured face samples were inconsistent. Please keep the same face in frame.',
    );
  }

  const cleanSamples: EnrollmentEmbedding[] = acceptedSamples.map(
    ({centroidScore: _centroidScore, ...sample}) => sample,
  );
  const centroid = createCentroidEmbedding(
    cleanSamples.map(sample => sample.vector),
  );

  logInfo('face-auth:onboard:multi-sample-template', {
    acceptedSamples: cleanSamples.length,
    rejectedSamples: samples.length - cleanSamples.length,
    samples: scoredSamples.map(sample => ({
      accepted: sample.centroidScore >= MIN_SAMPLE_TO_CENTROID_SCORE,
      centroidScore: Number(sample.centroidScore.toFixed(6)),
      pose: sample.pose,
    })),
    vectorLength: centroid.length,
  });

  return {
    modelVersion: cleanSamples[0].modelVersion,
    samples: cleanSamples,
    vector: centroid,
  };
}

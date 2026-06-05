import {
  cosineSimilarity,
  identifyFace,
  matchFaceEmbedding,
  type RosterEntry,
} from '../src/faceAuth/matching';
import type {FaceTemplate} from '../src/faceAuth/types';

function template(embedding: number[]): FaceTemplate {
  return {
    templateId: 't1',
    personnelId: 'FIELD-001',
    displayName: 'Field One',
    embedding,
    modelVersion: 'm-v1',
    threshold: 0.69,
    createdAt: '2026-06-05T10:00:00.000Z',
  };
}

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors and 0 for orthogonal', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1, 6);
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0, 6);
  });

  it('returns 0 for mismatched lengths or zero vectors', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});

describe('matchFaceEmbedding', () => {
  it('matches above threshold and rejects below', () => {
    const t = template([1, 0, 0]);
    expect(matchFaceEmbedding([1, 0, 0], t).matched).toBe(true);
    expect(matchFaceEmbedding([0, 1, 0], t).matched).toBe(false);
  });
});

describe('identifyFace (1:N + look-alike margin)', () => {
  const roster: RosterEntry[] = [
    {templateId: 'ta', personnelId: 'A', embedding: [1, 0, 0]},
    {templateId: 'tb', personnelId: 'B', embedding: [0, 1, 0]},
    {templateId: 'tc', personnelId: 'C', embedding: [0, 0, 1]},
  ];

  it('identifies a clear winner', () => {
    const result = identifyFace([1, 0, 0], roster);
    expect(result.personnelId).toBe('A');
    expect(result.score).toBeCloseTo(1, 6);
  });

  it('rejects an ambiguous match within the look-alike margin', () => {
    // Equidistant between A and B -> winner barely beats runner-up.
    const result = identifyFace([1, 1, 0], roster, {threshold: 0.5, margin: 0.08});
    expect(result.personnelId).toBeNull();
    expect(result.margin).toBeLessThan(0.08);
  });

  it('rejects when the best score is below threshold', () => {
    // Equidistant from all axes -> cosine ~0.577 to each, below 0.69.
    const result = identifyFace([1, 1, 1], roster, {threshold: 0.69});
    expect(result.score).toBeLessThan(0.69);
    expect(result.personnelId).toBeNull();
  });

  it('returns an empty result for an empty roster', () => {
    expect(identifyFace([1, 0, 0], []).personnelId).toBeNull();
  });
});

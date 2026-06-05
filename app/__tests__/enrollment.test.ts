import {
  assessFrameQuality,
  averageEmbeddings,
  buildEnrollmentTemplate,
  l2Normalize,
} from '../src/faceAuth/enrollment';

describe('l2Normalize', () => {
  it('produces a unit vector', () => {
    const out = l2Normalize([3, 4]);
    const magnitude = Math.hypot(out[0], out[1]);
    expect(magnitude).toBeCloseTo(1, 6);
    expect(out).toEqual([0.6, 0.8]);
  });

  it('leaves a zero vector unchanged', () => {
    expect(l2Normalize([0, 0, 0])).toEqual([0, 0, 0]);
  });
});

describe('averageEmbeddings', () => {
  it('averages and re-normalizes to a unit vector', () => {
    const out = averageEmbeddings([
      [1, 0, 0],
      [0, 1, 0],
    ]);
    expect(Math.hypot(...out)).toBeCloseTo(1, 6);
    expect(out[0]).toBeCloseTo(out[1], 6); // symmetric inputs -> symmetric result
    expect(out[2]).toBeCloseTo(0, 6);
  });

  it('throws on empty input', () => {
    expect(() => averageEmbeddings([])).toThrow(/at least one/);
  });

  it('throws on dimension mismatch', () => {
    expect(() => averageEmbeddings([[1, 0], [1, 0, 0]])).toThrow(/dimension mismatch/);
  });
});

describe('assessFrameQuality', () => {
  it('rewards a well-sized, well-lit, fully-detected face', () => {
    const q = assessFrameQuality({
      faceWidthRatio: 0.4,
      brightness: 0.55,
      landmarkCoverage: 1,
    });
    expect(q).toBeGreaterThan(0.9);
  });

  it('hard-gates on missing landmarks', () => {
    const q = assessFrameQuality({
      faceWidthRatio: 0.4,
      brightness: 0.55,
      landmarkCoverage: 0,
    });
    expect(q).toBe(0);
  });

  it('penalizes a tiny, dark face', () => {
    const q = assessFrameQuality({
      faceWidthRatio: 0.05,
      brightness: 0.1,
      landmarkCoverage: 1,
    });
    expect(q).toBeLessThan(0.5);
  });
});

describe('buildEnrollmentTemplate', () => {
  it('drops low-quality frames and averages the rest', () => {
    const result = buildEnrollmentTemplate(
      [
        {embedding: [1, 0, 0], quality: 0.9},
        {embedding: [1, 0, 0], quality: 0.8},
        {embedding: [1, 0, 0], quality: 0.7},
        {embedding: [0, 1, 0], quality: 0.2}, // rejected
      ],
      {minFrames: 3, minQuality: 0.6},
    );
    expect(result.framesUsed).toBe(3);
    expect(result.framesRejected).toBe(1);
    expect(Math.hypot(...result.embedding)).toBeCloseTo(1, 6);
  });

  it('throws when too few frames pass the quality gate', () => {
    expect(() =>
      buildEnrollmentTemplate(
        [
          {embedding: [1, 0, 0], quality: 0.9},
          {embedding: [1, 0, 0], quality: 0.3},
        ],
        {minFrames: 3, minQuality: 0.6},
      ),
    ).toThrow(/needs >= 3 frames/);
  });
});

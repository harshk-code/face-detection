import {
  defaultThresholds,
  evaluatePairs,
  meetsTarget,
  type LabelledPair,
} from '../accuracyEval';

// A cleanly separable toy set: genuine pairs score high (~0.9), impostor pairs
// score low (~0.3). A threshold of 0.60 should perfectly separate them.
const SEPARABLE: LabelledPair[] = [
  {cosine: 0.92, same: true},
  {cosine: 0.88, same: true},
  {cosine: 0.81, same: true},
  {cosine: 0.3, same: false},
  {cosine: 0.25, same: false},
  {cosine: 0.41, same: false},
];

describe('evaluatePairs', () => {
  it('throws on empty input (never reports vacuous accuracy)', () => {
    expect(() => evaluatePairs([])).toThrow();
  });

  it('counts genuine and impostor pairs', () => {
    const report = evaluatePairs(SEPARABLE, [0.6]);
    expect(report.genuinePairs).toBe(3);
    expect(report.impostorPairs).toBe(3);
  });

  it('achieves perfect separation at 0.60 on a separable set', () => {
    const report = evaluatePairs(SEPARABLE, [0.6]);
    const m = report.perThreshold[0];
    expect(m.far).toBe(0);
    expect(m.frr).toBe(0);
    expect(m.tar).toBe(1);
    expect(m.accuracy).toBe(1);
  });

  it('a too-high threshold rejects genuine pairs (FRR up, FAR 0)', () => {
    const report = evaluatePairs(SEPARABLE, [0.85]);
    const m = report.perThreshold[0];
    expect(m.far).toBe(0);
    expect(m.frr).toBeGreaterThan(0); // 0.81 and 0.88<0.85? -> 0.81 rejected, 0.88/0.92 accepted
  });

  it('a too-low threshold accepts impostors (FAR up, FRR 0)', () => {
    const report = evaluatePairs(SEPARABLE, [0.2]);
    const m = report.perThreshold[0];
    expect(m.frr).toBe(0);
    expect(m.far).toBeGreaterThan(0);
  });

  it('reports a best-accuracy operating point and an EER', () => {
    const report = evaluatePairs(SEPARABLE);
    expect(report.bestAccuracy).not.toBeNull();
    expect(report.bestAccuracy?.accuracy).toBe(1);
    expect(report.eer).not.toBeNull();
    expect(report.eer?.rate).toBe(0); // perfectly separable -> EER 0
  });

  it('default sweep spans 0.30..0.95', () => {
    const t = defaultThresholds();
    expect(t[0]).toBe(0.3);
    expect(t[t.length - 1]).toBe(0.95);
  });
});

describe('meetsTarget', () => {
  it('confirms >95% TAR at <=1% FAR is reachable on a separable set', () => {
    const report = evaluatePairs(SEPARABLE);
    const result = meetsTarget(report, 0.95, 0.01);
    expect(result.met).toBe(true);
    expect(result.at).not.toBeNull();
  });

  it('reports not-met when genuine/impostor distributions overlap fully', () => {
    const overlapping: LabelledPair[] = [
      {cosine: 0.5, same: true},
      {cosine: 0.5, same: false},
      {cosine: 0.5, same: true},
      {cosine: 0.5, same: false},
    ];
    const report = evaluatePairs(overlapping);
    // No threshold gives TAR>=0.95 AND FAR<=0.01 when scores are identical.
    expect(meetsTarget(report, 0.95, 0.01).met).toBe(false);
  });
});

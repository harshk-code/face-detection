/**
 * Offline accuracy-evaluation harness for the recognition model.
 *
 * The on-device pipeline (MediaPipe crop → MobileFaceNet TFLite → L2-normalized
 * 512-d embedding) is the source of embeddings; this module is the *analysis*
 * layer. Capture cosine scores for labelled face pairs (same-person vs
 * different-person), feed them here, and get FAR/FRR/TAR/accuracy at each
 * threshold plus the equal-error-rate (EER) operating point — the numbers the
 * Hackathon spec's ">95% accuracy" claim must be backed by.
 *
 * Pure + deterministic (no I/O, no native deps) so it is unit-testable and can
 * run in Node, a test, or a dev screen. See docs/ACCURACY_VALIDATION.md for how
 * to collect the labelled pairs and reproduce a study.
 */

/** One labelled comparison: cosine score + whether it is the same identity. */
export type LabelledPair = {
  cosine: number;
  same: boolean;
};

export type ThresholdMetrics = {
  threshold: number;
  /** False Accept Rate = impostor pairs accepted / total impostor pairs. */
  far: number;
  /** False Reject Rate = genuine pairs rejected / total genuine pairs. */
  frr: number;
  /** True Accept Rate = 1 − FRR. */
  tar: number;
  /** Overall accuracy = (correct accepts + correct rejects) / total. */
  accuracy: number;
  truePositives: number;
  falsePositives: number;
  trueNegatives: number;
  falseNegatives: number;
};

export type AccuracyReport = {
  genuinePairs: number;
  impostorPairs: number;
  perThreshold: ThresholdMetrics[];
  /** Threshold with the highest overall accuracy. */
  bestAccuracy: ThresholdMetrics | null;
  /** Threshold where FAR ≈ FRR (equal-error-rate operating point). */
  eer: {threshold: number; rate: number} | null;
};

/** Default threshold sweep: 0.30 … 0.95 in 0.01 steps. */
export function defaultThresholds(): number[] {
  const thresholds: number[] = [];
  for (let value = 30; value <= 95; value += 1) {
    thresholds.push(Number((value / 100).toFixed(2)));
  }
  return thresholds;
}

function metricsAtThreshold(
  pairs: LabelledPair[],
  threshold: number,
): ThresholdMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;

  for (const pair of pairs) {
    const accepted = pair.cosine >= threshold;
    if (pair.same) {
      if (accepted) {
        truePositives += 1;
      } else {
        falseNegatives += 1;
      }
    } else if (accepted) {
      falsePositives += 1;
    } else {
      trueNegatives += 1;
    }
  }

  const genuine = truePositives + falseNegatives;
  const impostor = trueNegatives + falsePositives;
  const total = pairs.length || 1;

  return {
    accuracy: (truePositives + trueNegatives) / total,
    falseNegatives,
    falsePositives,
    far: impostor === 0 ? 0 : falsePositives / impostor,
    frr: genuine === 0 ? 0 : falseNegatives / genuine,
    tar: genuine === 0 ? 0 : truePositives / genuine,
    threshold,
    trueNegatives,
    truePositives,
  };
}

/**
 * Evaluate labelled pairs across a threshold sweep.
 * Throws if there are no pairs (so a caller never reports vacuous "100%").
 */
export function evaluatePairs(
  pairs: LabelledPair[],
  thresholds: number[] = defaultThresholds(),
): AccuracyReport {
  if (pairs.length === 0) {
    throw new Error('evaluatePairs: no labelled pairs provided.');
  }

  const perThreshold = thresholds
    .map(threshold => metricsAtThreshold(pairs, threshold))
    .sort((a, b) => a.threshold - b.threshold);

  const bestAccuracy = perThreshold.reduce<ThresholdMetrics | null>(
    (best, current) =>
      best === null || current.accuracy > best.accuracy ? current : best,
    null,
  );

  // EER: the threshold minimizing |FAR − FRR|; rate is the mean of the two there.
  const eerPoint = perThreshold.reduce<ThresholdMetrics | null>(
    (best, current) =>
      best === null ||
      Math.abs(current.far - current.frr) < Math.abs(best.far - best.frr)
        ? current
        : best,
    null,
  );

  return {
    bestAccuracy,
    eer: eerPoint
      ? {rate: (eerPoint.far + eerPoint.frr) / 2, threshold: eerPoint.threshold}
      : null,
    genuinePairs: pairs.filter(pair => pair.same).length,
    impostorPairs: pairs.filter(pair => !pair.same).length,
    perThreshold,
  };
}

/** Convenience: does any swept threshold reach the target TAR at/under a FAR cap? */
export function meetsTarget(
  report: AccuracyReport,
  targetTar = 0.95,
  maxFar = 0.01,
): {met: boolean; at: ThresholdMetrics | null} {
  const candidates = report.perThreshold
    .filter(m => m.tar >= targetTar && m.far <= maxFar)
    .sort((a, b) => b.tar - a.tar);
  return {at: candidates[0] ?? null, met: candidates.length > 0};
}

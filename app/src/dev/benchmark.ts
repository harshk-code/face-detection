/**
 * Lightweight, dependency-free timing for on-device performance benchmarks.
 * Used by the (dev-only) Benchmark screen to measure the offline
 * recognition + liveness pipeline against the spec's "< 1 second" target.
 */

export type StageTimings = Record<string, number[]>;

export type StageSummary = {
  stage: string;
  count: number;
  min: number;
  median: number;
  p95: number;
  mean: number;
};

/** Time an async stage, pushing the elapsed ms into `timings[stage]`. */
export async function timeStage<T>(
  timings: StageTimings,
  stage: string,
  run: () => Promise<T>,
): Promise<T> {
  const start = Date.now();
  try {
    return await run();
  } finally {
    const elapsed = Date.now() - start;
    (timings[stage] ??= []).push(elapsed);
  }
}

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(fraction * sorted.length) - 1),
  );
  return sorted[index];
}

export function summarizeStage(stage: string, samples: number[]): StageSummary {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    count: sorted.length,
    mean: sorted.length ? Math.round(sum / sorted.length) : 0,
    median: percentile(sorted, 0.5),
    min: sorted.length ? sorted[0] : 0,
    p95: percentile(sorted, 0.95),
    stage,
  };
}

export function summarizeTimings(timings: StageTimings): StageSummary[] {
  return Object.keys(timings).map(stage =>
    summarizeStage(stage, timings[stage]),
  );
}

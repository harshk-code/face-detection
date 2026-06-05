# Accuracy Validation — methodology & reproducible harness

The spec requires **> 95% facial-recognition accuracy on diverse Indian demographics
and varying outdoor lighting**. This document states honestly what we can and cannot
claim today, and gives a **reproducible** procedure (plus a unit-tested harness) to
measure it.

## What we claim (and don't)

- **Model basis (cited, not our measurement):** recognition uses **MobileFaceNet +
  ArcFace** trained on **WebFace600K** (the InsightFace lineage). This model family
  reports **>99% verification accuracy on LFW-style benchmarks** in published work. We
  cite that as the basis for choosing it.
- **What we have NOT done:** we have **not** run our own FAR/FRR study on a labelled
  Indian-demographics / varied-lighting dataset. We therefore do **not** assert a
  measured ">95%" number of our own — doing so without a test set would be fabrication.
- **What we provide instead:** a clear, repeatable methodology and a pure, unit-tested
  analysis harness so the claim can be *measured and reproduced* on a real dataset.

## Operating point (current code)

- Embedding: 512-d, L2-normalized, cosine similarity.
- Per-frame match: `centroidScore ≥ 0.60` **OR** `bestPoseSample ≥ 0.80`.
- Login confirmation: 2 of last 3 frames match, **or** a single strong frame ≥ 0.82,
  **after** the offline liveness gate.
- All thresholds live in `app/src/faceAuth/modelConfig.ts` / `matching.ts`.

## How to run a real validation

1. **Collect a labelled set** representative of the target population (diverse Indian
   demographics) and conditions (harsh sunlight, low light, shadows, indoor). For each
   subject, capture an enrollment template and several probe images across conditions.
2. **Generate embeddings on-device** using the exact production pipeline
   (`generateFaceEmbedding` over a MediaPipe crop — see `app/src/faceAuth/sdk`), so the
   numbers reflect the real FP16 TFLite model, not a desktop re-implementation.
3. **Form pairs**: genuine pairs (same identity, different image/condition) and impostor
   pairs (different identities). Record each pair's cosine score and label.
4. **Analyze** with the harness `app/src/dev/accuracyEval.ts`:

   ```ts
   import {evaluatePairs, meetsTarget} from '../dev/accuracyEval';

   const pairs = [/* { cosine, same } collected from step 3 */];
   const report = evaluatePairs(pairs);          // FAR/FRR/TAR/accuracy per threshold + EER
   console.log(report.bestAccuracy, report.eer);
   console.log(meetsTarget(report, 0.95, 0.01)); // is >95% TAR @ ≤1% FAR reachable?
   ```

5. **Report**: the ROC/threshold table, the equal-error-rate (EER), and the threshold
   that achieves the required TAR at an acceptable FAR. Tune `similarityThreshold`
   accordingly and re-test.

## Harness guarantees

`accuracyEval.ts` is pure and deterministic (no I/O, no native deps) and unit-tested
(`src/dev/__tests__/accuracyEval.test.ts`):
- `evaluatePairs(pairs, thresholds?)` → per-threshold FAR/FRR/TAR/accuracy, `bestAccuracy`,
  and `eer`. **Throws on empty input** so a run can never report a vacuous "100%".
- `meetsTarget(report, targetTar, maxFar)` → whether the >95%-TAR-at-low-FAR target is met,
  and at which threshold.

## Honesty note

Until a labelled study is run, treat accuracy as **"model-reported >99% LFW; our own
FAR/FRR not yet measured."** This document + harness make closing that gap a measurement
exercise, not a code change.

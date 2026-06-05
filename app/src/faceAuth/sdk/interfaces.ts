/**
 * Dependency-injection seams for the FaceAuth SDK. The facade depends only on
 * these interfaces, so the math + orchestration are unit-testable in plain Node
 * (inject MockEmbedder / in-memory stores) and the device wiring swaps in the
 * real TFLite embedder + MediaPipe detector without touching the core.
 *
 * Mirrors NHAIHackathon/packages/faceauth/src/index.ts (FaceAuthDeps) adapted to
 * our still-capture pipeline.
 */
import type {NormalizedFaceCrop} from '../types';
import type {MeshLandmarks} from '../liveness/geometry';
import type {ChallengeType} from '../liveness/engine';
import type {AuthEventResult} from '../syncQueue';

/**
 * A face to embed. Device mode carries the normalized crop; test mode carries a
 * synthetic identity so a mock embedder can produce a stable, per-identity vector.
 */
export type FaceSample = {
  crop?: NormalizedFaceCrop;
  syntheticId?: string;
  lightingSeed?: number;
};

export interface Embedder {
  readonly modelVersion: string;
  embed(sample: FaceSample): Promise<number[]>;
}

/** A landmark frame in a liveness sequence. */
export type LivenessFrame = {landmarks: MeshLandmarks; ts: number};

export type AuthRequest = {
  /** The enrolled template embedding to verify against (1:1). */
  templateEmbedding: number[];
  /** Cosine threshold; defaults to the SDK's matcher threshold. */
  threshold?: number;
  challenge: ChallengeType;
  /** Ordered liveness frames (monotonic ts) gating the recognition. */
  frames: LivenessFrame[];
  sample: FaceSample;
};

export type AuthReason =
  | 'ok'
  | 'liveness-failed'
  | 'below-threshold'
  | 'no-template';

export type AuthOutcome = {
  livenessPassed: boolean;
  matched: boolean;
  score: number;
  result: AuthEventResult;
  reason: AuthReason;
  challenge: ChallengeType;
};

export type EnrollResult = {
  embedding: number[];
  modelVersion: string;
  framesUsed: number;
  framesRejected: number;
};

export type {ChallengeType, MeshLandmarks};

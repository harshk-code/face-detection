/**
 * FaceAuth SDK facade — the single orchestration surface for enrollment and
 * authentication. Depends only on injected interfaces (Embedder + configs), so
 * the full enroll -> liveness-gate -> embed -> match flow is testable without a
 * device. Mirrors NHAIHackathon/packages/faceauth/src/index.ts.
 */
import {averageEmbeddings, buildEnrollmentTemplate} from '../enrollment';
import {cosineSimilarity} from '../matching';
import {FACE_AUTH_CONFIG} from '../modelConfig';
import {
  LivenessEngine,
  type ChallengeType,
  type LivenessConfig,
} from '../liveness/engine';
import type {
  AuthOutcome,
  AuthRequest,
  Embedder,
  EnrollResult,
  FaceSample,
} from './interfaces';

export type FaceAuthDeps = {
  embedder: Embedder;
  livenessConfig?: Partial<LivenessConfig>;
  matcherThreshold?: number;
  /** Injectable RNG for deterministic challenge selection in tests. */
  rng?: () => number;
};

const CHALLENGES: ChallengeType[] = ['BLINK', 'SMILE', 'HEAD_TURN'];

export class FaceAuth {
  private readonly embedder: Embedder;
  private readonly livenessConfig?: Partial<LivenessConfig>;
  private readonly matcherThreshold: number;
  private readonly rng: () => number;

  constructor(deps: FaceAuthDeps) {
    this.embedder = deps.embedder;
    this.livenessConfig = deps.livenessConfig;
    this.matcherThreshold =
      deps.matcherThreshold ?? FACE_AUTH_CONFIG.similarityThreshold;
    this.rng = deps.rng ?? Math.random;
  }

  /** Pick a random liveness challenge for a session. */
  newChallenge(): ChallengeType {
    const index = Math.min(
      CHALLENGES.length - 1,
      Math.floor(this.rng() * CHALLENGES.length),
    );
    return CHALLENGES[index];
  }

  /**
   * Enroll from several face samples: embed each, drop low-quality frames when
   * qualities are provided, and average into one robust template embedding.
   */
  async enroll(
    samples: FaceSample[],
    qualities?: number[],
  ): Promise<EnrollResult> {
    if (samples.length === 0) {
      throw new Error('enroll needs at least one sample');
    }
    const embeddings: number[][] = [];
    for (const sample of samples) {
      embeddings.push(await this.embedder.embed(sample));
    }

    if (qualities) {
      const frames = embeddings.map((embedding, i) => ({
        embedding,
        quality: qualities[i] ?? 0,
      }));
      const built = buildEnrollmentTemplate(frames);
      return {
        embedding: built.embedding,
        modelVersion: this.embedder.modelVersion,
        framesUsed: built.framesUsed,
        framesRejected: built.framesRejected,
      };
    }

    return {
      embedding: averageEmbeddings(embeddings),
      modelVersion: this.embedder.modelVersion,
      framesUsed: embeddings.length,
      framesRejected: 0,
    };
  }

  /**
   * Authenticate (1:1): gate liveness first (spoofs are rejected before any
   * embedding work), then embed and match. Returns an explicit outcome with a
   * reason — the caller decides how to log/persist it.
   */
  async authenticate(req: AuthRequest): Promise<AuthOutcome> {
    if (req.templateEmbedding.length === 0) {
      return {
        livenessPassed: false,
        matched: false,
        score: 0,
        result: 'ERROR',
        reason: 'no-template',
        challenge: req.challenge,
      };
    }

    const livenessPassed = this.runLiveness(req.challenge, req.frames);
    if (!livenessPassed) {
      return {
        livenessPassed: false,
        matched: false,
        score: 0,
        result: 'LIVENESS_FAILED',
        reason: 'liveness-failed',
        challenge: req.challenge,
      };
    }

    const query = await this.embedder.embed(req.sample);
    const score = cosineSimilarity(query, req.templateEmbedding);
    const threshold = req.threshold ?? this.matcherThreshold;
    const matched = score >= threshold;

    return {
      livenessPassed: true,
      matched,
      score,
      result: matched ? 'SUCCESS' : 'FACE_FAILED',
      reason: matched ? 'ok' : 'below-threshold',
      challenge: req.challenge,
    };
  }

  /** Run a liveness challenge over a frame sequence; true once it PASSES. */
  runLiveness(
    challenge: ChallengeType,
    frames: AuthRequest['frames'],
  ): boolean {
    const engine = new LivenessEngine(this.livenessConfig);
    engine.issueChallenge(challenge);
    for (const frame of frames) {
      engine.update(frame.landmarks, frame.ts);
    }
    return engine.getState() === 'PASSED';
  }
}

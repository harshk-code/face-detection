/**
 * Randomized liveness challenge state machine. Defeats print/replay spoofs by
 * requiring a temporal gesture (blink / smile / head-turn) chosen at random per
 * session, within a time window, with bounded retries.
 */
import {blinkEAR, smileRatio, yawRatio, type MeshLandmarks} from './geometry';

export type ChallengeType = 'BLINK' | 'SMILE' | 'HEAD_TURN';
export const CHALLENGE_TYPES: ChallengeType[] = ['BLINK', 'SMILE', 'HEAD_TURN'];

export type LivenessState =
  | 'IDLE'
  | 'COLLECTING'
  | 'PASSED'
  | 'FAILED';

export type LivenessConfig = {
  earClosed: number; // EAR at/below this counts as a closed eye
  earOpen: number; // EAR at/above this counts as recovered (hysteresis)
  smileThreshold: number; // mouth-width / interocular above this = smiling
  smileHoldFrames: number; // consecutive smiling frames required
  yawTurn: number; // |yaw| beyond this = head turned
  yawCenter: number; // |yaw| within this = back at center
  windowMs: number; // time allowed per attempt
  maxAttempts: number; // attempts before terminal failure
};

export const DEFAULT_LIVENESS_CONFIG: LivenessConfig = {
  earClosed: 0.2,
  earOpen: 0.28,
  smileThreshold: 0.62,
  smileHoldFrames: 3,
  yawTurn: 0.12,
  yawCenter: 0.06,
  windowMs: 6000,
  maxAttempts: 2,
};

export type LivenessUpdate = {
  state: LivenessState;
  challenge: ChallengeType;
  passed: boolean;
  progress: number; // 0..1 elapsed within the current window
  failedReason?: 'max-attempts';
};

export function randomChallenge(rng: () => number = Math.random): ChallengeType {
  const index = Math.min(
    CHALLENGE_TYPES.length - 1,
    Math.floor(rng() * CHALLENGE_TYPES.length),
  );
  return CHALLENGE_TYPES[index];
}

export class LivenessEngine {
  private readonly config: LivenessConfig;
  private challenge: ChallengeType = 'BLINK';
  private state: LivenessState = 'IDLE';
  private attempts = 0;
  private startedAt: number | null = null;

  // Per-attempt progress trackers.
  private sawEyesClosed = false;
  private smileFrames = 0;
  private turnDirection: 0 | 1 | -1 = 0;

  constructor(config: Partial<LivenessConfig> = {}) {
    this.config = {...DEFAULT_LIVENESS_CONFIG, ...config};
  }

  issueChallenge(challenge: ChallengeType): void {
    this.challenge = challenge;
    this.state = 'COLLECTING';
    this.attempts = 1;
    this.startedAt = null;
    this.resetAttempt();
  }

  getState(): LivenessState {
    return this.state;
  }

  private resetAttempt(): void {
    this.sawEyesClosed = false;
    this.smileFrames = 0;
    this.turnDirection = 0;
  }

  update(landmarks: MeshLandmarks, ts: number): LivenessUpdate {
    if (this.state === 'PASSED' || this.state === 'FAILED') {
      return this.snapshot(1);
    }
    if (this.state === 'IDLE') {
      return this.snapshot(0);
    }
    if (this.startedAt === null) {
      this.startedAt = ts;
    }

    if (this.advance(landmarks)) {
      this.state = 'PASSED';
      return this.snapshot(1);
    }

    const elapsed = ts - this.startedAt;
    if (elapsed >= this.config.windowMs) {
      if (this.attempts < this.config.maxAttempts) {
        this.attempts += 1;
        this.startedAt = ts;
        this.resetAttempt();
        return this.snapshot(0);
      }
      this.state = 'FAILED';
      return {...this.snapshot(1), failedReason: 'max-attempts'};
    }

    const progress = Math.max(0, Math.min(1, elapsed / this.config.windowMs));
    return this.snapshot(progress);
  }

  /** Returns true once the active challenge's gesture is satisfied. */
  private advance(landmarks: MeshLandmarks): boolean {
    switch (this.challenge) {
      case 'BLINK':
        return this.advanceBlink(landmarks);
      case 'SMILE':
        return this.advanceSmile(landmarks);
      case 'HEAD_TURN':
        return this.advanceHeadTurn(landmarks);
      default:
        return false;
    }
  }

  private advanceBlink(landmarks: MeshLandmarks): boolean {
    const ear = blinkEAR(landmarks);
    if (ear === null) {
      return false;
    }
    if (ear <= this.config.earClosed) {
      this.sawEyesClosed = true;
    }
    // Pass only on recovery: closed -> open (a real blink, not a held photo).
    return this.sawEyesClosed && ear >= this.config.earOpen;
  }

  private advanceSmile(landmarks: MeshLandmarks): boolean {
    const ratio = smileRatio(landmarks);
    if (ratio === null) {
      this.smileFrames = 0;
      return false;
    }
    if (ratio >= this.config.smileThreshold) {
      this.smileFrames += 1;
    } else {
      this.smileFrames = 0;
    }
    return this.smileFrames >= this.config.smileHoldFrames;
  }

  private advanceHeadTurn(landmarks: MeshLandmarks): boolean {
    const yaw = yawRatio(landmarks);
    if (yaw === null) {
      return false;
    }
    if (this.turnDirection === 0) {
      if (yaw >= this.config.yawTurn) {
        this.turnDirection = 1;
      } else if (yaw <= -this.config.yawTurn) {
        this.turnDirection = -1;
      }
      return false;
    }
    // Pass on return to center after a real turn.
    return Math.abs(yaw) <= this.config.yawCenter;
  }

  private snapshot(progress: number): LivenessUpdate {
    return {
      state: this.state,
      challenge: this.challenge,
      passed: this.state === 'PASSED',
      progress,
    };
  }
}

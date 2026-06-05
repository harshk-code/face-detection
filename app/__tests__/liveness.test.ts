import {
  blinkEAR,
  smileRatio,
  yawRatio,
  type MeshLandmarks,
} from '../src/faceAuth/liveness/geometry';
import {
  LivenessEngine,
  randomChallenge,
  CHALLENGE_TYPES,
} from '../src/faceAuth/liveness/engine';

/**
 * Build a synthetic FaceMesh landmark map with controllable signals.
 *  - interocular distance is fixed at 1.0 (outer eye corners at x=0 and x=1)
 *  - EAR == `ear`, smileRatio == `smile`, yawRatio == `yaw`
 */
function buildFace({
  ear = 0.3,
  smile = 0.5,
  yaw = 0,
}: {ear?: number; smile?: number; yaw?: number}): MeshLandmarks {
  const v = 0.3 * ear; // vertical eye gap so EAR = v / 0.3 = ear
  const lm: MeshLandmarks = {};
  // rightEye [33,160,158,133,153,144] across x in [0,0.3]
  lm[33] = {x: 0, y: 0};
  lm[160] = {x: 0.1, y: -v / 2};
  lm[144] = {x: 0.1, y: v / 2};
  lm[158] = {x: 0.2, y: -v / 2};
  lm[153] = {x: 0.2, y: v / 2};
  lm[133] = {x: 0.3, y: 0};
  // leftEye [362,385,387,263,373,380] across x in [0.7,1.0]
  lm[362] = {x: 0.7, y: 0};
  lm[385] = {x: 0.8, y: -v / 2};
  lm[380] = {x: 0.8, y: v / 2};
  lm[387] = {x: 0.9, y: -v / 2};
  lm[373] = {x: 0.9, y: v / 2};
  lm[263] = {x: 1.0, y: 0};
  // mouth: width = smile (interocular = 1)
  lm[61] = {x: 0.5 - smile / 2, y: 1.5};
  lm[291] = {x: 0.5 + smile / 2, y: 1.5};
  lm[13] = {x: 0.5, y: 1.4};
  lm[14] = {x: 0.5, y: 1.6};
  // nose: yaw = (nose.x - 0.5) / 1.0
  lm[1] = {x: 0.5 + yaw, y: 0.5};
  return lm;
}

describe('liveness geometry', () => {
  it('computes EAR equal to the configured eye gap', () => {
    expect(blinkEAR(buildFace({ear: 0.3}))!).toBeCloseTo(0.3, 5);
    expect(blinkEAR(buildFace({ear: 0.1}))!).toBeCloseTo(0.1, 5);
  });

  it('computes smile ratio as mouth-width / interocular', () => {
    expect(smileRatio(buildFace({smile: 0.7}))!).toBeCloseTo(0.7, 5);
  });

  it('computes signed yaw ratio', () => {
    expect(yawRatio(buildFace({yaw: 0.2}))!).toBeCloseTo(0.2, 5);
    expect(yawRatio(buildFace({yaw: -0.2}))!).toBeCloseTo(-0.2, 5);
  });

  it('returns null when landmarks are missing', () => {
    expect(blinkEAR({})).toBeNull();
    expect(smileRatio({})).toBeNull();
    expect(yawRatio({})).toBeNull();
  });
});

describe('LivenessEngine', () => {
  const fast = {windowMs: 1000, maxAttempts: 2};

  it('passes BLINK only after a close-then-open transition', () => {
    const engine = new LivenessEngine(fast);
    engine.issueChallenge('BLINK');
    expect(engine.update(buildFace({ear: 0.3}), 0).passed).toBe(false); // open
    expect(engine.update(buildFace({ear: 0.1}), 100).passed).toBe(false); // closed
    const result = engine.update(buildFace({ear: 0.3}), 200); // reopened
    expect(result.passed).toBe(true);
    expect(result.state).toBe('PASSED');
  });

  it('rejects a held-open photo for BLINK and fails after max attempts', () => {
    const engine = new LivenessEngine(fast);
    engine.issueChallenge('BLINK');
    // Eyes never close; push past both attempt windows.
    engine.update(buildFace({ear: 0.3}), 0);
    engine.update(buildFace({ear: 0.3}), 1000); // attempt 1 times out -> retry
    const result = engine.update(buildFace({ear: 0.3}), 2000); // attempt 2 times out
    expect(result.state).toBe('FAILED');
    expect(result.failedReason).toBe('max-attempts');
  });

  it('passes SMILE after enough sustained frames', () => {
    const engine = new LivenessEngine({...fast, smileHoldFrames: 3, smileThreshold: 0.62});
    engine.issueChallenge('SMILE');
    engine.update(buildFace({smile: 0.7}), 0);
    engine.update(buildFace({smile: 0.7}), 100);
    const result = engine.update(buildFace({smile: 0.7}), 200);
    expect(result.passed).toBe(true);
  });

  it('resets smile streak when the smile drops', () => {
    const engine = new LivenessEngine({...fast, smileHoldFrames: 3, smileThreshold: 0.62});
    engine.issueChallenge('SMILE');
    engine.update(buildFace({smile: 0.7}), 0);
    engine.update(buildFace({smile: 0.4}), 100); // neutral -> streak reset
    const result = engine.update(buildFace({smile: 0.7}), 200);
    expect(result.passed).toBe(false); // only one smiling frame since reset
  });

  it('passes HEAD_TURN on turn-then-return', () => {
    const engine = new LivenessEngine(fast);
    engine.issueChallenge('HEAD_TURN');
    expect(engine.update(buildFace({yaw: 0}), 0).passed).toBe(false);
    expect(engine.update(buildFace({yaw: 0.2}), 100).passed).toBe(false); // turned
    const result = engine.update(buildFace({yaw: 0.0}), 200); // returned
    expect(result.passed).toBe(true);
  });
});

describe('randomChallenge', () => {
  it('picks deterministically from a seeded rng', () => {
    expect(randomChallenge(() => 0)).toBe(CHALLENGE_TYPES[0]);
    expect(randomChallenge(() => 0.99)).toBe(CHALLENGE_TYPES[CHALLENGE_TYPES.length - 1]);
  });
});

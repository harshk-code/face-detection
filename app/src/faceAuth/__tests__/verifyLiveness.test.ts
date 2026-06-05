import {
  EAR_CLOSED,
  EAR_OPEN,
  HEAD_TURN_RATIO,
  LIVENESS_CHALLENGE_POOL,
  SMILE_ACTIVE,
  SMILE_NEUTRAL,
  challengePrompt,
  evaluateLiveness,
  livenessChallengeType,
  mouthSmileRatio,
  pickLivenessChallenge,
  sampleLivenessFrame,
  type LivenessChallenge,
  type LivenessFrame,
} from '../verifyLiveness';
import type {
  MediaPipeFaceMeshLandmark,
  MediaPipeFaceMeshResult,
} from '../../native/MediaPipeFaceMesh';

function frame(partial: Partial<LivenessFrame>): LivenessFrame {
  return {ear: null, smileRatio: null, yawRatio: null, ...partial};
}

function landmark(
  index: number,
  x: number,
  y: number,
): MediaPipeFaceMeshLandmark {
  return {index, normalizedX: x, normalizedY: y, x, y, z: 0};
}

// Build a synthetic FaceMesh from a sparse {index: [x, y]} map. Only the
// landmark indices the geometry helpers read need to be present.
function faceMeshFrom(
  points: Record<number, [number, number]>,
  boundsWidth = 200,
): MediaPipeFaceMeshResult {
  return {
    bounds: {height: boundsWidth, width: boundsWidth, x: 0, y: 0},
    imageHeight: 480,
    imageWidth: 640,
    landmarks: Object.entries(points).map(([index, [x, y]]) =>
      landmark(Number(index), x, y),
    ),
  };
}

describe('evaluateLiveness — required-challenge gating (replay resistance)', () => {
  it('passes BLINK only when an open→closed eyelid transition is observed', () => {
    const frames = [
      frame({ear: EAR_OPEN + 0.05}),
      frame({ear: EAR_CLOSED - 0.03}),
      frame({ear: EAR_OPEN + 0.05}),
    ];
    const result = evaluateLiveness(frames, 'BLINK');
    expect(result.passed).toBe(true);
    expect(result.signal).toBe('BLINK');
    expect(result.challenge).toBe('BLINK');
  });

  it('does NOT accept a blink when a different challenge (SMILE) was required', () => {
    const blinkFrames = [
      frame({ear: EAR_OPEN + 0.05}),
      frame({ear: EAR_CLOSED - 0.03}),
    ];
    const result = evaluateLiveness(blinkFrames, 'SMILE');
    expect(result.passed).toBe(false);
    expect(result.signal).toBeNull();
  });

  it('passes SMILE on a neutral→smile transition', () => {
    const frames = [
      frame({smileRatio: SMILE_NEUTRAL - 0.05}),
      frame({smileRatio: SMILE_ACTIVE + 0.05}),
    ];
    const result = evaluateLiveness(frames, 'SMILE');
    expect(result.passed).toBe(true);
    expect(result.signal).toBe('SMILE');
  });

  it('does NOT pass SMILE on a constant smiling face (static photo of a smile)', () => {
    const frames = Array.from({length: 6}, () =>
      frame({smileRatio: SMILE_ACTIVE + 0.05}),
    );
    const result = evaluateLiveness(frames, 'SMILE');
    expect(result.passed).toBe(false);
  });

  it('passes TURN_LEFT only on a left-direction turn and reports the direction', () => {
    const frames = [
      frame({yawRatio: 0.0}),
      frame({yawRatio: -(HEAD_TURN_RATIO + 0.03)}),
    ];
    const result = evaluateLiveness(frames, 'TURN_LEFT');
    expect(result.passed).toBe(true);
    expect(result.signal).toBe('TURN_LEFT');
  });

  it('does NOT accept a right turn when TURN_LEFT was required (direction preserved)', () => {
    const frames = [frame({yawRatio: HEAD_TURN_RATIO + 0.03})];
    const result = evaluateLiveness(frames, 'TURN_LEFT');
    expect(result.passed).toBe(false);
  });

  it('passes TURN_RIGHT only on a right-direction turn', () => {
    const right = evaluateLiveness(
      [frame({yawRatio: HEAD_TURN_RATIO + 0.03})],
      'TURN_RIGHT',
    );
    expect(right.passed).toBe(true);
    expect(right.signal).toBe('TURN_RIGHT');

    const left = evaluateLiveness(
      [frame({yawRatio: -(HEAD_TURN_RATIO + 0.03)})],
      'TURN_RIGHT',
    );
    expect(left.passed).toBe(false);
  });

  it('never passes any challenge for a static face / missing landmarks', () => {
    const staticFace = Array.from({length: 6}, () =>
      frame({ear: EAR_OPEN + 0.05, smileRatio: SMILE_NEUTRAL - 0.05, yawRatio: 0}),
    );
    for (const challenge of LIVENESS_CHALLENGE_POOL) {
      expect(evaluateLiveness(staticFace, challenge).passed).toBe(false);
    }
    const empty = [frame({}), frame({})];
    for (const challenge of LIVENESS_CHALLENGE_POOL) {
      expect(evaluateLiveness(empty, challenge).passed).toBe(false);
    }
  });
});

describe('pickLivenessChallenge — randomised per attempt', () => {
  it('only returns challenges from the pool', () => {
    expect(LIVENESS_CHALLENGE_POOL).toEqual(
      expect.arrayContaining(['BLINK', 'SMILE', 'TURN_LEFT', 'TURN_RIGHT']),
    );
    for (let i = 0; i < LIVENESS_CHALLENGE_POOL.length; i++) {
      const random = () => i / LIVENESS_CHALLENGE_POOL.length;
      expect(pickLivenessChallenge(random)).toBe(LIVENESS_CHALLENGE_POOL[i]);
    }
  });

  it('handles the random()===1 upper edge without going out of bounds', () => {
    expect(pickLivenessChallenge(() => 1)).toBe(
      LIVENESS_CHALLENGE_POOL[LIVENESS_CHALLENGE_POOL.length - 1],
    );
  });
});

describe('mouthSmileRatio — geometry', () => {
  // Outer eye corners 33/263 set the inter-ocular normaliser (width 100).
  const eyes: Record<number, [number, number]> = {33: [0, 0], 263: [100, 0]};

  it('is larger for a wide (smiling) mouth than a neutral one', () => {
    const neutral = mouthSmileRatio(
      faceMeshFrom({...eyes, 61: [30, 50], 291: [70, 50]}),
    );
    const smiling = mouthSmileRatio(
      faceMeshFrom({...eyes, 61: [20, 50], 291: [80, 50]}),
    );
    expect(neutral).not.toBeNull();
    expect(smiling).not.toBeNull();
    expect(smiling as number).toBeGreaterThan(neutral as number);
  });

  it('returns null when mouth-corner landmarks are missing', () => {
    expect(mouthSmileRatio(faceMeshFrom({...eyes}))).toBeNull();
  });

  it('sampleLivenessFrame populates ear, yawRatio and smileRatio', () => {
    const sample = sampleLivenessFrame(
      faceMeshFrom({
        1: [50, 25], // nose
        33: [0, 0],
        263: [100, 0],
        61: [30, 50],
        291: [70, 50],
        145: [30, 12],
        159: [30, 8],
        133: [20, 10],
        386: [70, 8],
        374: [70, 12],
        362: [80, 10],
      }),
    );
    expect(sample.smileRatio).not.toBeNull();
    expect(sample.yawRatio).not.toBeNull();
  });
});

describe('livenessChallengeType + challengePrompt', () => {
  it('passes a detected challenge straight through to the backend vocabulary', () => {
    expect(livenessChallengeType('BLINK')).toBe('BLINK');
    expect(livenessChallengeType('SMILE')).toBe('SMILE');
    expect(livenessChallengeType('TURN_LEFT')).toBe('TURN_LEFT');
    expect(livenessChallengeType('TURN_RIGHT')).toBe('TURN_RIGHT');
    expect(livenessChallengeType(null)).toBe('FACE_PRESENT');
  });

  it('gives a distinct, non-empty user prompt per challenge', () => {
    const prompts = (LIVENESS_CHALLENGE_POOL as LivenessChallenge[]).map(
      challengePrompt,
    );
    for (const prompt of prompts) {
      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
    }
    expect(new Set(prompts).size).toBe(prompts.length);
  });
});

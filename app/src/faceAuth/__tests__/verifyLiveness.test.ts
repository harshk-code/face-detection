import {
  EAR_CLOSED,
  EAR_OPEN,
  HEAD_TURN_RATIO,
  evaluateLiveness,
  livenessChallengeType,
  type LivenessFrame,
} from '../verifyLiveness';

function frame(
  ear: number | null,
  yawRatio: number | null = 0,
): LivenessFrame {
  return {ear, yawRatio};
}

describe('evaluateLiveness', () => {
  it('does not pass on a static face (constant open eyes, no turn)', () => {
    const frames = Array.from({length: 6}, () => frame(EAR_OPEN + 0.05, 0));
    const result = evaluateLiveness(frames);
    expect(result.passed).toBe(false);
    expect(result.signal).toBeNull();
  });

  it('passes on a blink (an open frame and a closed frame)', () => {
    const frames = [
      frame(EAR_OPEN + 0.05),
      frame(EAR_CLOSED - 0.03),
      frame(EAR_OPEN + 0.05),
    ];
    const result = evaluateLiveness(frames);
    expect(result.passed).toBe(true);
    expect(result.signal).toBe('BLINK');
  });

  it('passes on a head-turn beyond the ratio threshold', () => {
    const frames = [frame(EAR_OPEN, 0.01), frame(EAR_OPEN, HEAD_TURN_RATIO + 0.05)];
    const result = evaluateLiveness(frames);
    expect(result.passed).toBe(true);
    expect(result.signal).toBe('HEAD_TURN');
  });

  it('prefers BLINK when both signals are present', () => {
    const frames = [
      frame(EAR_OPEN, HEAD_TURN_RATIO + 0.1),
      frame(EAR_CLOSED - 0.02, 0),
    ];
    expect(evaluateLiveness(frames).signal).toBe('BLINK');
  });

  it('ignores frames with missing landmarks (null ear/yaw)', () => {
    const frames = [frame(null, null), frame(null, null)];
    const result = evaluateLiveness(frames);
    expect(result.passed).toBe(false);
  });
});

describe('livenessChallengeType', () => {
  it('maps signals to backend-accepted challenge types', () => {
    expect(livenessChallengeType('BLINK')).toBe('BLINK');
    expect(livenessChallengeType('HEAD_TURN')).toBe('TURN_LEFT');
    expect(livenessChallengeType(null)).toBe('FACE_PRESENT');
  });
});

import {
  FaceAuth,
  MockEmbedder,
  type FaceSample,
  type LivenessFrame,
} from '../src/faceAuth/sdk';
import {
  SyncQueue,
  createInMemoryEventStore,
  type SyncTransport,
} from '../src/faceAuth/syncQueue';
import type {MeshLandmarks} from '../src/faceAuth/liveness/geometry';

/** Minimal landmark frame with a controllable yaw (indices 1, 33, 263). */
function yawFrame(yaw: number, ts: number): LivenessFrame {
  const landmarks: MeshLandmarks = {
    33: {x: 0, y: 0}, // left eye outer
    263: {x: 1, y: 0}, // right eye outer -> interocular = 1, midpoint 0.5
    1: {x: 0.5 + yaw, y: 0.5}, // nose -> yawRatio = yaw
  };
  return {landmarks, ts};
}

/** A real head-turn: center -> turned -> back to center. */
const PASSING_HEAD_TURN: LivenessFrame[] = [
  yawFrame(0, 0),
  yawFrame(0.2, 100),
  yawFrame(0, 200),
];
/** A static face that never turns -> liveness never passes. */
const STATIC_FACE: LivenessFrame[] = [yawFrame(0, 0), yawFrame(0, 100)];

function sample(id: string, lightingSeed?: number): FaceSample {
  return {syntheticId: id, lightingSeed};
}

async function enrollTemplate(fa: FaceAuth, id: string): Promise<number[]> {
  const samples = [0, 1, 2, 3, 4].map(seed => sample(id, seed));
  const result = await fa.enroll(samples);
  return result.embedding;
}

describe('FaceAuth SDK (e2e via facade + mock embedder)', () => {
  const makeAuth = () => new FaceAuth({embedder: new MockEmbedder(128)});

  it('enroll then 1:1 verify with a real head-turn passes', async () => {
    const fa = makeAuth();
    const template = await enrollTemplate(fa, 'alice');

    const outcome = await fa.authenticate({
      templateEmbedding: template,
      challenge: 'HEAD_TURN',
      frames: PASSING_HEAD_TURN,
      sample: sample('alice', 9),
    });

    expect(outcome.livenessPassed).toBe(true);
    expect(outcome.matched).toBe(true);
    expect(outcome.result).toBe('SUCCESS');
    expect(outcome.score).toBeGreaterThan(0.9);
  });

  it('rejects a static face (no liveness) before recognition', async () => {
    const fa = makeAuth();
    const template = await enrollTemplate(fa, 'alice');

    const outcome = await fa.authenticate({
      templateEmbedding: template,
      challenge: 'HEAD_TURN',
      frames: STATIC_FACE,
      sample: sample('alice', 9),
    });

    expect(outcome.livenessPassed).toBe(false);
    expect(outcome.result).toBe('LIVENESS_FAILED');
    expect(outcome.reason).toBe('liveness-failed');
  });

  it('rejects the wrong person even with a real head-turn', async () => {
    const fa = makeAuth();
    const template = await enrollTemplate(fa, 'alice');

    const outcome = await fa.authenticate({
      templateEmbedding: template,
      challenge: 'HEAD_TURN',
      frames: PASSING_HEAD_TURN,
      sample: sample('mallory', 1),
    });

    expect(outcome.livenessPassed).toBe(true);
    expect(outcome.matched).toBe(false);
    expect(outcome.result).toBe('FACE_FAILED');
    expect(outcome.reason).toBe('below-threshold');
  });

  it('enroll drops low-quality frames when qualities are supplied', async () => {
    const fa = makeAuth();
    const samples = [0, 1, 2, 3].map(seed => sample('alice', seed));
    const result = await fa.enroll(samples, [0.9, 0.8, 0.7, 0.2]);
    expect(result.framesUsed).toBe(3);
    expect(result.framesRejected).toBe(1);
  });

  it('logs an outcome to the offline queue, then sync drains and purges', async () => {
    const fa = makeAuth();
    const template = await enrollTemplate(fa, 'alice');
    const outcome = await fa.authenticate({
      templateEmbedding: template,
      challenge: 'HEAD_TURN',
      frames: PASSING_HEAD_TURN,
      sample: sample('alice', 9),
    });

    const queue = new SyncQueue(createInMemoryEventStore());
    await queue.enqueue({
      eventId: 'evt-1',
      clientId: 'cli_1',
      capturedAt: '2026-06-05T10:00:00.000Z',
      faceScore: outcome.score,
      livenessScore: outcome.livenessPassed ? 1 : 0,
      challengeTypes: [outcome.challenge],
      result: outcome.result,
      threshold: 0.69,
      modelVersion: 'mock-embedder-v1',
      userId: 'alice',
      latencyMs: 120,
    });

    const transport: SyncTransport = {
      async syncEvents(_c, events) {
        return {acceptedEventIds: events.map(e => e.eventId), duplicateEventIds: []};
      },
      async purgeAck(_c, ids) {
        return {purgedEventIds: ids};
      },
    };
    const summary = await queue.flush('cli_1', transport);

    expect(summary.accepted).toBe(1);
    expect(summary.purged).toBe(1);
    expect(await queue.pendingCount()).toBe(0);
  });
});

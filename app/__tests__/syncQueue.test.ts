import {
  SyncQueue,
  createInMemoryEventStore,
  type QueuedAuthEvent,
  type SyncEventInput,
  type SyncTransport,
} from '../src/faceAuth/syncQueue';

function makeEvent(
  eventId: string,
  clientId = 'cli_1',
): SyncEventInput {
  return {
    eventId,
    clientId,
    capturedAt: '2026-06-05T10:00:00.000Z',
    faceScore: 0.9,
    result: 'SUCCESS',
    threshold: 0.69,
    modelVersion: 'm-v1',
    userId: 'u1',
    latencyMs: 120,
    liveness: {passed: true, type: 'BLINK'},
  };
}

/** Transport that accepts whatever is sent and purges whatever is acked. */
function happyTransport(): SyncTransport & {
  syncCalls: number;
  purgeCalls: number;
  received: Set<string>;
} {
  const received = new Set<string>();
  return {
    syncCalls: 0,
    purgeCalls: 0,
    received,
    async syncEvents(_clientId, events) {
      this.syncCalls += 1;
      const acceptedEventIds: string[] = [];
      const duplicateEventIds: string[] = [];
      for (const event of events) {
        if (received.has(event.eventId)) {
          duplicateEventIds.push(event.eventId);
        } else {
          received.add(event.eventId);
          acceptedEventIds.push(event.eventId);
        }
      }
      return {acceptedEventIds, duplicateEventIds};
    },
    async purgeAck(_clientId, eventIds) {
      this.purgeCalls += 1;
      return {purgedEventIds: eventIds};
    },
  };
}

describe('SyncQueue', () => {
  it('enqueues, syncs, and purges only after ack', async () => {
    const store = createInMemoryEventStore();
    const queue = new SyncQueue(store);
    const transport = happyTransport();

    await queue.enqueue(makeEvent('e1'));
    await queue.enqueue(makeEvent('e2'));
    expect(await queue.pendingCount()).toBe(2);

    const summary = await queue.flush('cli_1', transport);

    expect(summary).toEqual({attempted: 2, accepted: 2, purged: 2, remaining: 0});
    expect(await queue.pendingCount()).toBe(0);
    expect(transport.received).toEqual(new Set(['e1', 'e2']));
  });

  it('dedupes repeated enqueues of the same eventId', async () => {
    const store = createInMemoryEventStore();
    const queue = new SyncQueue(store);

    await queue.enqueue(makeEvent('e1'));
    await queue.enqueue(makeEvent('e1'));

    expect(await queue.pendingCount()).toBe(1);
  });

  it('keeps everything when the transport fails (offline)', async () => {
    const store = createInMemoryEventStore();
    const queue = new SyncQueue(store);
    const failing: SyncTransport = {
      async syncEvents() {
        throw new Error('network down');
      },
      async purgeAck() {
        throw new Error('network down');
      },
    };

    await queue.enqueue(makeEvent('e1'));
    await expect(queue.flush('cli_1', failing)).rejects.toThrow('network down');

    const all = await store.load();
    expect(all).toHaveLength(1);
    expect(all[0].synced).toBe(false);
  });

  it('marks only acked events synced on a partial accept', async () => {
    const store = createInMemoryEventStore();
    const queue = new SyncQueue(store, {batchSize: 10});
    const transport: SyncTransport = {
      async syncEvents(_c, events) {
        // Server only accepts the first event of the batch.
        return {acceptedEventIds: [events[0].eventId], duplicateEventIds: []};
      },
      async purgeAck(_c, ids) {
        return {purgedEventIds: ids};
      },
    };

    await queue.enqueue(makeEvent('e1'));
    await queue.enqueue(makeEvent('e2'));
    const summary = await queue.flush('cli_1', transport);

    expect(summary.accepted).toBe(1);
    expect(summary.purged).toBe(1);
    const remaining = await store.load();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].eventId).toBe('e2');
    expect(remaining[0].synced).toBe(false);
  });

  it('is idempotent: a re-sent event counts as a duplicate (no double-count)', async () => {
    const store = createInMemoryEventStore();
    const queue = new SyncQueue(store);
    const transport = happyTransport();

    await queue.enqueue(makeEvent('e1'));
    await queue.flush('cli_1', transport); // accepts + purges e1

    // Re-enqueue the same id (e.g. a retry the client thought failed).
    await queue.enqueue(makeEvent('e1'));
    const summary = await queue.flush('cli_1', transport);

    expect(transport.received.size).toBe(1); // server never double-stored e1
    expect(summary.purged).toBe(1);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('recovers from a crash between markSynced and purge', async () => {
    // Seed a store where e1 is already synced=true but was never purged
    // (simulating a crash after sync/events ack, before purge-ack).
    const seeded: QueuedAuthEvent = {...(makeEvent('e1') as QueuedAuthEvent), synced: true};
    const store = createInMemoryEventStore([seeded]);
    const queue = new SyncQueue(store);
    const transport = happyTransport();

    const summary = await queue.flush('cli_1', transport);

    expect(transport.syncCalls).toBe(0); // nothing unsynced to re-send
    expect(transport.purgeCalls).toBe(1); // purge-ack re-run for the leftover
    expect(summary.purged).toBe(1);
    expect(await queue.pendingCount()).toBe(0);
  });

  it('batches sync calls by batchSize', async () => {
    const store = createInMemoryEventStore();
    const queue = new SyncQueue(store, {batchSize: 2});
    const transport = happyTransport();

    for (let i = 0; i < 5; i += 1) {
      await queue.enqueue(makeEvent(`e${i}`));
    }
    await queue.flush('cli_1', transport);

    expect(transport.syncCalls).toBe(3); // 2 + 2 + 1
    expect(await queue.pendingCount()).toBe(0);
  });

  it('only flushes events belonging to the given client', async () => {
    const store = createInMemoryEventStore();
    const queue = new SyncQueue(store);
    const transport = happyTransport();

    await queue.enqueue(makeEvent('a1', 'cli_A'));
    await queue.enqueue(makeEvent('b1', 'cli_B'));
    const summary = await queue.flush('cli_A', transport);

    expect(summary.accepted).toBe(1);
    expect(transport.received).toEqual(new Set(['a1']));
    const remaining = await store.load();
    expect(remaining.map(e => e.eventId)).toEqual(['b1']);
  });
});

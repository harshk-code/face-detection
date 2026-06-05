/**
 * Crash-safe offline auth-event queue with ACK-before-purge semantics.
 *
 * Field devices operate in zero-network zones. Auth events must survive app
 * restarts and flaky connectivity, never be double-counted, and only be deleted
 * locally once the backend has durably accepted AND acknowledged a purge.
 *
 * Protocol (matches the Go backend):
 *   1. enqueue(event)                  -> stored locally, synced=false
 *   2. flush():
 *        a. POST /sync/events          -> { acceptedEventIds, duplicateEventIds }
 *           mark those ids synced=true (idempotent: duplicates count as synced)
 *        b. POST /sync/purge-ack       -> { purgedEventIds }
 *           delete only the purged ids locally
 *
 * Crash safety: a crash between (a) and (b) leaves events synced=true but not
 * deleted; the next flush re-runs purge-ack for all synced events. A crash
 * before (a) leaves them synced=false; they are re-sent and deduped by eventId.
 */

/** Matches the backend's accepted auth-event result values. */
export type AuthEventResult =
  | 'SUCCESS'
  | 'FACE_FAILED'
  | 'LIVENESS_FAILED'
  | 'ERROR';

export type QueuedAuthEvent = {
  eventId: string;
  clientId: string;
  capturedAt: string;
  faceScore: number;
  livenessScore: number;
  challengeTypes: string[];
  result: AuthEventResult;
  failureReason?: string;
  threshold: number;
  modelVersion: string;
  userId: string | null;
  latencyMs: number;
  synced: boolean;
};

export type SyncEventInput = Omit<QueuedAuthEvent, 'synced'>;

export type SyncEventsResponse = {
  acceptedEventIds?: string[];
  duplicateEventIds?: string[];
};

export type PurgeAckResponse = {
  purgedEventIds?: string[];
};

export interface SyncTransport {
  syncEvents(
    clientId: string,
    events: QueuedAuthEvent[],
  ): Promise<SyncEventsResponse>;
  purgeAck(clientId: string, eventIds: string[]): Promise<PurgeAckResponse>;
}

/**
 * Whole-array persistence: simple to back with a single encrypted JSON blob
 * (mirrors the FaceTemplateStore native pattern). The queue is small and capped.
 */
export interface EventStore {
  load(): Promise<QueuedAuthEvent[]>;
  save(events: QueuedAuthEvent[]): Promise<void>;
}

export type FlushSummary = {
  attempted: number;
  accepted: number;
  purged: number;
  remaining: number;
};

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_QUEUE = 500;

export class SyncQueue {
  private readonly store: EventStore;
  private readonly batchSize: number;
  private readonly maxQueue: number;
  private flushing = false;

  constructor(
    store: EventStore,
    options: {batchSize?: number; maxQueue?: number} = {},
  ) {
    this.store = store;
    this.batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
    this.maxQueue = options.maxQueue ?? DEFAULT_MAX_QUEUE;
  }

  /** Persist an event locally (synced=false). Deduped by eventId. */
  async enqueue(input: SyncEventInput): Promise<void> {
    const events = await this.store.load();
    if (events.some(event => event.eventId === input.eventId)) {
      return;
    }
    events.push({...input, synced: false});
    // Cap the queue: drop the oldest already-synced rows first, then oldest.
    while (events.length > this.maxQueue) {
      const dropIndex = events.findIndex(event => event.synced);
      events.splice(dropIndex === -1 ? 0 : dropIndex, 1);
    }
    await this.store.save(events);
  }

  async pendingCount(): Promise<number> {
    const events = await this.store.load();
    return events.length;
  }

  /**
   * Push unsynced events and purge acknowledged ones for a single client.
   * Safe to call repeatedly; a throwing transport leaves all events intact.
   */
  async flush(
    clientId: string,
    transport: SyncTransport,
  ): Promise<FlushSummary> {
    if (this.flushing) {
      const events = await this.store.load();
      return {attempted: 0, accepted: 0, purged: 0, remaining: events.length};
    }
    this.flushing = true;
    try {
      return await this.runFlush(clientId, transport);
    } finally {
      this.flushing = false;
    }
  }

  private async runFlush(
    clientId: string,
    transport: SyncTransport,
  ): Promise<FlushSummary> {
    let events = await this.store.load();
    const mine = (event: QueuedAuthEvent) => event.clientId === clientId;
    const unsynced = events.filter(event => mine(event) && !event.synced);

    let accepted = 0;
    for (let i = 0; i < unsynced.length; i += this.batchSize) {
      const batch = unsynced.slice(i, i + this.batchSize);
      const response = await transport.syncEvents(clientId, batch);
      const ackedIds = new Set([
        ...(response.acceptedEventIds ?? []),
        ...(response.duplicateEventIds ?? []),
      ]);
      if (ackedIds.size === 0) {
        continue;
      }
      events = (await this.store.load()).map(event =>
        ackedIds.has(event.eventId) ? {...event, synced: true} : event,
      );
      await this.store.save(events);
      accepted += ackedIds.size;
    }

    // Purge every synced event for this client (covers crash-recovery leftovers).
    const syncedIds = events
      .filter(event => mine(event) && event.synced)
      .map(event => event.eventId);

    let purged = 0;
    if (syncedIds.length > 0) {
      const response = await transport.purgeAck(clientId, syncedIds);
      const purgedIds = new Set(response.purgedEventIds ?? []);
      if (purgedIds.size > 0) {
        events = (await this.store.load()).filter(
          event => !purgedIds.has(event.eventId),
        );
        await this.store.save(events);
        purged = purgedIds.size;
      }
    }

    return {
      attempted: unsynced.length,
      accepted,
      purged,
      remaining: events.length,
    };
  }
}

/** In-memory store for tests and as a fallback when native storage is absent. */
export function createInMemoryEventStore(
  seed: QueuedAuthEvent[] = [],
): EventStore {
  let data: QueuedAuthEvent[] = seed.map(event => ({...event}));
  return {
    async load() {
      return data.map(event => ({...event}));
    },
    async save(events: QueuedAuthEvent[]) {
      data = events.map(event => ({...event}));
    },
  };
}

/**
 * App-wide singleton wiring the SyncQueue to the encrypted native event store
 * and the real backend transport. This replaces fire-and-forget auth-event
 * posting with a crash-safe, retrying, ACK-before-purge queue.
 */
import {
  SyncQueue,
  type QueuedAuthEvent,
  type SyncEventInput,
  type SyncTransport,
} from './syncQueue';
import {createNativeEventStore} from './nativeEventStore';
import {postBackendJson} from './backendClient';
import {logError, logInfo} from '../utils/logError';

const queue = new SyncQueue(createNativeEventStore());

/** Transport over the face-auth backend's /sync/events and /sync/purge-ack. */
export const backendSyncTransport: SyncTransport = {
  async syncEvents(clientId, events) {
    const response = await postBackendJson<{
      acceptedEventIds?: string[];
      duplicateEventIds?: string[];
    }>(`/api/clients/${encodeURIComponent(clientId)}/sync/events`, {
      events: events.map(toWireEvent),
    });
    // Tolerate a minimal backend that 200s without echoing ids: treat all sent
    // as accepted so they progress to purge rather than re-sending forever.
    const sentIds = events.map(event => event.eventId);
    return {
      acceptedEventIds: response.acceptedEventIds ?? sentIds,
      duplicateEventIds: response.duplicateEventIds ?? [],
    };
  },
  async purgeAck(clientId, eventIds) {
    const response = await postBackendJson<{purgedEventIds?: string[]}>(
      `/api/clients/${encodeURIComponent(clientId)}/sync/purge-ack`,
      {eventIds},
    );
    return {purgedEventIds: response.purgedEventIds ?? eventIds};
  },
};

function toWireEvent(event: QueuedAuthEvent) {
  return {
    capturedAt: event.capturedAt,
    eventId: event.eventId,
    faceScore: event.faceScore,
    latencyMs: event.latencyMs,
    liveness: event.liveness,
    modelVersion: event.modelVersion,
    result: event.result,
    threshold: event.threshold,
    userId: event.userId,
  };
}

/** Durably record an auth event, then attempt to flush (best-effort). */
export async function enqueueAuthEvent(input: SyncEventInput): Promise<void> {
  await queue.enqueue(input);
  await flushAuthEvents(input.clientId);
}

/** Flush any queued events for a client; never throws (offline-safe). */
export async function flushAuthEvents(clientId: string): Promise<void> {
  try {
    const summary = await queue.flush(clientId, backendSyncTransport);
    if (summary.attempted > 0 || summary.purged > 0) {
      logInfo('authEventQueue.flush', summary);
    }
  } catch (error) {
    logError('authEventQueue.flush:error', error);
  }
}

export async function pendingAuthEventCount(): Promise<number> {
  return queue.pendingCount();
}

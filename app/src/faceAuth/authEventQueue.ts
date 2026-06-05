/**
 * App-wide singleton wiring the SyncQueue to the encrypted native event store
 * and the real backend transport. This replaces fire-and-forget auth-event
 * posting with a crash-safe, retrying, ACK-before-purge queue.
 */
import {
  SyncQueue,
  type FlushSummary,
  type QueuedAuthEvent,
  type SyncEventInput,
  type SyncQueueSnapshot,
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

/** Shaped to the backend's SyncEventInput (services.go). Embeddings are never
 * sent — only the abstract auth result, preserving on-device biometric privacy. */
function toWireEvent(event: QueuedAuthEvent) {
  return {
    eventId: event.eventId,
    result: event.result,
    failureReason: event.failureReason ?? '',
    faceScore: event.faceScore,
    livenessScore: event.livenessScore,
    challengeTypes: event.challengeTypes,
    latencyMs: event.latencyMs,
    capturedAt: event.capturedAt,
    modelVersion: event.modelVersion,
    userId: event.userId,
  };
}

/** Durably record an auth event, then attempt to flush (best-effort). */
export async function enqueueAuthEvent(input: SyncEventInput): Promise<void> {
  await queue.enqueue(input);
  await flushAuthEvents(input.clientId);
}

/** Flush any queued events for a client; never throws (offline-safe). */
export async function flushAuthEvents(
  clientId: string,
): Promise<FlushSummary | null> {
  try {
    const summary = await queue.flush(clientId, backendSyncTransport);
    if (summary.attempted > 0 || summary.purged > 0) {
      logInfo('authEventQueue.flush', summary);
    }
    return summary;
  } catch (error) {
    logError('authEventQueue.flush:error', error);
    return null;
  }
}

export async function pendingAuthEventCount(): Promise<number> {
  return queue.pendingCount();
}

export async function getAuthEventQueueSnapshot(
  clientId?: string,
): Promise<SyncQueueSnapshot> {
  return queue.snapshot(clientId);
}

export async function clearAuthEvents(): Promise<void> {
  await queue.clear();
}

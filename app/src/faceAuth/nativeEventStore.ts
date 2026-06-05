import {
  createInMemoryEventStore,
  type EventStore,
  type QueuedAuthEvent,
} from './syncQueue';
import {
  getNativeEvents,
  hasNativeEventQueueStore,
  saveNativeEvents,
} from '../native/EventQueueStore';
import {logError} from '../utils/logError';

/**
 * EventStore backed by the encrypted native EventQueueStore. The whole queue is
 * serialized as one JSON blob (the queue is small and capped). When the native
 * module is unavailable (e.g. unit tests), falls back to an in-memory store so
 * the rest of the app keeps working.
 */
export function createNativeEventStore(): EventStore {
  if (!hasNativeEventQueueStore()) {
    return createInMemoryEventStore();
  }

  return {
    async load(): Promise<QueuedAuthEvent[]> {
      try {
        const raw = await getNativeEvents();
        if (!raw) {
          return [];
        }
        const parsed = JSON.parse(raw) as QueuedAuthEvent[];
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        logError('nativeEventStore.load:error', error);
        return [];
      }
    },
    async save(events: QueuedAuthEvent[]): Promise<void> {
      await saveNativeEvents(JSON.stringify(events));
    },
  };
}

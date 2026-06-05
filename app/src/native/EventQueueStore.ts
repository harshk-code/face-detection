import {NativeModules} from 'react-native';

/**
 * Native bridge to encrypted persistence for the offline auth-event queue.
 * Mirrors FaceTemplateStore: a single JSON blob behind EncryptedSharedPreferences
 * (Android) / Keychain (iOS). Absent in unit tests -> callers fall back to memory.
 */
type NativeEventQueueStore = {
  getEvents: () => Promise<string | null>;
  saveEvents: (eventsJson: string) => Promise<boolean>;
  clearEvents: () => Promise<boolean>;
};

const EventQueueStore =
  NativeModules.EventQueueStore as NativeEventQueueStore | undefined;

export function hasNativeEventQueueStore(): boolean {
  return Boolean(EventQueueStore);
}

export async function getNativeEvents(): Promise<string | null> {
  if (!EventQueueStore) {
    return null;
  }
  return EventQueueStore.getEvents();
}

export async function saveNativeEvents(eventsJson: string): Promise<boolean> {
  if (!EventQueueStore) {
    return false;
  }
  await EventQueueStore.saveEvents(eventsJson);
  return true;
}

export async function clearNativeEvents(): Promise<boolean> {
  if (!EventQueueStore) {
    return false;
  }
  await EventQueueStore.clearEvents();
  return true;
}

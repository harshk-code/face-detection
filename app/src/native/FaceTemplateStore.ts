import {NativeModules} from 'react-native';

type NativeFaceTemplateStore = {
  clearSyncQueue: () => Promise<boolean>;
  clearTemplate: () => Promise<boolean>;
  getSyncQueue: () => Promise<string | null>;
  getTemplate: () => Promise<string | null>;
  saveSyncQueue: (queueJson: string) => Promise<boolean>;
  saveTemplate: (templateJson: string) => Promise<boolean>;
};

const FaceTemplateStore =
  NativeModules.FaceTemplateStore as NativeFaceTemplateStore | undefined;

export async function getNativeFaceTemplate() {
  if (!FaceTemplateStore) {
    return null;
  }

  return FaceTemplateStore.getTemplate();
}

export async function saveNativeFaceTemplate(templateJson: string) {
  if (!FaceTemplateStore) {
    return false;
  }

  await FaceTemplateStore.saveTemplate(templateJson);
  return true;
}

export async function clearNativeFaceTemplate() {
  if (!FaceTemplateStore) {
    return false;
  }

  await FaceTemplateStore.clearTemplate();
  return true;
}

export async function getNativeSyncQueue() {
  if (!FaceTemplateStore?.getSyncQueue) {
    return null;
  }

  return FaceTemplateStore.getSyncQueue();
}

export async function saveNativeSyncQueue(queueJson: string) {
  if (!FaceTemplateStore?.saveSyncQueue) {
    return false;
  }

  await FaceTemplateStore.saveSyncQueue(queueJson);
  return true;
}

export async function clearNativeSyncQueue() {
  if (!FaceTemplateStore?.clearSyncQueue) {
    return false;
  }

  await FaceTemplateStore.clearSyncQueue();
  return true;
}

import {NativeModules} from 'react-native';

type NativeFaceTemplateStore = {
  clearTemplate: () => Promise<boolean>;
  getTemplate: () => Promise<string | null>;
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

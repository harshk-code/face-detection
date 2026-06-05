import type {FaceTemplate} from './types';
import {
  clearNativeFaceTemplate,
  getNativeFaceTemplate,
  saveNativeFaceTemplate,
} from '../native/FaceTemplateStore';
import {logError, logInfo} from '../utils/logError';

let memoryTemplate: FaceTemplate | null = null;

export async function getStoredFaceTemplate() {
  const persistedTemplate = await getNativeFaceTemplate();

  if (!persistedTemplate) {
    logInfo('localTemplateStore.get:empty', {
      hasMemoryTemplate: Boolean(memoryTemplate),
      persistence: 'native',
    });
    return memoryTemplate;
  }

  try {
    const parsedTemplate = JSON.parse(persistedTemplate) as FaceTemplate;
    memoryTemplate = parsedTemplate;
    logInfo('localTemplateStore.get:complete', {
      embeddingLength: parsedTemplate.embedding.length,
      persistence: 'native',
      personnelId: parsedTemplate.personnelId,
    });
    return parsedTemplate;
  } catch (error) {
    logError('localTemplateStore.get:parse-error', error);
    await clearNativeFaceTemplate();
    return null;
  }
}

export async function saveStoredFaceTemplate(template: FaceTemplate) {
  memoryTemplate = template;
  const templateJson = JSON.stringify(template);
  logInfo('localTemplateStore.save:start', {
    bytes: templateJson.length,
    embeddingLength: template.embedding.length,
    personnelId: template.personnelId,
  });
  const persisted = await saveNativeFaceTemplate(templateJson);
  logInfo('localTemplateStore.save:complete', {
    persistence: persisted ? 'native' : 'memory-fallback',
    personnelId: template.personnelId,
  });
}

export async function clearStoredFaceTemplate() {
  memoryTemplate = null;
  const persisted = await clearNativeFaceTemplate();
  logInfo('localTemplateStore.clear:complete', {
    persistence: persisted ? 'native' : 'memory-fallback',
  });
}

import type {FaceTemplate} from './types';
import {logInfo} from '../utils/logError';

let memoryTemplate: FaceTemplate | null = null;

export async function getStoredFaceTemplate() {
  logInfo('localTemplateStore.get:memory', {
    hasTemplate: Boolean(memoryTemplate),
    personnelId: memoryTemplate?.personnelId ?? null,
  });
  return memoryTemplate;
}

export async function saveStoredFaceTemplate(template: FaceTemplate) {
  memoryTemplate = template;
  const templateJson = JSON.stringify(template);
  logInfo('localTemplateStore.save:start', {
    bytes: templateJson.length,
    embeddingLength: template.embedding.length,
    personnelId: template.personnelId,
  });
  logInfo('localTemplateStore.save:complete', {
    persistence: 'memory',
    personnelId: template.personnelId,
  });
}

export async function clearStoredFaceTemplate() {
  memoryTemplate = null;
  logInfo('localTemplateStore.clear:complete', {
    persistence: 'memory',
  });
}

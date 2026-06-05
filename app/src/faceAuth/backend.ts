import {FACE_AUTH_CONFIG} from './modelConfig';

export function createLocalTemplateId(personnelId: string) {
  return `local-${personnelId}-${Date.now()}`;
}

export function getDefaultSimilarityThreshold() {
  return FACE_AUTH_CONFIG.similarityThreshold;
}

import {FACE_AUTH_CONFIG} from './modelConfig';
import type {
  RegisterFaceTemplateRequest,
  RegisterFaceTemplateResponse,
} from './types';

const REGISTER_FACE_TEMPLATE_URL = '';

export async function registerFaceTemplate(
  _request: RegisterFaceTemplateRequest,
): Promise<RegisterFaceTemplateResponse> {
  if (!REGISTER_FACE_TEMPLATE_URL) {
    throw new Error(
      'Face template API is not configured. For now, save the real MobileFaceNet embedding locally; wire the AWS API before backend onboarding.',
    );
  }

  throw new Error('Face template API integration is pending.');
}

export function createLocalTemplateId(personnelId: string) {
  return `local-${personnelId}-${Date.now()}`;
}

export function getDefaultSimilarityThreshold() {
  return FACE_AUTH_CONFIG.similarityThreshold;
}

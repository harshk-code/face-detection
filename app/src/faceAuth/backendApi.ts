import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import {FACE_AUTH_CONFIG} from './modelConfig';
import type {FaceTemplate} from './types';
import {logError, logInfo} from '../utils/logError';

const API_BASE_URL = 'https://api.cars24.com/gw/plt/bffsvc';
const TENANT_ID = 'Cars24';

type UserOnboardingResponse = {
  id?: string;
  userId?: string;
};

type ClientRegistrationResponse = {
  clientId?: string;
  id?: string;
};

export type BackendAuthEventPayload = {
  capturedAt: string;
  eventId: string;
  faceScore: number;
  latencyMs: number;
  liveness: {
    passed: boolean;
    type: string;
  };
  modelVersion: string;
  result: 'SUCCESS' | 'FAILED';
  threshold: number;
  userId: string | null;
};

export async function registerBackendUser(template: FaceTemplate) {
  const userResponse = await postJson<UserOnboardingResponse>('/api/users', {
    employeeId: template.personnelId,
    name: template.displayName || template.personnelId,
    role: 'USER',
    faceTemplate: {
      createdAt: template.createdAt,
      embedding: template.embedding,
      embeddingDimension: template.embedding.length,
      enrollmentEmbeddings: template.enrollmentEmbeddings?.map(sample => ({
        capturedAt: sample.capturedAt,
        modelVersion: sample.modelVersion,
        pose: sample.pose,
        vector: sample.vector,
      })),
      modelAssetName: FACE_AUTH_CONFIG.modelAssetName,
      modelVersion: template.modelVersion,
      similarityThreshold: template.threshold,
      templateId: template.templateId,
    },
    liveness: {
      requiredMovements: ['LEFT_OR_RIGHT', 'OPPOSITE_SIDE'],
      type: 'HEAD_TURN',
      verifiedOffline: true,
    },
    app: await getAppPayload(),
  });

  const backendUserId = userResponse.id ?? userResponse.userId;
  if (!backendUserId) {
    throw new Error('Backend onboarding response did not include user id.');
  }

  return backendUserId;
}

export async function registerBackendClient(userId: string) {
  const clientResponse = await postJson<ClientRegistrationResponse>(
    '/api/clients',
    {
      userId,
      deviceType: 'PHONE',
      deviceName: await getDeviceName(),
      offlineAuthEnabled: true,
      ...(await getAppPayload()),
    },
  );

  const backendClientId = clientResponse.clientId ?? clientResponse.id;
  if (!backendClientId) {
    throw new Error('Backend client response did not include client id.');
  }

  return backendClientId;
}

export async function postAuthEvent(
  backendClientId: string,
  event: BackendAuthEventPayload,
) {
  const response = await postJson<unknown>(
    `/api/clients/${encodeURIComponent(backendClientId)}/sync/events`,
    {
      events: [event],
    },
  );

  logInfo('backend:auth-event:complete', {
    eventId: event.eventId,
    response,
    result: event.result,
  });
}

async function postJson<ResponseBody>(path: string, body: unknown) {
  logInfo('backend:request', {
    path,
  });

  const response = await fetch(`${API_BASE_URL}${path}`, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
    },
    method: 'POST',
  });

  const responseText = await response.text();
  const responseBody = responseText
    ? (JSON.parse(responseText) as ResponseBody)
    : ({} as ResponseBody);

  if (!response.ok) {
    throw new Error(
      `Backend request failed ${response.status}: ${responseText}`,
    );
  }

  return responseBody;
}

async function getAppPayload() {
  return {
    appVersion: DeviceInfo.getVersion(),
    platform: Platform.OS === 'ios' ? 'IOS' : 'ANDROID',
  };
}

async function getDeviceName() {
  try {
    return await DeviceInfo.getDeviceName();
  } catch (error) {
    logError('backend:device-name:error', error);
    return Platform.OS === 'ios' ? 'iOS Device' : 'Android Device';
  }
}

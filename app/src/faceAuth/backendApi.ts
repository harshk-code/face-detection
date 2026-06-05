import {Platform} from 'react-native';
import DeviceInfo from 'react-native-device-info';

import {FACE_AUTH_CONFIG} from './modelConfig';
import type {FaceMatchResult, FaceTemplate} from './types';
import {logError, logInfo} from '../utils/logError';

const API_BASE_URL = 'https://api.cars24.com/gw/plt/bffsvc';
const TENANT_ID = 'Cars24';

type BackendOnboardingResult = {
  backendClientId: string;
  backendUserId: string;
};

type UserOnboardingResponse = {
  id?: string;
  userId?: string;
};

type ClientRegistrationResponse = {
  clientId?: string;
  id?: string;
};

type AuthEventInput = {
  capturedAt: string;
  latencyMs: number;
  matchResult: FaceMatchResult;
  template: FaceTemplate;
};

export async function registerOnboardingAndClient(
  template: FaceTemplate,
): Promise<BackendOnboardingResult | null> {
  try {
    const userResponse = await postJson<UserOnboardingResponse>('/api/users', {
      employeeId: template.personnelId,
      name: template.displayName || template.personnelId,
      role: 'USER',
      faceTemplate: {
        createdAt: template.createdAt,
        embedding: template.embedding,
        embeddingDimension: template.embedding.length,
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

    const clientResponse = await postJson<ClientRegistrationResponse>(
      '/api/clients',
      {
        userId: backendUserId,
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

    logInfo('backend:onboarding-sync:complete', {
      backendClientId,
      backendUserId,
      personnelId: template.personnelId,
    });

    return {
      backendClientId,
      backendUserId,
    };
  } catch (error) {
    logError('backend:onboarding-sync:error', error);
    return null;
  }
}

export function syncAuthEventFireAndForget(input: AuthEventInput) {
  void syncAuthEvent(input);
}

async function syncAuthEvent({
  capturedAt,
  latencyMs,
  matchResult,
  template,
}: AuthEventInput) {
  if (!template.backendClientId) {
    logInfo('backend:auth-event:skip', {
      reason: 'missing-backend-client-id',
      templateId: template.templateId,
    });
    return;
  }

  try {
    const payload = {
      events: [
        {
          capturedAt,
          eventId: createEventId(template),
          faceScore: Number(matchResult.score.toFixed(6)),
          liveness: {
            passed: true,
            type: 'FACE_PRESENT',
          },
          modelVersion: template.modelVersion,
          result: matchResult.matched ? 'SUCCESS' : 'FAILED',
          threshold: matchResult.threshold,
          userId: template.backendUserId ?? null,
          latencyMs,
        },
      ],
    };

    const response = await postJson<unknown>(
      `/api/clients/${encodeURIComponent(
        template.backendClientId,
      )}/sync/events`,
      payload,
    );

    logInfo('backend:auth-event:complete', {
      response,
      result: matchResult.matched ? 'SUCCESS' : 'FAILED',
      templateId: template.templateId,
    });
  } catch (error) {
    logError('backend:auth-event:error', error);
  }
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

function createEventId(template: FaceTemplate) {
  return `${template.templateId}-${Date.now()}`;
}

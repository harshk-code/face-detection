import {logInfo} from '../utils/logError';

export const API_BASE_URL = 'https://c24-bff-service-stage.qac24svc.dev/';
export const TENANT_ID = 'Cars24';

/** Shared POST helper for the face-auth backend (JSON, tenant header). */
export async function postBackendJson<ResponseBody>(
  path: string,
  body: unknown,
): Promise<ResponseBody> {
  const url = `${API_BASE_URL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

  logInfo('backend:request', {path, url});

  const response = await fetch(url, {
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
    },
    method: 'POST',
  });

  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Backend request failed ${response.status}: ${responseText}`);
  }

  const responseBody = responseText
    ? (JSON.parse(responseText) as ResponseBody)
    : ({} as ResponseBody);

  logInfo('backend:request:success', {
    path,
    status: response.status,
    url,
  });

  return responseBody;
}

import {logInfo} from '../utils/logError';

export const API_BASE_URL = 'https://api.cars24.com/gw/plt/bffsvc';
export const TENANT_ID = 'Cars24';

/** Shared POST helper for the face-auth backend (JSON, tenant header). */
export async function postBackendJson<ResponseBody>(
  path: string,
  body: unknown,
): Promise<ResponseBody> {
  logInfo('backend:request', {path});

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
    throw new Error(`Backend request failed ${response.status}: ${responseText}`);
  }

  return responseBody;
}

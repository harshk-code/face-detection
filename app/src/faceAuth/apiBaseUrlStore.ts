import {
  clearNativeApiBaseUrl,
  getNativeApiBaseUrl,
  saveNativeApiBaseUrl,
} from '../native/FaceTemplateStore';
import {logError, logInfo} from '../utils/logError';

export const DEFAULT_API_BASE_URL = 'http://localhost:18081/';

let cachedApiBaseUrl = DEFAULT_API_BASE_URL;
let hydrateApiBaseUrlPromise: Promise<string> | null = null;
let hasHydratedApiBaseUrl = false;

export async function getApiBaseUrl() {
  if (hasHydratedApiBaseUrl) {
    return cachedApiBaseUrl;
  }

  return hydrateApiBaseUrl();
}

export async function hydrateApiBaseUrl() {
  if (hydrateApiBaseUrlPromise) {
    return hydrateApiBaseUrlPromise;
  }

  hydrateApiBaseUrlPromise = readPersistedApiBaseUrl();
  return hydrateApiBaseUrlPromise;
}

export function getCachedApiBaseUrl() {
  return cachedApiBaseUrl;
}

async function readPersistedApiBaseUrl() {
  const persistedBaseUrl = await getNativeApiBaseUrl();

  if (persistedBaseUrl) {
    cachedApiBaseUrl = normalizeApiBaseUrl(persistedBaseUrl);
    logInfo('api-base-url:hydrate', {
      baseUrl: cachedApiBaseUrl,
      source: 'native',
    });
  } else {
    cachedApiBaseUrl = DEFAULT_API_BASE_URL;
    logInfo('api-base-url:hydrate', {
      baseUrl: cachedApiBaseUrl,
      source: 'default',
    });
  }

  hasHydratedApiBaseUrl = true;
  return cachedApiBaseUrl;
}

export async function saveApiBaseUrl(baseUrl: string) {
  const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
  validateApiBaseUrl(normalizedBaseUrl);

  cachedApiBaseUrl = normalizedBaseUrl;
  hasHydratedApiBaseUrl = true;
  hydrateApiBaseUrlPromise = Promise.resolve(normalizedBaseUrl);
  const persisted = await saveNativeApiBaseUrl(normalizedBaseUrl);
  logInfo('api-base-url:save', {
    baseUrl: normalizedBaseUrl,
    persistence: persisted ? 'native' : 'memory-fallback',
  });

  return normalizedBaseUrl;
}

export async function resetApiBaseUrl() {
  cachedApiBaseUrl = DEFAULT_API_BASE_URL;
  hasHydratedApiBaseUrl = true;
  hydrateApiBaseUrlPromise = Promise.resolve(DEFAULT_API_BASE_URL);
  const persisted = await clearNativeApiBaseUrl();
  logInfo('api-base-url:reset', {
    baseUrl: DEFAULT_API_BASE_URL,
    persistence: persisted ? 'native' : 'memory-fallback',
  });
}

export function normalizeApiBaseUrl(baseUrl: string) {
  return baseUrl.trim();
}

export function validateApiBaseUrl(baseUrl: string) {
  if (!baseUrl) {
    throw new Error('Base URL is required.');
  }

  if (!/^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(baseUrl)) {
    logError('api-base-url:validate:error', {
      baseUrl,
      reason: 'invalid-url-format',
    });
    throw new Error('Enter a valid API base URL starting with http:// or https://.');
  }
}

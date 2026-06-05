import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {Alert, AppState, Linking} from 'react-native';

import {
  clearSyncQueue,
  enqueueRegisterUserJob,
} from '../faceAuth/syncQueueStore';
import {processSyncQueue} from '../faceAuth/syncQueueProcessor';
import {
  clearStoredFaceTemplate,
  getStoredFaceTemplate,
  saveStoredFaceTemplate,
} from '../faceAuth/localTemplateStore';
import type {FaceEmbedding, FaceTemplate} from '../faceAuth/types';
import {
  getCameraPermissionStatus,
  requestCameraPermission,
} from '../native/AppCameraPermission';
import {logError, logInfo} from '../utils/logError';
import {traceNative} from '../utils/nativeTrace';

type CameraPurpose = 'login' | 'onboarding';

type NetInfoState = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
  type: string;
};

type NetInfoModule = {
  addEventListener: (
    listener: (state: NetInfoState) => void,
  ) => () => void;
};

type FaceAuthContextValue = {
  clearTemplateData: () => Promise<void>;
  isHydrated: boolean;
  localTemplate: FaceTemplate | null;
  pendingEmbedding: FaceEmbedding | null;
  permissionMessage: string | null;
  prepareLogin: () => Promise<boolean>;
  prepareOnboarding: () => Promise<boolean>;
  saveTemplate: (template: FaceTemplate) => Promise<void>;
  setPendingEmbedding: (embedding: FaceEmbedding | null) => void;
};

const FaceAuthContext = createContext<FaceAuthContextValue | null>(null);
const SYNC_RETRY_INTERVAL_MS = 15000;

export function FaceAuthProvider({children}: {children: React.ReactNode}) {
  const [isHydrated, setIsHydrated] = useState(false);
  const [localTemplate, setLocalTemplate] = useState<FaceTemplate | null>(null);
  const [pendingEmbedding, setPendingEmbedding] = useState<FaceEmbedding | null>(
    null,
  );
  const [permissionMessage, setPermissionMessage] = useState<string | null>(
    null,
  );

  const hydrateTemplate = useCallback(async () => {
    logInfo('app:hydrate:start', {});
    const storedTemplate = await getStoredFaceTemplate();
    logInfo('app:hydrate:complete', {
      hasStoredTemplate: Boolean(storedTemplate),
      personnelId: storedTemplate?.personnelId ?? null,
    });
    setLocalTemplate(storedTemplate);
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    void hydrateTemplate();
  }, [hydrateTemplate]);

  const processQueueAndRefreshTemplate = useCallback(async (reason: string) => {
    const snapshot = await processSyncQueue(reason);
    const storedTemplate = await getStoredFaceTemplate();
    setLocalTemplate(storedTemplate);
    logInfo('app:sync-queue:refresh-complete', {
      hasStoredTemplate: Boolean(storedTemplate),
      pendingCount: snapshot.pendingCount,
      reason,
      syncedCount: snapshot.syncedCount,
    });
  }, []);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    void processQueueAndRefreshTemplate('app-hydrated');

    const interval = setInterval(() => {
      void processQueueAndRefreshTemplate('retry-interval');
    }, SYNC_RETRY_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void processQueueAndRefreshTemplate('app-active');
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [isHydrated, processQueueAndRefreshTemplate]);

  useEffect(() => {
    if (!isHydrated) {
      return undefined;
    }

    const netInfo = getNetInfoModule();
    if (!netInfo) {
      logInfo('app:network-state:unavailable', {
        reason: 'netinfo-module-not-installed',
      });
      return undefined;
    }

    const unsubscribe = netInfo.addEventListener(state => {
      const isOnline =
        state.isConnected === true && state.isInternetReachable !== false;

      logInfo('app:network-state', {
        isConnected: state.isConnected,
        isInternetReachable: state.isInternetReachable,
        isOnline,
        type: state.type,
      });

      if (isOnline) {
        void processQueueAndRefreshTemplate('network-restored');
      }
    });

    return unsubscribe;
  }, [isHydrated, processQueueAndRefreshTemplate]);

  useEffect(() => {
    logInfo('app:navigation-state', {
      hasLocalTemplate: Boolean(localTemplate),
      isHydrated,
      pendingEmbedding: Boolean(pendingEmbedding),
    });
  }, [isHydrated, localTemplate, pendingEmbedding]);

  const showCameraSettingsAlert = useCallback(() => {
    Alert.alert(
      'Camera permission required',
      'Camera access is required for onboarding and login. You have to manually allow camera permission in Settings, then come back to the app.',
      [
        {
          style: 'cancel',
          text: 'Stay here',
        },
        {
          onPress: () => {
            void Linking.openSettings();
          },
          text: 'Open Settings',
        },
      ],
    );
  }, []);

  const requestCameraAccess = useCallback(
    async (purpose: CameraPurpose) => {
      traceNative('permission-check-start', {purpose});
      const cameraPermission = await getCameraPermissionStatus();
      traceNative('permission-check-result', {
        canRequestPermission: cameraPermission.canRequestPermission,
        hasPermission: cameraPermission.hasPermission,
        purpose,
        status: cameraPermission.status ?? null,
      });
      logInfo('app:camera-permission:check', {
        canRequestPermission: cameraPermission.canRequestPermission,
        hasPermission: cameraPermission.hasPermission,
        permissionStatus: cameraPermission.status,
        purpose,
      });

      if (cameraPermission.hasPermission) {
        setPermissionMessage(null);
        traceNative('permission-already-allowed', {purpose});
        return true;
      }

      if (cameraPermission.canRequestPermission) {
        const requestedPermission = await requestCameraPermission();
        traceNative('permission-request-result', {
          canRequestPermission: requestedPermission.canRequestPermission,
          hasPermission: requestedPermission.hasPermission,
          purpose,
          status: requestedPermission.status ?? null,
        });
        logInfo('app:camera-permission:request-result', {
          canRequestPermission: requestedPermission.canRequestPermission,
          hasPermission: requestedPermission.hasPermission,
          purpose,
          status: requestedPermission.status ?? null,
        });

        if (requestedPermission.hasPermission) {
          setPermissionMessage(null);
          return true;
        }

        setPermissionMessage(
          `Camera permission was denied. Please allow camera access to continue ${purpose}.`,
        );
        return false;
      }

      setPermissionMessage(
        `Camera permission is blocked. You have to manually allow it in Settings to continue ${purpose}.`,
      );
      showCameraSettingsAlert();
      return false;
    },
    [showCameraSettingsAlert],
  );

  const prepareOnboarding = useCallback(async () => {
    traceNative('start-onboarding-press', {
      hasLocalTemplate: Boolean(localTemplate),
    });

    const hasAccess = await requestCameraAccess('onboarding');
    if (!hasAccess) {
      return false;
    }

    logInfo('app:navigate:onboard-scan', {
      hasLocalTemplate: Boolean(localTemplate),
    });
    traceNative('navigate-onboard-scan', {
      hasLocalTemplate: Boolean(localTemplate),
    });
    setPendingEmbedding(null);
    return true;
  }, [localTemplate, requestCameraAccess]);

  const prepareLogin = useCallback(async () => {
    return requestCameraAccess('login');
  }, [requestCameraAccess]);

  const saveTemplate = useCallback(async (template: FaceTemplate) => {
    try {
      logInfo('app:onboard-template:save-start', {
        embeddingLength: template.embedding.length,
        personnelId: template.personnelId,
        threshold: template.threshold,
      });
      await saveStoredFaceTemplate(template);
      logInfo('app:onboard-template:save-complete', {
        personnelId: template.personnelId,
        templateId: template.templateId,
      });
      setLocalTemplate(template);
      await enqueueRegisterUserJob(template);
      void processQueueAndRefreshTemplate('onboarding-template-saved');
    } catch (error) {
      logError('FaceAuthProvider.saveTemplate', error);
      throw error;
    }
  }, [processQueueAndRefreshTemplate]);

  const clearTemplateData = useCallback(async () => {
    logInfo('app:clear-data:start', {});
    await clearStoredFaceTemplate();
    await clearSyncQueue();
    logInfo('app:clear-data:storage-cleared', {});
    setLocalTemplate(null);
    setPendingEmbedding(null);
  }, []);

  const value = useMemo<FaceAuthContextValue>(
    () => ({
      clearTemplateData,
      isHydrated,
      localTemplate,
      pendingEmbedding,
      permissionMessage,
      prepareLogin,
      prepareOnboarding,
      saveTemplate,
      setPendingEmbedding,
    }),
    [
      clearTemplateData,
      isHydrated,
      localTemplate,
      pendingEmbedding,
      permissionMessage,
      prepareLogin,
      prepareOnboarding,
      saveTemplate,
    ],
  );

  return (
    <FaceAuthContext.Provider value={value}>
      {children}
    </FaceAuthContext.Provider>
  );
}

function getNetInfoModule(): NetInfoModule | null {
  try {
    return require('@react-native-community/netinfo').default as NetInfoModule;
  } catch {
    return null;
  }
}

export function useFaceAuth() {
  const value = useContext(FaceAuthContext);
  if (!value) {
    throw new Error('useFaceAuth must be used inside FaceAuthProvider.');
  }

  return value;
}

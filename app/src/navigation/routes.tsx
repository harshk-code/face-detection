import React from 'react';
import {CommonActions} from '@react-navigation/native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';

import {useFaceAuth} from '../app/FaceAuthContext';
import {LoadingScreen} from '../screens/LoadingScreen';
import {HomeScreen} from '../screens/HomeScreen';
import {IntroScreen} from '../screens/IntroScreen';
import {OnboardFaceScreen} from '../screens/OnboardFaceScreen';
import {OnboardUserFormScreen} from '../screens/OnboardUserFormScreen';
import {ProfileScreen} from '../screens/ProfileScreen';
import {SyncStatusScreen} from '../screens/SyncStatusScreen';
import {VerifyFaceScreen} from '../screens/VerifyFaceScreen';
import {processSyncQueue} from '../faceAuth/syncQueueProcessor';
import {
  getSyncQueueSnapshot,
  subscribeSyncQueue,
  type SyncQueueSnapshot,
} from '../faceAuth/syncQueueStore';
import {logInfo} from '../utils/logError';
import {Screens} from './constants';

import type {RootStackParamList} from './types';

type ScreenProps<RouteName extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, RouteName>;

export function IntroRoute({navigation}: ScreenProps<'Intro'>) {
  const {permissionMessage, prepareOnboarding} = useFaceAuth();

  return (
    <IntroScreen
      permissionMessage={permissionMessage}
      onOnboard={async () => {
        const canContinue = await prepareOnboarding();
        if (canContinue) {
          navigation.navigate(Screens.OnboardScan);
        }
      }}
    />
  );
}

export function OnboardScanRoute({navigation}: ScreenProps<'OnboardScan'>) {
  const {localTemplate, setPendingEmbedding} = useFaceAuth();

  return (
    <OnboardFaceScreen
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate(localTemplate ? Screens.Home : Screens.Intro);
      }}
      onFaceDataReady={embedding => {
        logInfo('app:onboard:face-data-ready', {
          modelVersion: embedding.modelVersion,
          vectorLength: embedding.vector.length,
        });
        setPendingEmbedding(embedding);
        navigation.navigate(Screens.OnboardForm);
      }}
    />
  );
}

export function OnboardFormRoute({navigation}: ScreenProps<'OnboardForm'>) {
  const {localTemplate, pendingEmbedding, saveTemplate} = useFaceAuth();

  if (!pendingEmbedding) {
    return (
      <MissingEmbeddingRoute
        onContinue={() => {
          navigation.navigate(localTemplate ? Screens.Home : Screens.Intro);
        }}
      />
    );
  }

  return (
    <OnboardUserFormScreen
      embedding={pendingEmbedding}
      onBack={() => navigation.goBack()}
      onSubmit={async template => {
        await saveTemplate(template);
        logInfo('app:onboard-template:navigate-home', {
          personnelId: template.personnelId,
        });
        logInfo('app:onboard-template:navigate-home:scheduled', {
          personnelId: template.personnelId,
        });
        runAfterFrame(() => {
          logInfo('app:onboard-template:navigate-home:execute', {
            personnelId: template.personnelId,
          });
          resetToRoute(navigation, Screens.Home);
        });
      }}
    />
  );
}

export function HomeRoute({navigation}: ScreenProps<'Home'>) {
  const {
    clearTemplateData,
    localTemplate,
    prepareLogin,
    prepareOnboarding,
  } = useFaceAuth();

  if (!localTemplate) {
    return (
      <MissingTemplateRoute
        onOnboard={async () => {
          const canContinue = await prepareOnboarding();
          if (canContinue) {
            navigation.navigate(Screens.OnboardScan);
          }
        }}
      />
    );
  }

  return (
    <HomeScreen
      localTemplate={localTemplate}
      onClearData={async () => {
        await clearTemplateData();
        logInfo('app:clear-data:navigate-intro', {});
        logInfo('app:clear-data:navigate-intro:scheduled', {});
        runAfterFrame(() => {
          logInfo('app:clear-data:navigate-intro:execute', {});
          resetToRoute(navigation, Screens.Intro);
        });
      }}
      onLogin={async () => {
        const canContinue = await prepareLogin();
        if (canContinue) {
          navigation.navigate(Screens.Login);
        }
      }}
      onSyncStatus={() => {
        navigation.navigate(Screens.SyncStatus);
      }}
      onUpdateOnboarding={async () => {
        const canContinue = await prepareOnboarding();
        if (canContinue) {
          navigation.navigate(Screens.OnboardScan);
        }
      }}
    />
  );
}

export function SyncStatusRoute({navigation}: ScreenProps<'SyncStatus'>) {
  const [snapshot, setSnapshot] = React.useState<SyncQueueSnapshot>({
    jobs: [],
    pendingCount: 0,
    syncedCount: 0,
  });
  const [isProcessing, setIsProcessing] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    void getSyncQueueSnapshot().then(nextSnapshot => {
      if (isMounted) {
        setSnapshot(nextSnapshot);
      }
    });

    const unsubscribe = subscribeSyncQueue(nextSnapshot => {
      setSnapshot(nextSnapshot);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  return (
    <SyncStatusScreen
      isProcessing={isProcessing}
      snapshot={snapshot}
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }

        navigation.navigate(Screens.Home);
      }}
      onRetry={async () => {
        setIsProcessing(true);
        try {
          const nextSnapshot = await processSyncQueue('sync-status-manual');
          setSnapshot(nextSnapshot);
        } finally {
          setIsProcessing(false);
        }
      }}
    />
  );
}

export function LoginRoute({navigation}: ScreenProps<'Login'>) {
  const {localTemplate, prepareOnboarding} = useFaceAuth();

  if (!localTemplate) {
    return (
      <MissingTemplateRoute
        onOnboard={async () => {
          const canContinue = await prepareOnboarding();
          if (canContinue) {
            navigation.navigate(Screens.OnboardScan);
          }
        }}
      />
    );
  }

  return (
    <VerifyFaceScreen
      localTemplate={localTemplate}
      onAuthenticated={() => {
        navigation.replace(Screens.Profile);
      }}
      onBack={() => {
        navigation.goBack();
      }}
    />
  );
}

export function ProfileRoute({navigation}: ScreenProps<'Profile'>) {
  const {localTemplate, prepareOnboarding} = useFaceAuth();

  if (!localTemplate) {
    return (
      <MissingTemplateRoute
        onOnboard={async () => {
          const canContinue = await prepareOnboarding();
          if (canContinue) {
            navigation.navigate(Screens.OnboardScan);
          }
        }}
      />
    );
  }

  return (
    <ProfileScreen
      template={localTemplate}
      onBackHome={() => {
        resetToRoute(navigation, Screens.Home);
      }}
    />
  );
}

function MissingTemplateRoute({onOnboard}: {onOnboard: () => void}) {
  const {permissionMessage} = useFaceAuth();

  return (
    <IntroScreen
      permissionMessage={permissionMessage}
      onOnboard={onOnboard}
    />
  );
}

function MissingEmbeddingRoute({onContinue}: {onContinue: () => void}) {
  React.useEffect(() => {
    onContinue();
  }, [onContinue]);

  return <LoadingScreen message="Preparing onboarding flow..." />;
}

function runAfterFrame(callback: () => void) {
  requestAnimationFrame(callback);
}

function resetToRoute(
  navigation: ScreenProps<keyof RootStackParamList>['navigation'],
  routeName: keyof RootStackParamList,
) {
  navigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{name: routeName}],
    }),
  );
}

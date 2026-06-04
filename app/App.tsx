import React from 'react';
import { StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { FaceAuthProvider, useFaceAuth } from './src/app/FaceAuthContext';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { AppNavigator } from './src/navigation/AppNavigator';
import { LoadingScreen } from './src/screens/LoadingScreen';
import { traceNative } from './src/utils/nativeTrace';

enableScreens(true);

function App() {
  traceNative('app-render', {});
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <AppShell isDarkMode={isDarkMode}>
      <FaceAuthProvider>
        <AppContent />
      </FaceAuthProvider>
    </AppShell>
  );
}

function AppContent() {
  const { isHydrated } = useFaceAuth();

  if (!isHydrated) {
    return <LoadingScreen />;
  }

  return <AppNavigator />;
}

function AppShell({
  children,
  isDarkMode,
}: {
  children: React.ReactNode;
  isDarkMode: boolean;
}) {
  return (
    <SafeAreaProvider>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
        <ErrorBoundary>{children}</ErrorBoundary>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f7f8fa',
  },
});

export default App;

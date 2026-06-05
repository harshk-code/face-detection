import React from 'react';
import {
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {ActionButton} from '../components/ActionButton';

type Props = {
  onBack: () => void;
};

type NetworkLoggerComponent = React.ComponentType<{
  sort?: 'asc' | 'desc';
  theme?: 'dark' | 'light';
}>;

export function NetworkLoggerScreen({onBack}: Props) {
  const NetworkLogger = React.useMemo<NetworkLoggerComponent | null>(() => {
    if (!__DEV__) {
      return null;
    }

    return require('react-native-network-logger').default;
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Network Logs</Text>
        <Text style={styles.subtitle}>
          Debug-only API inspector for onboarding, client registration, and auth
          event sync calls.
        </Text>
      </View>

      <View style={styles.loggerContainer}>
        {NetworkLogger ? (
          <NetworkLogger theme="dark" sort="desc" />
        ) : (
          <View style={styles.releaseFallback}>
            <Text style={styles.releaseTitle}>
              Only available in debug builds
            </Text>
          </View>
        )}
      </View>

      <View style={styles.bottomBar}>
        <ActionButton label="Back" onPress={onBack} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    backgroundColor: '#2d2a28',
    padding: 12,
  },
  container: {
    backgroundColor: '#2d2a28',
    flex: 1,
  },
  header: {
    backgroundColor: '#2d2a28',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  loggerContainer: {
    flex: 1,
  },
  releaseFallback: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  releaseTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: '#d6d3d1',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 19,
  },
  title: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
});

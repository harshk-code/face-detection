import React from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

type Props = {
  message?: string;
};

export function LoadingScreen({
  message = 'Loading secure face template...',
}: Props) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color="#123b73" />
      <Text style={styles.loadingText}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f7f8fa',
    gap: 12,
  },
  loadingText: {
    color: '#526173',
    fontWeight: '700',
  },
});

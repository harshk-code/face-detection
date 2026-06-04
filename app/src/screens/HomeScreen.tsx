import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {ActionButton} from '../components/ActionButton';
import type {FaceTemplate} from '../faceAuth/types';

type Props = {
  localTemplate: FaceTemplate;
  onClearData: () => void;
  onLogin: () => void;
  onUpdateOnboarding: () => void;
};

export function HomeScreen({
  localTemplate,
  onClearData,
  onLogin,
  onUpdateOnboarding,
}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>MORTH Hackathon 7.0</Text>
        <Text style={styles.subtitle}>
          Offline facial recognition and liveness detection for remote field
          operations.
        </Text>
        <View style={styles.templatePill}>
          <Text style={styles.templateText}>
            Onboarded User ID: {localTemplate.personnelId}
          </Text>
        </View>
      </View>

      <View style={styles.centerAction}>
        <ActionButton label="Login" onPress={onLogin} style={styles.login} />
      </View>

      <View style={styles.bottomActions}>
        <ActionButton
          label="Update Onboarding"
          variant="secondary"
          onPress={onUpdateOnboarding}
        />
        <ActionButton
          label="Clear all data"
          variant="danger"
          onPress={onClearData}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    padding: 22,
  },
  header: {
    paddingTop: 18,
    gap: 10,
  },
  title: {
    color: '#172033',
    fontSize: 30,
    fontWeight: '900',
  },
  subtitle: {
    color: '#526173',
    fontSize: 15,
    lineHeight: 22,
  },
  templatePill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#e8eef7',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  templateText: {
    color: '#123b73',
    fontWeight: '800',
  },
  centerAction: {
    flex: 1,
    justifyContent: 'center',
  },
  login: {
    minHeight: 64,
  },
  bottomActions: {
    gap: 12,
    paddingBottom: 8,
  },
});

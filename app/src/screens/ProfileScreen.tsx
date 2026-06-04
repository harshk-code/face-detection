import React from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {ActionButton} from '../components/ActionButton';
import type {FaceTemplate} from '../faceAuth/types';

type Props = {
  template: FaceTemplate;
  onBackHome: () => void;
};

export function ProfileScreen({template, onBackHome}: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.badge}>Logged in</Text>
        <Text style={styles.title}>You are authenticated now</Text>
        <Text style={styles.label}>User ID</Text>
        <Text style={styles.userId}>{template.personnelId}</Text>
      </View>

      <View style={styles.bottomBar}>
        <ActionButton label="Home" onPress={onBackHome} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#f7f8fa',
    padding: 24,
  },
  card: {
    borderRadius: 8,
    backgroundColor: '#ffffff',
    padding: 22,
    gap: 10,
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#dff7ea',
    color: '#176b3c',
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  title: {
    color: '#172033',
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 34,
  },
  label: {
    color: '#526173',
    fontWeight: '800',
    marginTop: 10,
  },
  userId: {
    color: '#123b73',
    fontSize: 24,
    fontWeight: '900',
  },
  bottomBar: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 28,
  },
});

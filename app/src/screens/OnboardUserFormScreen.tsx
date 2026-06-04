import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {ActionButton} from '../components/ActionButton';
import {
  createLocalTemplateId,
  getDefaultSimilarityThreshold,
} from '../faceAuth/backend';
import type {FaceEmbedding, FaceTemplate} from '../faceAuth/types';

type Props = {
  embedding: FaceEmbedding;
  onBack: () => void;
  onSubmit: (template: FaceTemplate) => void;
};

export function OnboardUserFormScreen({embedding, onBack, onSubmit}: Props) {
  const [userId, setUserId] = useState('');
  const normalizedUserId = userId.trim();

  function handleSubmit() {
    if (!normalizedUserId) {
      return;
    }

    onSubmit({
      templateId: createLocalTemplateId(normalizedUserId),
      personnelId: normalizedUserId,
      displayName: normalizedUserId,
      embedding: embedding.vector,
      modelVersion: embedding.modelVersion,
      threshold: getDefaultSimilarityThreshold(),
      createdAt: new Date().toISOString(),
    });
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.eyebrow}>Face data captured</Text>
        <Text style={styles.title}>Finish onboarding</Text>
        <Text style={styles.subtitle}>
          Enter the field personnel user ID to link this local face template.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>User ID</Text>
          <TextInput
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="Example: FIELD-001"
            placeholderTextColor="#8d98a8"
            style={styles.input}
            value={userId}
            onChangeText={setUserId}
          />
        </View>
      </View>

      <View style={styles.bottomBar}>
        <ActionButton label="Back" variant="secondary" onPress={onBack} />
        <ActionButton
          label="Onboard"
          disabled={!normalizedUserId}
          onPress={handleSubmit}
          style={styles.primaryButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f7f8fa',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  eyebrow: {
    color: '#123b73',
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
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
    marginTop: 10,
  },
  inputGroup: {
    gap: 8,
    marginTop: 28,
  },
  label: {
    color: '#172033',
    fontWeight: '800',
  },
  input: {
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c8d1de',
    backgroundColor: '#ffffff',
    color: '#172033',
    fontSize: 17,
    fontWeight: '700',
    paddingHorizontal: 14,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: 28,
  },
  primaryButton: {
    flex: 1,
  },
});

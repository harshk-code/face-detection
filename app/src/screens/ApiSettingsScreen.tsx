import React, {useEffect, useState} from 'react';
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
  DEFAULT_API_BASE_URL,
  getApiBaseUrl,
  normalizeApiBaseUrl,
  saveApiBaseUrl,
  validateApiBaseUrl,
} from '../faceAuth/apiBaseUrlStore';
import {logError, logInfo} from '../utils/logError';

type Props = {
  onBack: () => void;
};

export function ApiSettingsScreen({onBack}: Props) {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [currentBaseUrl, setCurrentBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    void getApiBaseUrl().then(storedBaseUrl => {
      if (!isMounted) {
        return;
      }

      setBaseUrl(storedBaseUrl);
      setCurrentBaseUrl(storedBaseUrl);
    });

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleSave() {
    const normalizedBaseUrl = normalizeApiBaseUrl(baseUrl);
    setError(null);
    setMessage(null);

    try {
      validateApiBaseUrl(normalizedBaseUrl);
      setIsSaving(true);
      const savedBaseUrl = await saveApiBaseUrl(normalizedBaseUrl);
      setBaseUrl(savedBaseUrl);
      setCurrentBaseUrl(savedBaseUrl);
      setMessage('Base URL saved. New API calls will use this URL.');
      logInfo('api-settings:base-url:saved', {baseUrl: savedBaseUrl});
    } catch (saveError) {
      logError('api-settings:base-url:save-error', saveError);
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Unable to save API base URL.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.kicker}>Utility</Text>
        <Text style={styles.title}>API Settings</Text>
        <Text style={styles.subtitle}>
          Change the backend base URL used by onboarding, client registration,
          and auth event sync calls.
        </Text>

        <View style={styles.currentCard}>
          <Text style={styles.currentLabel}>Currently used base URL</Text>
          <Text selectable style={styles.currentValue}>
            {currentBaseUrl}
          </Text>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>New base URL</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            onChangeText={text => {
              setBaseUrl(text);
              setError(null);
              setMessage(null);
            }}
            placeholder={DEFAULT_API_BASE_URL}
            placeholderTextColor="#8d98a8"
            returnKeyType="done"
            style={styles.input}
            value={baseUrl}
          />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
        {message ? <Text style={styles.success}>{message}</Text> : null}
      </View>

      <View style={styles.bottomBar}>
        <ActionButton label="Back" variant="secondary" onPress={onBack} />
        <ActionButton
          label={isSaving ? 'Saving...' : 'Save Base URL'}
          disabled={isSaving}
          onPress={handleSave}
          style={styles.primaryButton}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bottomBar: {
    flexDirection: 'row',
    gap: 12,
    padding: 20,
    paddingBottom: 28,
  },
  container: {
    backgroundColor: '#f7f8fa',
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  currentCard: {
    backgroundColor: '#ffffff',
    borderColor: '#d7e0ec',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    marginTop: 28,
    padding: 14,
  },
  currentLabel: {
    color: '#526173',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  currentValue: {
    color: '#123b73',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  error: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 12,
  },
  input: {
    backgroundColor: '#ffffff',
    borderColor: '#c8d1de',
    borderRadius: 8,
    borderWidth: 1,
    color: '#172033',
    fontSize: 16,
    fontWeight: '700',
    minHeight: 54,
    paddingHorizontal: 14,
  },
  inputGroup: {
    gap: 8,
    marginTop: 22,
  },
  kicker: {
    color: '#123b73',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  label: {
    color: '#172033',
    fontWeight: '800',
  },
  primaryButton: {
    flex: 1,
  },
  subtitle: {
    color: '#526173',
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
  },
  success: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
    marginTop: 12,
  },
  title: {
    color: '#172033',
    fontSize: 30,
    fontWeight: '900',
  },
});

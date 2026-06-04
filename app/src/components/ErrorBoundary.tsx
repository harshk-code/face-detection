import React, {type ReactNode} from 'react';
import {StyleSheet, Text, View} from 'react-native';

import {logError} from '../utils/logError';

type Props = {
  children: ReactNode;
};

type State = {
  errorMessage: string | null;
};

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    errorMessage: null,
  };

  static getDerivedStateFromError(error: unknown): State {
    return {
      errorMessage:
        error instanceof Error ? error.message : 'Unexpected app error.',
    };
  }

  componentDidCatch(error: unknown) {
    logError('app:error-boundary', error);
  }

  render() {
    if (this.state.errorMessage) {
      return (
        <View style={styles.container}>
          <Text style={styles.title}>Something crashed in JS</Text>
          <Text style={styles.message}>{this.state.errorMessage}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: '#f7f8fa',
    padding: 24,
    gap: 10,
  },
  title: {
    color: '#172033',
    fontSize: 22,
    fontWeight: '900',
  },
  message: {
    color: '#526173',
    fontSize: 15,
    lineHeight: 22,
  },
});

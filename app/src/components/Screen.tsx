import React, {type ReactNode} from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';

type Props = {
  title: string;
  subtitle?: string;
  children: ReactNode;
};

export function Screen({title, subtitle, children}: Props) {
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 20,
    paddingBottom: 120,
  },
  header: {
    marginBottom: 18,
    gap: 8,
  },
  title: {
    color: '#172033',
    fontSize: 28,
    fontWeight: '800',
  },
  subtitle: {
    color: '#526173',
    fontSize: 15,
    lineHeight: 22,
  },
});

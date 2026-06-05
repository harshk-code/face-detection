import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {ActionButton} from '../components/ActionButton';
import type {QueuedAuthEvent, SyncQueueSnapshot} from '../faceAuth/syncQueue';

type Props = {
  isProcessing: boolean;
  onBack: () => void;
  onRetry: () => void;
  snapshot: SyncQueueSnapshot;
};

export function SyncStatusScreen({
  isProcessing,
  onBack,
  onRetry,
  snapshot,
}: Props) {
  const pendingEvents = snapshot.events.filter(event => !event.synced);
  const syncedEvents = snapshot.events.filter(event => event.synced);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Offline API Queue</Text>
        <Text style={styles.title}>Sync Status</Text>
        <Text style={styles.subtitle}>
          Auth events are stored locally and deleted only after backend
          acknowledgement and purge confirmation.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <SummaryTile label="Pending" value={snapshot.pendingCount} tone="warn" />
        <SummaryTile label="Synced" value={snapshot.syncedCount} tone="ok" />
      </View>

      <View style={styles.actions}>
        <ActionButton
          label={isProcessing ? 'Syncing...' : 'Retry Sync Now'}
          onPress={onRetry}
          variant="secondary"
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}>
        <SectionTitle title="Pending Events" />
        {pendingEvents.length ? (
          pendingEvents.map(event => (
            <EventCard key={event.eventId} event={event} />
          ))
        ) : (
          <EmptyState copy="No pending auth events." />
        )}

        <SectionTitle title="Synced Awaiting Purge" />
        {syncedEvents.length ? (
          syncedEvents
            .slice()
            .reverse()
            .map(event => <EventCard key={event.eventId} event={event} />)
        ) : (
          <EmptyState copy="No synced events are waiting for purge." />
        )}
      </ScrollView>

      <View style={styles.bottomBar}>
        <ActionButton label="Back" onPress={onBack} />
      </View>
    </View>
  );
}

function SummaryTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'ok' | 'warn';
  value: number;
}) {
  return (
    <View style={styles.summaryTile}>
      <Text
        style={[
          styles.summaryValue,
          tone === 'ok' ? styles.summaryOk : styles.summaryWarn,
        ]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function SectionTitle({title}: {title: string}) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

function EmptyState({copy}: {copy: string}) {
  return <Text style={styles.empty}>{copy}</Text>;
}

function EventCard({event}: {event: QueuedAuthEvent}) {
  return (
    <View style={styles.jobCard}>
      <View style={styles.jobHeader}>
        <Text style={styles.jobTitle}>{event.result}</Text>
        <Text
          style={[
            styles.statusPill,
            event.synced ? styles.statusSynced : styles.statusPending,
          ]}>
          {event.synced ? 'SYNCED' : 'PENDING'}
        </Text>
      </View>
      <Text style={styles.jobMeta}>Event: {shortId(event.eventId)}</Text>
      <Text style={styles.jobMeta}>Client: {shortId(event.clientId)}</Text>
      <Text style={styles.jobMeta}>Captured: {formatDate(event.capturedAt)}</Text>
      <Text style={styles.jobMeta}>
        Face score: {Math.round(event.faceScore * 100)}%
      </Text>
      <Text style={styles.jobMeta}>
        Liveness: {Math.round(event.livenessScore * 100)}%
      </Text>
      {event.failureReason ? (
        <Text style={styles.error}>{event.failureReason}</Text>
      ) : null}
    </View>
  );
}

function shortId(value: string) {
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-5)}` : value;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

const styles = StyleSheet.create({
  actions: {
    marginTop: 14,
  },
  bottomBar: {
    paddingTop: 10,
  },
  container: {
    flex: 1,
    backgroundColor: '#f7f8fa',
    padding: 22,
  },
  empty: {
    color: '#6a7585',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 18,
  },
  error: {
    color: '#b42318',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  header: {
    gap: 8,
    paddingTop: 12,
  },
  jobCard: {
    backgroundColor: '#ffffff',
    borderColor: '#e1e7ef',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    marginBottom: 10,
    padding: 12,
  },
  jobHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  jobMeta: {
    color: '#526173',
    fontSize: 13,
    fontWeight: '700',
  },
  jobTitle: {
    color: '#172033',
    flex: 1,
    fontSize: 15,
    fontWeight: '900',
  },
  kicker: {
    color: '#123b73',
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  listContent: {
    paddingBottom: 18,
  },
  sectionTitle: {
    color: '#172033',
    fontSize: 17,
    fontWeight: '900',
    marginBottom: 8,
    marginTop: 20,
  },
  statusPending: {
    backgroundColor: '#fff4d9',
    color: '#9a6400',
  },
  statusPill: {
    borderRadius: 8,
    fontSize: 11,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  statusSynced: {
    backgroundColor: '#dff7ea',
    color: '#176b3c',
  },
  subtitle: {
    color: '#526173',
    fontSize: 15,
    lineHeight: 22,
  },
  summaryLabel: {
    color: '#526173',
    fontWeight: '800',
  },
  summaryOk: {
    color: '#176b3c',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  summaryTile: {
    backgroundColor: '#ffffff',
    borderColor: '#e1e7ef',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    padding: 14,
  },
  summaryValue: {
    fontSize: 30,
    fontWeight: '900',
  },
  summaryWarn: {
    color: '#b45309',
  },
  title: {
    color: '#172033',
    fontSize: 30,
    fontWeight: '900',
  },
});

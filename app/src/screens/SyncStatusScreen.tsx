import React from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {ActionButton} from '../components/ActionButton';
import type {SyncQueueJob, SyncQueueSnapshot} from '../faceAuth/syncQueueStore';

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
  const pendingJobs = snapshot.jobs.filter(job => job.status !== 'synced');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Offline API Queue</Text>
        <Text style={styles.title}>Sync &amp; Purge</Text>
        <Text style={styles.subtitle}>
          Auth events captured offline are saved locally and synced when the
          network returns. Once the server confirms an event, the device
          acknowledges and <Text style={styles.bold}>purges</Text> the local
          copy — no field data lingers on the phone.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <SummaryTile label="Pending" value={snapshot.pendingCount} tone="warn" />
        <SummaryTile
          label="Synced & purged"
          value={snapshot.purgedCount}
          tone="ok"
        />
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
        <SectionTitle title="Pending Calls" />
        {pendingJobs.length ? (
          pendingJobs.map(job => <JobCard key={job.id} job={job} />)
        ) : (
          <EmptyState copy="No pending API calls — everything is synced and purged." />
        )}

        <SectionTitle title="Purged This Session" />
        <Text style={styles.purgeNote}>
          {snapshot.purgedCount > 0
            ? `${snapshot.purgedCount} event${
                snapshot.purgedCount === 1 ? '' : 's'
              } synced to the server and removed from this device.`
            : 'Synced events are acknowledged and deleted from local storage. The count appears here once events sync.'}
        </Text>
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

function JobCard({job}: {job: SyncQueueJob}) {
  return (
    <View style={styles.jobCard}>
      <View style={styles.jobHeader}>
        <Text style={styles.jobTitle}>{getJobTitle(job)}</Text>
        <Text
          style={[
            styles.statusPill,
            job.status === 'synced'
              ? styles.statusSynced
              : job.status === 'syncing'
                ? styles.statusSyncing
                : job.status === 'failed'
                  ? styles.statusFailed
                : styles.statusPending,
          ]}>
          {job.status.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.jobMeta}>{getJobSubtitle(job)}</Text>
      <Text style={styles.jobMeta}>Attempts: {job.attempts}</Text>
      <Text style={styles.jobMeta}>Created: {formatDate(job.createdAt)}</Text>
      {job.lastAttemptAt ? (
        <Text style={styles.jobMeta}>
          Last attempt: {formatDate(job.lastAttemptAt)}
        </Text>
      ) : null}
      {job.syncedAt ? (
        <Text style={styles.jobMeta}>Synced: {formatDate(job.syncedAt)}</Text>
      ) : null}
      {job.lastError && job.status !== 'synced' ? (
        <Text style={styles.error}>{job.lastError}</Text>
      ) : null}
    </View>
  );
}

function getJobTitle(job: SyncQueueJob) {
  if (job.type === 'REGISTER_USER') {
    return 'User onboarding';
  }

  if (job.type === 'REGISTER_CLIENT') {
    return 'Client registration';
  }

  return 'Auth event sync';
}

function getJobSubtitle(job: SyncQueueJob) {
  if (job.type === 'REGISTER_USER') {
    return `User ID: ${job.payload.template.personnelId}`;
  }

  if (job.type === 'REGISTER_CLIENT') {
    return `User ID: ${job.payload.personnelId}`;
  }

  return `Result: ${job.payload.event.result}`;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

const styles = StyleSheet.create({
  actions: {
    marginTop: 14,
  },
  bold: {
    fontWeight: '900',
    color: '#172033',
  },
  bottomBar: {
    paddingTop: 10,
  },
  purgeNote: {
    color: '#526173',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
    marginBottom: 18,
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
    justifyContent: 'space-between',
    gap: 10,
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
  statusFailed: {
    backgroundColor: '#fee4e2',
    color: '#b42318',
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
  statusSyncing: {
    backgroundColor: '#dff0ff',
    color: '#175cd3',
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

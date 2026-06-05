import type {BackendAuthEventPayload} from './backendApi';
import type {FaceTemplate} from './types';
import {
  clearNativeSyncQueue,
  getNativeSyncQueue,
  saveNativeSyncQueue,
} from '../native/FaceTemplateStore';
import {logError, logInfo} from '../utils/logError';

export type SyncJobStatus = 'pending' | 'syncing' | 'synced';

export type SyncJobType =
  | 'AUTH_EVENT'
  | 'REGISTER_CLIENT'
  | 'REGISTER_USER';

export type RegisterUserJob = SyncJobBase & {
  payload: {
    template: FaceTemplate;
  };
  type: 'REGISTER_USER';
};

export type RegisterClientJob = SyncJobBase & {
  payload: {
    backendUserId?: string;
    personnelId: string;
    templateId: string;
  };
  type: 'REGISTER_CLIENT';
};

export type AuthEventJob = SyncJobBase & {
  payload: {
    event: BackendAuthEventPayload;
    templateId: string;
  };
  type: 'AUTH_EVENT';
};

export type SyncQueueJob =
  | AuthEventJob
  | RegisterClientJob
  | RegisterUserJob;

export type SyncQueueSnapshot = {
  jobs: SyncQueueJob[];
  pendingCount: number;
  syncedCount: number;
};

type SyncQueueListener = (snapshot: SyncQueueSnapshot) => void;

type SyncJobBase = {
  attempts: number;
  createdAt: string;
  id: string;
  lastAttemptAt?: string;
  lastError?: string;
  status: SyncJobStatus;
  syncedAt?: string;
  updatedAt: string;
};

const MAX_SYNCED_JOBS_TO_KEEP = 50;

let memoryQueue: SyncQueueJob[] = [];
const listeners = new Set<SyncQueueListener>();

export async function getSyncQueueSnapshot(): Promise<SyncQueueSnapshot> {
  const jobs = await readSyncQueue();
  return createSnapshot(jobs);
}

export function subscribeSyncQueue(listener: SyncQueueListener) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

export async function enqueueRegisterUserJob(template: FaceTemplate) {
  return upsertSyncQueueJob(
    createBaseJob('REGISTER_USER', `register-user-${template.templateId}`),
    existingJobs =>
      existingJobs.some(
        job =>
          job.type === 'REGISTER_USER' &&
          job.payload.template.templateId === template.templateId &&
          job.status !== 'synced',
      ),
    {
      template,
    },
  );
}

export async function enqueueRegisterClientJob(input: {
  backendUserId?: string;
  personnelId: string;
  templateId: string;
}) {
  return upsertSyncQueueJob(
    createBaseJob('REGISTER_CLIENT', `register-client-${input.templateId}`),
    existingJobs =>
      existingJobs.some(
        job =>
          job.type === 'REGISTER_CLIENT' &&
          job.payload.templateId === input.templateId &&
          job.status !== 'synced',
      ),
    input,
  );
}

export async function enqueueAuthEventJob(input: {
  event: BackendAuthEventPayload;
  templateId: string;
}) {
  return upsertSyncQueueJob(
    createBaseJob('AUTH_EVENT', input.event.eventId),
    existingJobs => existingJobs.some(job => job.id === input.event.eventId),
    input,
  );
}

export async function markSyncJobSyncing(jobId: string) {
  await updateSyncJob(jobId, job => ({
    ...job,
    attempts: job.attempts + 1,
    lastAttemptAt: new Date().toISOString(),
    status: 'syncing',
    updatedAt: new Date().toISOString(),
  }));
}

export async function markSyncJobSynced(jobId: string) {
  await updateSyncJob(jobId, job => ({
    ...job,
    lastError: undefined,
    status: 'synced',
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

export async function markSyncJobPending(jobId: string, error: unknown) {
  await updateSyncJob(jobId, job => ({
    ...job,
    lastError: normalizeError(error),
    status: 'pending',
    updatedAt: new Date().toISOString(),
  }));
}

export async function clearSyncQueue() {
  memoryQueue = [];
  await clearNativeSyncQueue();
  logInfo('sync-queue:clear', {});
  emitSyncQueueChange(memoryQueue);
}

async function upsertSyncQueueJob<
  Type extends SyncJobType,
  Payload extends SyncQueueJob['payload'],
>(
  baseJob: SyncJobBase & {type: Type},
  shouldSkip: (jobs: SyncQueueJob[]) => boolean,
  payload: Payload,
) {
  const jobs = await readSyncQueue();

  if (shouldSkip(jobs)) {
    logInfo('sync-queue:enqueue:skip-existing', {
      id: baseJob.id,
      type: baseJob.type,
    });
    return;
  }

  const nextJobs = compactSyncedJobs([
    ...jobs,
    {
      ...baseJob,
      payload,
    } as SyncQueueJob,
  ]);
  await writeSyncQueue(nextJobs);
  logInfo('sync-queue:enqueue', {
    id: baseJob.id,
    type: baseJob.type,
  });
}

async function readSyncQueue() {
  const persistedQueue = await getNativeSyncQueue();

  if (!persistedQueue) {
    return memoryQueue;
  }

  try {
    const parsedQueue = JSON.parse(persistedQueue) as SyncQueueJob[];
    memoryQueue = compactSyncedJobs(
      parsedQueue.map(job =>
        job.status === 'syncing'
          ? {
              ...job,
              lastError: job.lastError ?? 'App closed while sync was running.',
              status: 'pending',
            }
          : job,
      ),
    );
    return memoryQueue;
  } catch (error) {
    logError('sync-queue:parse-error', error);
    await clearNativeSyncQueue();
    memoryQueue = [];
    return memoryQueue;
  }
}

async function writeSyncQueue(jobs: SyncQueueJob[]) {
  memoryQueue = compactSyncedJobs(jobs);
  const persisted = await saveNativeSyncQueue(JSON.stringify(memoryQueue));
  logInfo('sync-queue:save', {
    jobs: memoryQueue.length,
    pending: memoryQueue.filter(job => job.status !== 'synced').length,
    persistence: persisted ? 'native' : 'memory-fallback',
    synced: memoryQueue.filter(job => job.status === 'synced').length,
  });
  emitSyncQueueChange(memoryQueue);
}

async function updateSyncJob(
  jobId: string,
  updateJob: (job: SyncQueueJob) => SyncQueueJob,
) {
  const jobs = await readSyncQueue();
  await writeSyncQueue(
    jobs.map(job => (job.id === jobId ? updateJob(job) : job)),
  );
}

function createBaseJob(type: SyncJobType, stableId: string) {
  const now = new Date().toISOString();

  return {
    attempts: 0,
    createdAt: now,
    id: `${type}-${stableId}`,
    status: 'pending' as const,
    type,
    updatedAt: now,
  };
}

function compactSyncedJobs(jobs: SyncQueueJob[]) {
  const pendingJobs = jobs.filter(job => job.status !== 'synced');
  const syncedJobs = jobs
    .filter(job => job.status === 'synced')
    .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt))
    .slice(0, MAX_SYNCED_JOBS_TO_KEEP);

  return [...pendingJobs, ...syncedJobs].sort((first, second) =>
    first.createdAt.localeCompare(second.createdAt),
  );
}

function createSnapshot(jobs: SyncQueueJob[]): SyncQueueSnapshot {
  return {
    jobs,
    pendingCount: jobs.filter(job => job.status !== 'synced').length,
    syncedCount: jobs.filter(job => job.status === 'synced').length,
  };
}

function emitSyncQueueChange(jobs: SyncQueueJob[]) {
  const snapshot = createSnapshot(jobs);
  listeners.forEach(listener => {
    listener(snapshot);
  });
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

import {
  postAuthEvent,
  postPurgeAck,
  registerBackendClient,
  registerBackendUser,
} from './backendApi';
import {
  deleteSyncJob,
  enqueueRegisterClientJob,
  getSyncQueueSnapshot,
  markSyncJobPending,
  markSyncJobSyncing,
  type AuthEventJob,
  type RegisterClientJob,
  type RegisterUserJob,
  type SyncQueueJob,
  type SyncQueueSnapshot,
} from './syncQueueStore';
import type {FaceTemplate} from './types';
import {
  getStoredFaceTemplate,
  saveStoredFaceTemplate,
} from './localTemplateStore';
import {logError, logInfo} from '../utils/logError';

let isProcessing = false;

export async function processSyncQueue(
  reason: string,
): Promise<SyncQueueSnapshot> {
  if (isProcessing) {
    logInfo('sync-queue:processor:skip', {
      reason,
      skipReason: 'already-processing',
    });
    return getSyncQueueSnapshot();
  }

  isProcessing = true;
  logInfo('sync-queue:processor:start', {reason});

  try {
    let snapshot = await getSyncQueueSnapshot();
    // A job that has already synced+purged is gone from the queue, so every
    // remaining job is actionable.
    const pendingJobs = [...snapshot.jobs];

    for (const job of pendingJobs) {
      await processJob(job);
      snapshot = await getSyncQueueSnapshot();
    }

    logInfo('sync-queue:processor:complete', {
      pendingCount: snapshot.pendingCount,
      reason,
      syncedCount: snapshot.syncedCount,
    });
    return snapshot;
  } finally {
    isProcessing = false;
  }
}

async function processJob(job: SyncQueueJob) {
  await markSyncJobSyncing(job.id);

  try {
    if (job.type === 'REGISTER_USER') {
      await processRegisterUserJob(job);
    } else if (job.type === 'REGISTER_CLIENT') {
      await processRegisterClientJob(job);
    } else {
      await processAuthEventJob(job);
    }

    // Synced (and, for auth events, purge-acked) successfully — purge the
    // local row. Backend ids from register jobs are already persisted onto the
    // stored template, so nothing is lost by deleting the queue entry.
    await deleteSyncJob(job.id);
    logInfo('sync-queue:processor:job-purged', {id: job.id, type: job.type});
  } catch (error) {
    logError('sync-queue:processor:job-error', error);
    await markSyncJobPending(job.id, error);
  }
}

async function processRegisterUserJob(job: RegisterUserJob) {
  const currentTemplate = await getStoredFaceTemplate();
  const activeTemplate = getActiveTemplate(job.payload.template, currentTemplate);

  if (activeTemplate.backendUserId) {
    await enqueueRegisterClientJob({
      backendUserId: activeTemplate.backendUserId,
      personnelId: activeTemplate.personnelId,
      templateId: activeTemplate.templateId,
    });
    return;
  }

  const backendUserId = await registerBackendUser(activeTemplate);
  const syncedTemplate: FaceTemplate = {
    ...activeTemplate,
    backendUserId,
  };
  await saveStoredFaceTemplate(syncedTemplate);
  await enqueueRegisterClientJob({
    backendUserId,
    personnelId: syncedTemplate.personnelId,
    templateId: syncedTemplate.templateId,
  });
  logInfo('sync-queue:register-user:synced', {
    backendUserId,
    personnelId: syncedTemplate.personnelId,
    templateId: syncedTemplate.templateId,
  });
}

async function processRegisterClientJob(job: RegisterClientJob) {
  const currentTemplate = await getStoredFaceTemplate();
  const backendUserId =
    currentTemplate?.templateId === job.payload.templateId
      ? currentTemplate.backendUserId
      : job.payload.backendUserId;

  if (!backendUserId) {
    throw new Error('Waiting for backend user id before client registration.');
  }

  if (
    currentTemplate?.templateId === job.payload.templateId &&
    currentTemplate.backendClientId
  ) {
    return;
  }

  const backendClientId = await registerBackendClient(backendUserId);

  if (currentTemplate?.templateId === job.payload.templateId) {
    await saveStoredFaceTemplate({
      ...currentTemplate,
      backendClientId,
      backendSyncedAt: new Date().toISOString(),
      backendUserId,
    });
  }

  logInfo('sync-queue:register-client:synced', {
    backendClientId,
    backendUserId,
    personnelId: job.payload.personnelId,
    templateId: job.payload.templateId,
  });
}

async function processAuthEventJob(job: AuthEventJob) {
  const currentTemplate = await getStoredFaceTemplate();

  if (!currentTemplate || currentTemplate.templateId !== job.payload.templateId) {
    throw new Error('Waiting for matching local template before auth event sync.');
  }

  if (!currentTemplate.backendClientId) {
    throw new Error('Waiting for backend client id before auth event sync.');
  }

  const {eventId} = job.payload.event;
  const syncResult = await postAuthEvent(currentTemplate.backendClientId, {
    ...job.payload.event,
    userId: currentTemplate.backendUserId ?? job.payload.event.userId,
  });

  // Server-confirmed = newly accepted OR already on the server (duplicate).
  // Only these are safe to purge; a rejected event stays queued (and will be
  // surfaced as failed) so we never delete data the server didn't accept.
  const confirmed = new Set([
    ...(syncResult.acceptedEventIds ?? []),
    ...(syncResult.duplicateEventIds ?? []),
  ]);
  if (!confirmed.has(eventId)) {
    throw new Error(`Auth event ${eventId} was not accepted by the server.`);
  }

  // Acknowledge the purge to the backend, then let processJob delete the local
  // row — completing the sync → purge lifecycle.
  await postPurgeAck(currentTemplate.backendClientId, [eventId]);
}

function getActiveTemplate(
  queuedTemplate: FaceTemplate,
  currentTemplate: FaceTemplate | null,
) {
  if (currentTemplate?.templateId === queuedTemplate.templateId) {
    return currentTemplate;
  }

  return queuedTemplate;
}

import {
  postAuthEvent,
  registerBackendClient,
  registerBackendUser,
} from './backendApi';
import {
  enqueueRegisterClientJob,
  getSyncQueueSnapshot,
  markSyncJobPending,
  markSyncJobSynced,
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
    const pendingJobs = snapshot.jobs.filter(job => job.status !== 'synced');

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

    await markSyncJobSynced(job.id);
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

  await postAuthEvent(currentTemplate.backendClientId, {
    ...job.payload.event,
    userId: currentTemplate.backendUserId ?? job.payload.event.userId,
  });
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

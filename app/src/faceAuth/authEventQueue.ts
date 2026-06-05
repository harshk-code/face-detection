import { enqueueAuthEventJob } from './syncQueueStore';
import { processSyncQueue } from './syncQueueProcessor';
import type { FaceMatchResult, FaceTemplate } from './types';
import { logError, logInfo } from '../utils/logError';

type AuthEventInput = {
  capturedAt: string;
  latencyMs: number;
  matchResult: FaceMatchResult;
  template: FaceTemplate;
};

export function enqueueAuthEventFireAndForget(input: AuthEventInput) {
  void enqueueAuthEvent(input);
}

async function enqueueAuthEvent({
  capturedAt,
  latencyMs,
  matchResult,
  template,
}: AuthEventInput) {
  try {
    const eventId = createEventId(template);
    await enqueueAuthEventJob({
      event: {
        capturedAt,
        eventId,
        faceScore: Number(matchResult.score.toFixed(6)),
        latencyMs,
        liveness: {
          passed: true,
          type: 'FACE_PRESENT',
        },
        modelVersion: template.modelVersion,
        result: matchResult.matched ? 'SUCCESS' : 'FAILED',
        threshold: matchResult.threshold,
        userId: template.backendUserId ?? null,
      },
      templateId: template.templateId,
    });
    logInfo('sync-queue:auth-event:queued', {
      eventId,
      result: matchResult.matched ? 'SUCCESS' : 'FAILED',
      templateId: template.templateId,
    });
    void processSyncQueue('auth-event-enqueued');
  } catch (error) {
    logError('sync-queue:auth-event:enqueue-error', error);
  }
}

function createEventId(template: FaceTemplate) {
  return `${template.templateId}-${Date.now()}`;
}

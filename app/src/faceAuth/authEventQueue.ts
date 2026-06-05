import { enqueueAuthEventJob } from './syncQueueStore';
import { processSyncQueue } from './syncQueueProcessor';
import type { FaceMatchResult, FaceTemplate } from './types';
import { logError, logInfo } from '../utils/logError';

type AuthEventInput = {
  capturedAt: string;
  latencyMs: number;
  matchResult: FaceMatchResult;
  template: FaceTemplate;
  /** Offline liveness outcome for this attempt (defaults to a present face). */
  liveness?: {
    passed: boolean;
    type: string;
  };
};

export function enqueueAuthEventFireAndForget(input: AuthEventInput) {
  void enqueueAuthEvent(input);
}

async function enqueueAuthEvent({
  capturedAt,
  latencyMs,
  liveness,
  matchResult,
  template,
}: AuthEventInput) {
  try {
    if (!matchResult.matched) {
      logInfo('sync-queue:auth-event:skip-failed', {
        score: Number(matchResult.score.toFixed(6)),
        templateId: template.templateId,
        threshold: matchResult.threshold,
      });
      return;
    }

    const eventId = createEventId(template);
    await enqueueAuthEventJob({
      event: {
        capturedAt,
        eventId,
        faceScore: Number(matchResult.score.toFixed(6)),
        latencyMs,
        liveness: liveness ?? {
          passed: true,
          type: 'FACE_PRESENT',
        },
        modelVersion: template.modelVersion,
        result: 'SUCCESS',
        threshold: matchResult.threshold,
        userId: template.backendUserId ?? null,
      },
      templateId: template.templateId,
    });
    logInfo('sync-queue:auth-event:queued', {
      eventId,
      result: 'SUCCESS',
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

/**
 * FaceAuth SDK — the stable, screen-independent surface of the offline
 * face-authentication engine. A host React Native app (e.g. Datalake 3.0) can
 * integrate recognition + liveness by importing from here and driving its own
 * UI, without depending on this project's screens or navigation.
 *
 * Everything below is pure logic over the on-device model + MediaPipe FaceMesh;
 * nothing here performs network I/O except the explicitly-named sync helpers.
 * See docs/INTEGRATION.md for a step-by-step integration guide.
 */

// --- Recognition (embedding + matching) ---------------------------------
export {generateFaceEmbedding} from '../embeddingModel';
export {matchFaceEmbedding} from '../matching';
export {
  cosineSimilarity,
  createCentroidEmbedding,
  l2Normalize,
} from '../vectorMath';

// --- Enrollment (multi-frame centroid template) -------------------------
export {createEnrollmentFaceEmbedding} from '../enrollmentTemplate';

// --- Liveness (offline anti-spoofing: blink + head-turn) ----------------
export {
  evaluateLiveness,
  eyeAspectRatio,
  headTurnRatio,
  livenessChallengeType,
  sampleLivenessFrame,
  type LivenessFrame,
  type LivenessProgress,
  type LivenessSignal,
} from '../verifyLiveness';

// --- Preprocessing + native FaceMesh ------------------------------------
export {createNormalizedFaceCrop} from '../preprocessing';
export {
  detectMediaPipeFaceMesh,
  type MediaPipeFaceMeshResult,
} from '../../native/MediaPipeFaceMesh';

// --- Offline sync + purge queue (network restore → sync → purge) --------
export {enqueueAuthEventFireAndForget} from '../authEventQueue';
export {processSyncQueue} from '../syncQueueProcessor';
export {
  getSyncQueueSnapshot,
  subscribeSyncQueue,
  type SyncQueueSnapshot,
} from '../syncQueueStore';

// --- Configuration + types ----------------------------------------------
export {
  FACE_AUTH_CONFIG,
  FACE_AUTH_MODEL_VERSION,
} from '../modelConfig';
export type {
  CapturedFacePhoto,
  EnrollmentEmbedding,
  EnrollmentPose,
  FaceEmbedding,
  FaceMatchResult,
  FaceTemplate,
  NormalizedFaceCrop,
} from '../types';

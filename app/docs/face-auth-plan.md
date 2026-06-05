# Offline Face Authentication Implementation

This document explains the current face-auth implementation in this React Native app. It is written as an engineering handoff: after reading it, a developer should understand the user flow, ML pipeline, local matching, storage, API sync, and the important tuning points.

## Objective

The app implements offline face onboarding and offline face verification for field personnel. The verification path does not require active internet because the face template is stored locally after onboarding.

The current implementation focuses on:

- React Native Android and iOS support.
- Front camera capture through VisionCamera.
- Native MediaPipe Face Mesh detection for face geometry and liveness.
- MobileFaceNet ArcFace embedding generation through TFLite.
- Local one-to-one cosine-similarity matching.
- Fire-and-forget backend sync through a retryable local queue.
- Developer diagnostics through structured logs, sync status, and a dev-only network logger.

## Current User Flow

### Fresh Install

1. App opens.
2. If no local face template exists, the user sees the intro/onboarding screen.
3. Tapping `Onboard` checks camera permission first.
4. If permission is allowed, the app opens the onboarding camera flow.
5. If permission is denied or blocked, the user stays on the intro screen and receives an app message or settings alert.

### Onboarding

1. A full-screen front camera opens.
2. The user follows textual prompts.
3. The app automatically captures frames. There is no manual capture CTA.
4. Liveness is checked by asking the user to turn slightly to one side and then to the opposite side.
5. After liveness passes, the app captures enrollment samples:
   - `front`
   - `left`
   - `right`
6. Each sample is cropped, normalized, and passed through MobileFaceNet.
7. The app validates that the samples are mutually consistent.
8. A centroid embedding is created from accepted samples.
9. The user fills the onboarding form with `User ID`.
10. The template is stored locally and a backend user-registration job is queued.
11. Navigation resets to `Home`.

### Login / Verification

1. User taps `Login`.
2. Camera permission is checked.
3. The login camera opens full-screen.
4. When a face is detected, capture and matching start automatically.
5. The live face crop is converted into a MobileFaceNet embedding.
6. The live embedding is compared against the locally stored template.
7. The app requires either a strong single match or enough good matches in a short rolling window.
8. On authentication success, the app navigates to `Profile`.
9. On mismatch, the user stays on the login camera screen and the app keeps retrying.

## Main Files

- `src/screens/IntroScreen.tsx` - first screen when no template exists.
- `src/screens/OnboardFaceScreen.tsx` - automatic liveness and multi-sample onboarding capture.
- `src/screens/OnboardUserFormScreen.tsx` - User ID form and template creation.
- `src/screens/HomeScreen.tsx` - login, update onboarding, clear data, sync status, and dev network logger entry points.
- `src/screens/VerifyFaceScreen.tsx` - automatic face verification flow.
- `src/screens/ProfileScreen.tsx` - authenticated state.
- `src/screens/SyncStatusScreen.tsx` - queue visibility and manual retry.
- `src/screens/NetworkLoggerScreen.tsx` - dev-only API/network viewer.
- `src/components/CaptureScreen.tsx` - shared full-screen camera shell.
- `src/components/CameraPanel.tsx` - VisionCamera preview and capture integration.
- `src/faceAuth/preprocessing.ts` - MediaPipe detection, crop calculation, native crop/resize/normalize call.
- `src/faceAuth/embeddingModel.ts` - MobileFaceNet TFLite loading and inference.
- `src/faceAuth/enrollmentTemplate.ts` - multi-sample enrollment validation and centroid generation.
- `src/faceAuth/matching.ts` - cosine matching logic.
- `src/faceAuth/localTemplateStore.ts` - local template persistence wrapper.
- `src/faceAuth/syncQueueStore.ts` - persistent sync queue.
- `src/faceAuth/syncQueueProcessor.ts` - queue processor and retry behavior.
- `src/faceAuth/backendApi.ts` - backend payloads and API calls.
- `src/faceAuth/authEventQueue.ts` - successful auth-event queueing.
- `src/app/FaceAuthContext.tsx` - app-level state, permission flow, hydration, and queue triggers.
- `src/dev/networkLogger.ts` - dev-only network logger setup.

## Models And Assets

### MobileFaceNet

The face-recognition model is:

```text
w600k_mbf_float16.tflite
```

It is configured in `src/faceAuth/modelConfig.ts`:

```ts
embeddingSize: 512
inputWidth: 112
inputHeight: 112
inputChannels: 3
normalizeMean: 127.5
normalizeStd: 128
similarityThreshold: 0.75
modelVersion: mobilefacenet_arcface_w600k_fp16_v1
```

Asset locations:

- `src/assets/models/w600k_mbf_float16.tflite`
- `android/app/src/main/assets/models/w600k_mbf_float16.tflite`
- `ios/MorthHackathon/Models/w600k_mbf_float16.tflite`

The model is about 6.5 MB, which fits comfortably below the hackathon target of about 20 MB.

### MediaPipe Face Mesh / Face Landmarker

MediaPipe is used through the app's native bridge:

- `src/native/MediaPipeFaceMesh.ts`
- Android native implementation.
- iOS native implementation.

The model asset is:

```text
src/assets/models/face_landmarker.task
```

MediaPipe is responsible for:

- Detecting whether a face is present in the captured image.
- Returning face bounds.
- Returning 478 facial landmarks.
- Providing landmark geometry for liveness and crop construction.

## Camera Usage

The camera stream is handled by `react-native-vision-camera`.

The app uses the front camera for both onboarding and login. The full-screen camera UI is shared through `CaptureScreen` and `CameraPanel`.

The current implementation intentionally uses capture-based processing for the heavy ML path:

1. VisionCamera shows the preview.
2. The app captures a still frame automatically.
3. MediaPipe runs on the captured image.
4. Native preprocessing crops/resizes/normalizes the face.
5. MobileFaceNet generates the embedding.
6. Local matching decides authentication.

This avoids running MobileFaceNet continuously on every preview frame.

## Face Detection And Liveness

Onboarding liveness is implemented in `OnboardFaceScreen.tsx`.

The liveness challenge is:

1. Turn slightly to one side.
2. Turn slightly to the opposite side.

The app auto-captures frames while prompting the user. It does not require the user to tap a capture button.

### Landmark Rule

The implementation uses these MediaPipe landmarks:

- Nose tip: `1`
- Left eye outer corner: `33`
- Right eye outer corner: `263`

It calculates:

```text
faceCenterX = (leftEye.x + rightEye.x) / 2
yawOffset = nose.x - faceCenterX
yawOffsetRatio = yawOffset / max(eyeDistance, faceBounds.width * 0.28, 1)
```

The first turn passes when:

```text
abs(yawOffsetRatio) >= 0.07
```

The opposite turn passes when either:

```text
sign changed
```

or:

```text
yawDeltaRatio >= 0.06
```

or:

```text
faceCenterDeltaRatio >= 0.025
```

These values are intentionally light because the user only needs a normal head movement, not an exaggerated turn.

Important logs:

- `face-auth:liveness:auto-capture-start`
- `face-auth:liveness:head-turn`
- `face-auth:liveness:first-turn-recorded`
- `face-auth:liveness:opposite-turn-recorded`
- `face-auth:liveness:turn-too-small`
- `face-auth:liveness:opposite-turn-rejected`

## Cropping And Preprocessing

Preprocessing lives in `src/faceAuth/preprocessing.ts`.

The pipeline is:

1. Accept the captured photo path from VisionCamera.
2. Run `detectMediaPipeFaceMesh(photoPath)`.
3. Build a square crop from MediaPipe landmarks.
4. Call the native crop function `createNativeNormalizedFaceCrop`.
5. Crop and resize to `112 x 112`.
6. Convert pixels to RGB.
7. Normalize every channel with:

```text
(pixel - 127.5) / 128
```

### Crop Strategy

The preferred crop strategy is landmark-aligned:

- Eye corners: `33`, `263`
- Mouth corners: `61`, `291`
- Chin: `152`
- Forehead: `10`

The crop uses eye distance, eye-to-mouth distance, and face height to build a stable square around the face. This is better than using a large generic bounding box because MobileFaceNet is sensitive to crop consistency.

If the required landmarks are missing, the code falls back to the MediaPipe face bounds with padding.

Important logs:

- `face-auth:preprocess:crop-input`
- `face-auth:preprocess:raw-pixels`
- `face-auth:preprocess:tensor`

## Embedding Generation

Embedding generation lives in `src/faceAuth/embeddingModel.ts`.

The TFLite model is loaded lazily through `react-native-fast-tflite`:

```ts
loadTensorflowModel(require('../assets/models/w600k_mbf_float16.tflite'), 'default')
```

The normalized `112 x 112 x 3` RGB tensor is passed into MobileFaceNet. The model returns a 512-dimensional embedding.

The embedding is L2-normalized before storage or matching. After normalization, cosine similarity becomes a direct dot-product style comparison between two unit vectors.

Important logs:

- `face-auth:tflite:load-model`
- `face-auth:tflite:run`
- `face-auth:tflite:output`
- `face-auth:embedding:normalized`

## Enrollment Template

Enrollment template creation lives in `src/faceAuth/enrollmentTemplate.ts`.

Onboarding captures three enrollment poses:

- `front`
- `left`
- `right`

Each pose becomes an individual embedding sample. The app then:

1. Creates an initial centroid from all samples.
2. Scores each sample against that centroid.
3. Rejects inconsistent samples when their centroid score is below `0.55`.
4. Requires at least `2` accepted samples.
5. Creates the final stored template embedding as the centroid of the accepted samples.

This improves reliability compared with a single enrollment image because verification can match against both the centroid and individual pose samples.

Stored template shape includes:

- `templateId`
- `personnelId`
- `displayName`
- `embedding`
- `enrollmentEmbeddings`
- `threshold`
- `modelVersion`
- `createdAt`
- backend ids after sync, when available

Important logs:

- `face-auth:onboard:sample-ready`
- `face-auth:onboard:sample-set-rejected`
- `face-auth:onboard:multi-sample-template`
- `face-auth:onboard:embedding-ready`

## Matching Logic

Matching lives in `src/faceAuth/matching.ts`.

The live embedding is compared against:

1. The stored centroid embedding.
2. Each stored enrollment sample embedding.

The displayed score is:

```text
max(centroidScore, bestSampleScore)
```

Authentication sample match passes when either:

```text
centroidScore >= 0.75
```

or:

```text
bestSampleScore >= 0.8
```

The `0.75` threshold comes from `FACE_AUTH_CONFIG.similarityThreshold`. The pose-sample threshold is stricter because matching directly against one enrollment pose can otherwise be too permissive.

Login also adds a rolling confirmation layer in `VerifyFaceScreen.tsx`:

- Window size: `3`
- Required good matches in window: `2`
- Strong single-match threshold: `0.82`
- Retry delay: `650 ms`

So the app authenticates when:

- One capture is very strong: `score >= 0.82`, or
- At least 2 out of the last 3 captures are above the normal threshold.

Mismatch text intentionally does not expose the exact score to the user. Scores remain available in logs for debugging.

Important logs:

- `face-auth:match`
- `face-auth:verify:sample-accepted`
- `face-auth:verify:sample-rejected`

## Local Storage

Local template storage is wrapped by `src/faceAuth/localTemplateStore.ts`.

It calls the native `FaceTemplateStore` module:

- `getTemplate`
- `saveTemplate`
- `clearTemplate`

The sync queue uses the same native bridge:

- `getSyncQueue`
- `saveSyncQueue`
- `clearSyncQueue`

If the native module is unavailable, the JS wrappers fall back to memory for the current app session. On a proper native build, persistence should be native and survive app relaunch.

Clear all data removes:

- Stored local face template.
- Pending/synced sync queue jobs.
- Pending in-memory onboarding embedding.

## Backend Sync

Backend sync is fire-and-forget. API failures must not block onboarding or login.

The current base URL is hardcoded in `src/faceAuth/backendApi.ts`:

```text
https://c24-bff-service-stage.qac24svc.dev/
```

Tenant header:

```text
x-tenant-id: Cars24
```

### API Calls

#### Register User

Called after onboarding form save through the sync queue.

```text
POST /api/users
```

Payload is built from the local template and includes:

- employee/user id
- name
- role
- model version
- similarity threshold
- primary centroid embedding
- enrollment sample embeddings
- liveness metadata
- app version and platform

The app expects the backend response to contain a user id in one of:

- `id`
- `userId`
- `data.id`
- `data.userId`

#### Register Client

Called after a backend user id exists.

```text
POST /api/clients
```

Payload includes:

- backend user id
- device type
- device name
- platform
- app version
- offline auth enabled flag

The app expects the backend response to contain a client id in one of:

- `clientId`
- `id`
- `data.clientId`
- `data.id`

#### Sync Auth Event

Called after a successful local face match has been queued and a backend client id exists.

```text
POST /api/clients/{CLIENT_ID}/sync/events
```

Important current behavior:

- Only successful match events are queued.
- Failed match events are not queued or synced.
- This was intentional to remove `FAILED` auth-event sync from the project.

Payload includes:

- event id
- result: `SUCCESS`
- face score
- threshold
- latency
- model version
- liveness info
- captured timestamp
- backend user id when available

## Sync Queue

The queue is implemented in:

- `src/faceAuth/syncQueueStore.ts`
- `src/faceAuth/syncQueueProcessor.ts`

Queue job types:

- `REGISTER_USER`
- `REGISTER_CLIENT`
- `AUTH_EVENT`

Queue statuses:

- `pending`
- `syncing`
- `failed`
- `synced`

Failed jobs remain in the queue and are retried later. The queue processor handles every job whose status is not `synced`.

Synced jobs are retained for visibility, capped to the latest `50` synced jobs.

### Queue Triggers

The queue is processed when:

- App hydration completes.
- The app returns to active state.
- Network connectivity is restored.
- The retry interval fires every `15 seconds`.
- Onboarding saves a template.
- A successful auth event is queued.
- User taps retry on the Sync Status screen.

### Sync Status Screen

The Sync Status screen displays:

- Pending count.
- Synced count.
- Job type.
- Job status.
- Attempt count.
- Last error.
- Manual retry button.

This is useful for checking whether API failures are being retried after the network returns.

## Dev Network Logger

The project includes a dev-only network logger using `react-native-network-logger`.

Startup lives in:

```text
src/dev/networkLogger.ts
```

Screen:

```text
src/screens/NetworkLoggerScreen.tsx
```

It is available from Home only in `__DEV__`.

Ignored local development hosts:

- `localhost`
- `127.0.0.1`
- `0.0.0.0`
- `10.0.2.2`
- Metro dev server URLs on `192.168.x.x:8081`

This screen is mainly for verifying backend calls without relying only on console logs.

## Performance Expectations

The target requirement is under 1 second.

Expected rough budgets:

- MediaPipe Face Mesh: under 50 ms target.
- MobileFaceNet inference: under 200 ms target.
- Cosine similarity: under 1 ms.
- Total capture-to-decision: under 1 second target.

Important note: the app should be benchmarked on physical mid-range Android and iOS devices before claiming final compliance. Console timings and logs are useful, but the final claim should come from release-style builds on real devices.

## Known Tuning Points

### Similarity Threshold

Current main threshold:

```text
0.75
```

Current pose-sample threshold:

```text
0.8
```

Current strong-match threshold:

```text
0.82
```

Lowering thresholds can make same-person login easier, but it increases false accepts. Raising thresholds improves security, but it may require better crop stability, lighting, and enrollment samples.

### Crop Stability

Most bad matches come from crop inconsistency, not cosine math itself. Watch these logs when tuning:

- `mediaPipeBounds`
- `cropRect`
- `strategy`
- tensor stats
- embedding stats
- `centroidScore`
- `bestSampleScore`
- `sampleScores`

### Enrollment Quality

The app already captures multiple samples. Accuracy can still improve by:

- Ensuring the face is large enough in frame.
- Avoiding harsh backlight.
- Keeping the same person in frame for all samples.
- Capturing clean front/left/right poses.
- Rejecting samples with poor blur/brightness once quality checks are added.

## Current Limitations

- The heavy ML path is still capture-based, not continuous real-time MobileFaceNet inference.
- Failed authentication attempts are intentionally not synced.
- Backend payload schema is app-driven and may need backend alignment.
- API auth headers beyond `x-tenant-id` are not implemented yet.
- No encrypted storage layer is documented in JS; storage depends on the native `FaceTemplateStore` implementation.
- Final performance numbers must be measured on physical devices.

## Useful Debug Logs

For a full onboarding or verification investigation, collect:

- `face-auth:liveness:*`
- `face-auth:preprocess:*`
- `face-auth:tflite:*`
- `face-auth:embedding:normalized`
- `face-auth:onboard:*`
- `face-auth:match`
- `face-auth:verify:*`
- `sync-queue:*`
- `backend:*`
- `app:camera-permission:*`
- `app:network-state`

The logs are intentionally JSON-stringified and copyable so model, crop, and sync issues can be shared and compared across devices.

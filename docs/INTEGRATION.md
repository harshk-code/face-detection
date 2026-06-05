# Integrating the FaceAuth engine into an existing React Native app

This guide explains how to drop the offline facial-recognition + liveness engine
into an existing React Native application such as **Datalake 3.0**, on both
Android and iOS. The engine is fully offline after install — no network is
required to enroll or authenticate.

> TL;DR: copy `src/faceAuth/` + the native modules, bundle two model files
> (~10 MB total), install three native dependencies, wrap your app in
> `FaceAuthProvider`, and call the SDK from `src/faceAuth/sdk`.

---

## 1. What you are integrating

| Layer | Path | Role |
|---|---|---|
| SDK facade | `app/src/faceAuth/sdk/index.ts` | The only import surface you need |
| Recognition | `embeddingModel.ts`, `matching.ts`, `vectorMath.ts` | MobileFaceNet embedding + cosine match |
| Enrollment | `enrollmentTemplate.ts` | Multi-frame centroid template |
| Liveness | `verifyLiveness.ts` | Offline blink (EAR) + head-turn anti-spoofing |
| Preprocessing | `preprocessing.ts` | 112×112 RGB normalized crop |
| Native FaceMesh | `native/MediaPipeFaceMesh.ts` (+ Android Kotlin / iOS Swift) | 478-point landmarks + native crop |
| Secure storage | `native/FaceTemplateStore.ts` (+ native) | Encrypted template + sync queue |
| Offline sync/purge | `syncQueueStore.ts`, `syncQueueProcessor.ts`, `authEventQueue.ts` | Queue → sync → purge on reconnect |
| State | `app/src/app/FaceAuthContext.tsx` | React provider + hook |

## 2. Native dependencies

Add to the host app's `package.json` and install:

```bash
yarn add react-native-vision-camera react-native-fast-tflite \
         @react-native-community/netinfo react-native-device-info
# iOS only:
cd ios && pod install
```

MediaPipe Tasks Vision is linked natively:
- **Android**: `com.google.mediapipe:tasks-vision` in `android/app/build.gradle`.
- **iOS**: `pod 'MediaPipeTasksVision'` in the `Podfile`.

Minimum platforms: **Android 8.0 (minSdk 26)**, **iOS 12+** (this repo targets
iOS 15.5). No GPU is required — the TFLite delegate is `default` (CPU).

## 3. Copy the engine + native modules

1. Copy `app/src/faceAuth/` and `app/src/native/` into the host's `src/`.
2. Copy the native modules into the host's native projects:
   - Android: `MediaPipeFaceMeshModule.kt`, `FaceTemplateStoreModule.kt`
     (+ their `ReactPackage`).
   - iOS: `MediaPipeFaceMesh.swift`, `FaceTemplateStore.swift` and their
     `*Bridge.m`; add them to the Xcode target.
3. Bundle the two model assets (see §4).

## 4. Bundle the model assets (~10 MB total)

| File | Size | Android | iOS |
|---|---|---|---|
| `w600k_mbf_float16.tflite` (recognition) | 6.5 MB | `android/app/src/main/assets/models/` | Xcode `Models/` group (Copy Bundle Resources) |
| `face_landmarker.task` (MediaPipe) | 3.6 MB | same | same |

The JS side references the TFLite asset via
`require('../assets/models/w600k_mbf_float16.tflite')`, so also keep a copy at
`src/assets/models/` for the Metro bundler.

## 5. Wrap the host app

```tsx
import {FaceAuthProvider} from './src/app/FaceAuthContext';

export default function App() {
  return (
    <FaceAuthProvider>
      <YourExistingNavigator />
    </FaceAuthProvider>
  );
}
```

## 6. Use the SDK from your own UI

You do **not** need this project's screens. Drive your own camera UI and call
the SDK. Two common paths:

### a) Authenticate (match-only) inside your existing login screen

```ts
import {
  generateFaceEmbedding,
  matchFaceEmbedding,
  createNormalizedFaceCrop,
  detectMediaPipeFaceMesh,
  sampleLivenessFrame,
  evaluateLiveness,
} from './src/faceAuth/sdk';

// 1. Gate on offline liveness (blink OR slight head-turn) across a few frames.
const frames = [];
for (const photoPath of capturedPhotoPaths) {
  frames.push(sampleLivenessFrame(await detectMediaPipeFaceMesh(photoPath)));
}
if (!evaluateLiveness(frames).passed) {
  return reject('liveness-failed'); // a static photo never passes
}

// 2. Crop → embed → match against the stored template.
const crop = await createNormalizedFaceCrop({photoPath, photoWidth, photoHeight});
const {vector} = await generateFaceEmbedding(crop);
const {matched, score, threshold} = matchFaceEmbedding(vector, storedTemplate);
```

### b) Enroll a user (multi-frame centroid template)

```ts
import {createEnrollmentFaceEmbedding, generateFaceEmbedding} from './src/faceAuth/sdk';

const samples = []; // capture front/left/right, embed each
for (const {crop, pose} of captures) {
  const {vector, modelVersion} = await generateFaceEmbedding(crop);
  samples.push({vector, pose, modelVersion, capturedAt: new Date().toISOString()});
}
const enrollment = createEnrollmentFaceEmbedding(samples); // centroid + samples
// persist `enrollment` into your FaceTemplate and store it securely
```

## 7. Offline sync + purge (optional, server-backed)

If you run the companion backend, the engine queues auth events locally and,
when connectivity returns, syncs then **purges** the local copy:

```ts
import {enqueueAuthEventFireAndForget, processSyncQueue} from './src/faceAuth/sdk';

enqueueAuthEventFireAndForget({capturedAt, latencyMs, matchResult, template,
  liveness: {passed: true, type: 'BLINK'}});
// Reconnect handling is automatic via NetInfo inside FaceAuthProvider;
// call processSyncQueue('manual') to flush on demand.
```

The queue is persisted in encrypted native storage, retried with ACK-before-
purge, and survives restarts. See `docs/TECHNICAL_DOCUMENTATION.md` §"Sync & Purge".

## 8. Configuration

All recognition constants live in `app/src/faceAuth/modelConfig.ts`:

| Constant | Value |
|---|---|
| Embedding size | 512 |
| Input | 112 × 112 × 3 RGB, normalized `(px − 127.5) / 128` |
| Face match threshold (cosine) | 0.75 |
| Pose-sample match threshold | 0.80 |
| Model | `mobilefacenet_arcface_w600k_fp16_v1` (FP16) |

Tune `similarityThreshold` to trade false-accepts vs false-rejects for your
population and lighting.

# Offline Face Authentication Plan

## Team-Approved ML Flow

1. Open the front camera with `react-native-vision-camera`.
2. Process the captured image with MediaPipe Face Mesh for face detection, landmarks, and crop geometry.
3. Run active liveness before identity matching.
4. Capture the frame after liveness passes.
5. Crop the detected face, align it, resize it to `112 x 112`, and convert it to RGB.
6. Normalize each pixel with `(pixel - 127.5) / 128`.
7. Run MobileFaceNet ArcFace TFLite FP16.
8. Compare the 512-dimensional embedding with the locally stored onboarding embedding using cosine similarity.
9. Accept when similarity is `>= 0.75`.
10. Store attendance/auth records locally and sync to AWS only when connectivity returns.

## Assets Copied From `Downloads/hackathon_files`

- `src/assets/models/w600k_mbf_float16.tflite`
- `android/app/src/main/assets/models/w600k_mbf_float16.tflite`
- `ios/MorthHackathon/Models/w600k_mbf_float16.tflite`
- `docs/test-images/srk1.png`
- `docs/test-images/srk2.png`
- `docs/test-images/random.png`

The model is about 6.5 MB, so it fits comfortably under the hackathon target of about 20 MB.

## Current Code State

Implemented:

- Metro recognizes `.tflite` and `.task` assets.
- MobileFaceNet config is centralized in `src/faceAuth/modelConfig.ts`.
- Cosine similarity remains local and real.
- The old ML Kit geometry embedding has been removed.
- Onboard and verify now call the real pipeline stages in order: captured photo to normalized crop to MobileFaceNet embedding.
- MediaPipe Face Landmarker is wired as a native bridge on Android and iOS for captured-photo face mesh detection.
- Face crop preprocessing is implemented with Nitro Image: load captured image, crop a padded square around the MediaPipe face mesh bounds, resize to `112 x 112`, convert raw pixels to RGB, then normalize.
- MobileFaceNet inference is wired through a lazy `react-native-fast-tflite` adapter.
- `react-native-fast-tflite` is installed and linked through Android autolinking and iOS Pods.
- MediaPipe Face Mesh liveness math is implemented as pure code in `src/faceAuth/faceMeshLiveness.ts`.

Still pending:

- Real-time MediaPipe Face Mesh frame processor for preview/liveness. The current moving preview box is still a UI guide from `react-native-vision-camera-face-detector`; the real authentication crop now uses MediaPipe after capture.
- SQLite persistence for local embeddings and pending attendance records.
- AWS sync and purge after server acknowledgment.

## Liveness Rule

For the first active challenge, show:

```text
Turn your head left
```

MediaPipe landmarks:

- Nose tip: `1`
- Left eye corner: `33`
- Right eye corner: `263`

Calculation:

```text
FaceCenterX = (LeftEyeX + RightEyeX) / 2
YawOffset = NoseX - FaceCenterX
```

The team-provided starting threshold is `25 px`. The code also exposes a normalized eye-distance ratio threshold because raw pixels vary by preview size and device.

## Recommended Dependency Direction

Do not install automatically from Codex. Manual install candidates:

```sh
yarn add react-native-fast-tflite react-native-quick-sqlite
```

For MediaPipe Face Mesh, the project now uses the official MediaPipe Tasks/Face Landmarker APIs through a small native module on each platform. A VisionCamera frame processor can be added next if we want the live preview/liveness challenge itself to be MediaPipe-backed instead of ML Kit-backed.

# Third-Party Licenses & Attribution

This project uses **only open-source technologies**; no proprietary components
and **no additional licenses are required** to build, run, or evaluate it. The
models and key dependencies and their licenses are listed below.

## Models

| Asset | Source / Lineage | License |
|---|---|---|
| `w600k_mbf_float16.tflite` — MobileFaceNet (ArcFace, WebFace600K) | InsightFace (deepinsight/insightface) model zoo | **MIT** |
| `face_landmarker.task` — MediaPipe Face Landmarker | Google MediaPipe | **Apache-2.0** |

- InsightFace project & models: https://github.com/deepinsight/insightface — MIT License.
- MediaPipe (incl. Face Landmarker model bundle): https://github.com/google-ai-edge/mediapipe — Apache License 2.0.

The MobileFaceNet/ArcFace weights are research/open-source artifacts from the
InsightFace ecosystem and are redistributable under MIT. The MediaPipe Face
Landmarker `.task` bundle is distributed by Google under Apache-2.0.

## Native runtime libraries

| Library | Purpose | License |
|---|---|---|
| `MediaPipeTasksVision` (iOS) / `tasks-vision` (Android) | Face landmarks | Apache-2.0 |
| TensorFlow Lite (via `react-native-fast-tflite`) | On-device inference | Apache-2.0 |

## React Native dependencies (npm)

| Package | Purpose | License |
|---|---|---|
| `react-native` | App framework | MIT |
| `react-native-vision-camera` | Camera | MIT |
| `react-native-fast-tflite` | TFLite bindings | MIT |
| `@react-native-community/netinfo` | Connectivity detection | MIT |
| `react-native-device-info` | Device metadata | MIT |
| `react-native-network-logger` | Dev-only network inspector | MIT |
| `@react-navigation/*` | Navigation | MIT |

## Backend / Panel

| Component | License |
|---|---|
| Go, Gin, MongoDB Go driver | Apache-2.0 / MIT (respective projects) |
| React, Vite | MIT |

> Attribution note: license identifiers reflect each upstream project's stated
> license at time of integration. Refer to each project's repository for the
> authoritative license text.

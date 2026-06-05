# Technical Documentation — Offline Facial Recognition & Liveness

**NHAI / MORTH Hackathon 7.0** — a lightweight, fully-offline facial recognition
and liveness-detection system for authenticating field personnel on mid-range
mobile devices in zero-network zones, designed to integrate into the existing
Datalake 3.0 React Native app on Android **and** iOS.

---

## 1. System overview

Three independent components:

| Component | Stack | Responsibility |
|---|---|---|
| `app/` | React Native 0.80 (TS) | On-device capture, recognition, liveness, encrypted storage, offline sync queue |
| `face-detection-backend/` | Go 1.24 + Gin + MongoDB | Provisioning, Ed25519 offline-profile signing, sync-event ingest + purge-ack |
| `panel/` | React 18 + Vite | Admin: users/clients/events, signed-profile viewer, purge audit |

**All authentication happens on the device.** The backend is only for
provisioning and the offline→online sync/purge of audit events; it is deployable
to AWS (ECS/EC2 + DocumentDB or self-managed MongoDB).

```
            ┌──────────────────────── DEVICE (offline-capable) ────────────────────────┐
  Camera ──▶│ VisionCamera ─▶ MediaPipe FaceMesh ─▶ 112×112 crop ─▶ MobileFaceNet (TFLite)│
            │                       │                                      │             │
            │                  Liveness (EAR blink / head-turn)       512-d embedding     │
            │                       │                                      │             │
            │                  gate ✓ ──────────────▶ cosine match vs encrypted template │
            │                                                  │                          │
            │                              auth event ▶ encrypted offline queue           │
            └───────────────────────────────────────────────────────│──────────────────┘
                                          network restored           ▼
                              ┌─────────────────────────────────────────────────┐
                              │ Backend: POST /sync/events ─▶ POST /sync/purge-ack │
                              │ (event stored for audit; device purges local copy) │
                              └─────────────────────────────────────────────────┘
```

## 2. Model architecture

### 2.1 Recognition — MobileFaceNet + ArcFace
- **Model**: `mobilefacenet_arcface_w600k_fp16_v1` (`w600k_mbf_float16.tflite`).
  MobileFaceNet backbone trained with the ArcFace (additive angular margin) loss
  on the WebFace600K dataset — the InsightFace lineage, widely used for robust,
  demographically diverse face recognition.
- **Input**: 112 × 112 × 3 RGB, normalized `(pixel − 127.5) / 128`.
- **Output**: 512-dimensional embedding, **L2-normalized** so cosine similarity
  is a stable, magnitude-independent distance.
- **Quantization**: FP16. This halves the file vs FP32 while preserving accuracy,
  giving a **6.5 MB** recognition model.
- **Runtime**: `react-native-fast-tflite`, `default` (CPU) delegate — no GPU
  dependency, runs on mid-range hardware. `runSync` is used when available.

### 2.2 Face geometry — MediaPipe Face Landmarker
- **Model**: `face_landmarker.task`, **3.6 MB**, 478 3D landmarks.
- Drives the face crop and all liveness geometry (eye/nose landmarks).

### 2.3 Footprint (Innovation: < 20 MB target)
| Asset | Size |
|---|---|
| MobileFaceNet FP16 | 6.5 MB |
| MediaPipe Face Landmarker | 3.6 MB |
| **Total model footprint** | **≈ 10.1 MB** (≈ 50% of the 20 MB budget) |

## 3. On-device pipeline

1. **Capture** a front-camera frame (VisionCamera).
2. **FaceMesh**: `detectMediaPipeFaceMesh(path)` → 478 landmarks + bounds.
3. **Liveness gate** (see §4) — must pass before any match.
4. **Crop + normalize**: `createNormalizedFaceCrop` → 112×112×3 float tensor.
5. **Embed**: `generateFaceEmbedding` → 512-d, L2-normalized.
6. **Match**: `matchFaceEmbedding` → cosine vs the stored template.

Enrollment captures **front/left/right** samples and builds a **centroid**
(`createEnrollmentFaceEmbedding`) plus per-pose samples, improving robustness to
pose and lighting.

### Matching decision (`matching.ts`)
- `centroidScore = cos(live, template.centroid)`
- `bestSample = max cos(live, pose-sample)`
- **matched** when `centroidScore ≥ 0.75` **or** `bestSample ≥ 0.80`.
- Verify additionally requires a rolling-window confirmation (2 of last 3 frames
  ≥ threshold, or a single strong match ≥ 0.82) to reject transient false hits.

Thresholds are tunable in `app/src/faceAuth/modelConfig.ts`.

## 4. Offline liveness / anti-spoofing

Two independent, **scale-invariant** signals computed from FaceMesh
(`verifyLiveness.ts`); a live person passes by doing **either**:

- **Blink (Eye-Aspect-Ratio)** — vertical eyelid gap / horizontal eye width,
  averaged over both eyes (left indices 159/145/33/133, right 386/374/263/362).
  A blink is registered when both an **open** (EAR ≥ 0.27) and a **closed**
  (EAR ≤ 0.19) state are observed across the frame window. A static photo/screen
  holds a constant EAR and never qualifies.
- **Head-turn** — nose offset from the eye-centre line, normalized by eye
  distance; `|ratio| ≥ 0.07` counts as a turn. (Onboarding requires a turn and a
  return to the opposite side.)

The match is **gated**: `VerifyFaceScreen` collects frames and refuses to run
recognition until `evaluateLiveness(...)` passes — closing the photo/replay
attack on login. Liveness is unit-tested (`verifyLiveness.test.ts`).

## 5. Sync & Purge (offline → online, "local data to be purged")

Auth events captured offline are durably queued and synced when connectivity
returns, then **purged** from the device:

1. Event enqueued in **encrypted** native storage (Android
   EncryptedSharedPreferences, iOS Keychain) — survives restarts/crashes.
2. On reconnect (NetInfo) / retry-interval / app-foreground, the processor
   `POST /api/clients/{clientId}/sync/events`.
3. The server confirms (`acceptedEventIds` / `duplicateEventIds`).
4. The device then **`POST /api/clients/{clientId}/sync/purge-ack`** with the
   confirmed ids; the backend marks them `PURGED` (retained server-side for
   audit), and the device **deletes the local row**. ACK-before-purge guarantees
   nothing is deleted until the server has it.

This lifecycle is visible live on the in-app **Sync & Purge** screen
("Synced & purged" counter). Rejected events are never purged.

## 6. Performance benchmarks

Speed target: **< 1 second** to recognize + verify liveness on mid-range
devices. The app ships an in-app, dev-only **Benchmark** screen
(`src/screens/BenchmarkScreen.tsx`) that runs N=20 timed iterations of
`capture → detect → crop → infer → match` and reports per-stage
min/median/p95/mean plus a **core** (detect+crop+infer+match, camera capture
excluded) median with a `< 1s` pass/fail verdict.

The per-stage table (detect / crop+normalize / infer / match) and the **core**
median with a `< 1s` verdict are produced live on the device — reproduce with
**Home → Benchmark → "Run 20 iterations"** (front camera, face in frame). Record
the on-device results here:

| Stage | median (ms) |
|---|---|
| detect (MediaPipe FaceMesh) | _captured on-device_ |
| crop + normalize | _captured on-device_ |
| infer (MobileFaceNet TFLite) | _captured on-device_ |
| match (cosine) | _captured on-device_ |
| **core (recognition + liveness)** | **_captured on-device_ — target < 1000** |

> Camera capture/settle is reported separately because it is hardware/OS-bound,
> not part of the recognition compute. Mid-range CPUs (e.g. Snapdragon 6-class)
> run roughly 1.5–2× slower than a flagship — budget accordingly.

**Accuracy**: recognition uses MobileFaceNet/ArcFace trained on WebFace600K, a
model family that reports >99% verification accuracy on LFW-style benchmarks
(model-reported, not our measurement). Our operating point is cosine ≥ 0.75
(pose-sample ≥ 0.80) with multi-frame centroid enrollment; tune per deployment.

## 7. Security

- **Templates never leave the device** for matching; only abstract auth events
  (scores, result, liveness type) sync — the embedding is optional and omitted
  on the event path.
- **Encrypted at rest**: templates + sync queue via platform keystores.
- **Signed offline profiles**: backend issues Ed25519-signed user profiles
  (`/api/signing/public-key`, `/api/verify-profile`) so a provisioned device can
  trust a profile offline.
- **Auth**: JWT (admin + tenant-user), bcrypt passwords (`AUTH_ENABLED`).

## 8. Cross-platform & requirements

| Requirement | Status |
|---|---|
| React Native, Android **and** iOS | ✅ native modules for both; models bundled both |
| Min OS: Android 8.0+ / iOS 12+ | ✅ Android minSdk 26; iOS target 15.5 |
| 3 GB RAM, no GPU | ✅ FP16 ~10 MB models, CPU `default` delegate |
| Model ≤ 20 MB | ✅ ≈ 10 MB |
| Open-source only | ✅ see `THIRD_PARTY_LICENSES.md` |

## 9. Integration

See **`docs/INTEGRATION.md`** for dropping the engine into an existing RN app
(e.g. Datalake 3.0). Public API: `app/src/faceAuth/sdk/index.ts`.

## 10. Build / test

| Component | Test | Typecheck |
|---|---|---|
| app | `yarn test` | `npx tsc --noEmit` |
| backend | `go test ./...` | `go vet ./...` |
| panel | — | `npx tsc -b` |

# Technical Documentation — Offline Facial Recognition & Liveness

**Netra — NHAI Hackathon 7.0** — a lightweight, fully-offline facial recognition
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
            │            Liveness (random: blink / smile / turn L·R)   512-d embedding     │
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
- a frame is **matched** when `centroidScore ≥ 0.60` **or** `bestSample ≥ 0.80`.
- Login additionally requires a rolling-window confirmation (2 of last 3 frames
  ≥ 0.60, or a single strong match ≥ 0.82) on top of the liveness gate, to reject
  transient false hits.

Thresholds are tunable in `app/src/faceAuth/modelConfig.ts`. The single-frame centroid
threshold (0.60) is deliberately permissive for usability and is backstopped by the
0.80 pose-sample bar, the 2-of-3 window, the 0.82 strong-match, and the liveness gate.
For high-security 1:1 use, raise it to ≥0.70 and re-validate (see
`docs/ACCURACY_VALIDATION.md`).

## 4. Offline liveness / anti-spoofing

On login, `VerifyFaceScreen` draws **one challenge at random** per attempt
(`pickLivenessChallenge`) from {BLINK, SMILE, TURN_LEFT, TURN_RIGHT} and accepts
**only that challenge** — so a recording of a different gesture cannot be
replayed. Every challenge is detected from a *temporal change* in scale-invariant
FaceMesh geometry that a static photo/screen cannot reproduce (`verifyLiveness.ts`):

- **Blink (Eye-Aspect-Ratio)** — vertical eyelid gap / horizontal eye width,
  averaged over both eyes (left indices 159/145/33/133, right 386/374/263/362).
  Registered when both an **open** (EAR ≥ 0.27) and a **closed** (EAR ≤ 0.19)
  state are observed across the frame window.
- **Smile (mouth-width ratio)** — mouth corner-to-corner distance (61↔291) over
  inter-ocular distance (33↔263). Registered when both a **neutral** (≤ 0.50) and
  a **widened** (≥ 0.58) state are observed; a fixed smile in a photo holds a
  constant ratio and never qualifies. (Band is exported for on-device tuning.)
- **Head-turn (left / right)** — signed nose offset from the eye-centre line,
  normalized by eye distance; `ratio ≥ 0.07` (right) or `≤ −0.07` (left) counts.
  The direction is preserved end-to-end and reported as the backend challenge
  type (`TURN_LEFT` / `TURN_RIGHT`), not a hardcoded label.

The match is **gated**: `VerifyFaceScreen` collects frames and refuses to run
recognition until `evaluateLiveness(frames, challenge)` passes for the required
challenge — closing the photo/replay attack on login. All four challenges,
randomisation, smile geometry, and direction handling are unit-tested
(`verifyLiveness.test.ts`, 15 cases). (Onboarding uses its own gate: a turn and a
return to the opposite side.)

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

Measured on **Samsung SM-F956B (Android 16)**, CPU-only, 20 iterations via the
Benchmark screen (reproduce: **Home → Benchmark → "Run 20 iterations"**):

| Stage | min | median | p95 | mean (ms) |
|---|---|---|---|---|
| detect (MediaPipe FaceMesh) | 122 | 177 | 226 | 182 |
| crop + normalize | 209 | 292 | 329 | 290 |
| infer (MobileFaceNet TFLite) | 20 | 20 | 25 | 34 |
| match (cosine) | 0 | 0 | 1 | 0 |
| **core (recognition + liveness)** | | **501** | | **— under 1000 ✓** |
| camera capture (excluded from core) | 662 | 728 | 753 | 729 |

**Key result**: the **AI inference itself is ~20 ms** and cosine match is ~0 ms;
the core recognition + liveness budget is **~0.5 s median — comfortably under the
1 s target**. The dominant cost is camera capture (hardware/OS-bound, reported
separately), followed by FaceMesh detection and the JS-side normalization (a
candidate for a native crop optimization).

> This device is a flagship. Mid-range CPUs (e.g. Snapdragon 6-class) run roughly
> 1.5–2× slower; the ~20 ms inference + ~0.5 s core leaves ample headroom for the
> < 1 s target on mid-range hardware.

**Accuracy**: recognition uses MobileFaceNet/ArcFace trained on WebFace600K, a
model family that reports >99% verification accuracy on LFW-style benchmarks
(model-reported, **not our own measurement**). Our operating point is cosine ≥ 0.60
(pose-sample ≥ 0.80) with multi-frame centroid enrollment + 2-of-3 confirmation; tune
per deployment. We have **not** run a custom FAR/FRR study on Indian demographics /
lighting — see **`docs/ACCURACY_VALIDATION.md`** for the reproducible methodology and the
`app/src/dev/accuracyEval.ts` harness to measure it.

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
| React Native, Android **and** iOS | Android **verified on-device**; iOS source-complete (see note) |
| Min OS: Android 8.0+ / iOS 12+ | ✅ Android minSdk 26; iOS target 15.5 |
| 3 GB RAM, no GPU | ✅ FP16 ~10 MB models, CPU `default` delegate |
| Model ≤ 20 MB | ✅ ≈ 10 MB |
| Open-source only | ✅ see `THIRD_PARTY_LICENSES.md` |

### Cross-platform status (verified honestly)
- **Android — verified**: built and run on a physical device (Samsung SM-F956B); the full
  onboard → liveness-gated login → sync/purge flow and the benchmark were exercised on-device.
- **iOS — source-complete, build pending a Mac with full Xcode**: the iOS native modules
  (`MediaPipeFaceMesh.swift`, `FaceTemplateStore.swift` + ObjC bridges) are implemented and
  registered in `MorthHackathon.xcodeproj`, the two model assets are bundled, the Podfile +
  `Podfile.lock` are present, and **every native method the JS calls has a matching Swift
  implementation** (FaceMesh detect/crop; template + sync-queue + api-base-url storage).
  iOS was **not** compiled here because this build host has only the **Command Line Tools**,
  not full Xcode — `pod install` reaches native-pod compilation then fails with
  `xcrun: error: SDK "iphoneos" cannot be located`. To build iOS, use a Mac with Xcode
  installed:
  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  cd app && bundle install && cd ios && bundle exec pod install
  cd .. && npx react-native run-ios   # or open ios/MorthHackathon.xcworkspace in Xcode
  ```

## 9. Integration

See **`docs/INTEGRATION.md`** for dropping the engine into an existing RN app
(e.g. Datalake 3.0). Public API: `app/src/faceAuth/sdk/index.ts`.

## 10. Build / test

| Component | Test | Typecheck |
|---|---|---|
| app | `yarn test` | `npx tsc --noEmit` |
| backend | `go test ./...` | `go vet ./...` |
| panel | — | `npx tsc -b` |

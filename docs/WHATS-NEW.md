# What's New — `feat/faceauth-complete`

This document records everything delivered on the `feat/faceauth-complete` branch so
reviewers and teammates understand the scope. It spans all three components
(mobile app, backend, admin panel) plus tooling, tests, and docs.

## TL;DR

Brought the system to production-grade robustness and security, and adopted a clean,
dependency-injected SDK architecture in the mobile app — closing the gaps against a
reference implementation. **41 app tests** + a full **backend test suite** are green;
verified on a real Android device.

---

## 1. Mobile app (`app/`)

### Architecture — FaceAuth SDK with dependency injection (`app/src/faceAuth/sdk/`)
- `interfaces.ts` — DI seams: `Embedder`, `FaceSample`, `AuthRequest`, `AuthOutcome`.
- `FaceAuthSdk.ts` — the `FaceAuth` facade: `enroll()` (quality-gate + average) and
  `authenticate()` (**liveness-gate-first** → embed → match) returning an explicit
  outcome + reason. Reuses the existing enrollment/matching/liveness modules.
- `mocks.ts` — deterministic `MockEmbedder`; `adapters.ts` — `TfliteEmbedder` (device).
- The facade is fully unit-testable in plain Node (no camera/TFLite).

### Recognition + liveness + enrollment
- **Liveness engine** (`liveness/geometry.ts` + `engine.ts`): EAR (blink), smile, yaw
  from MediaPipe FaceMesh; a randomized blink/smile/head-turn state machine with
  hysteresis, windowing, bounded retries (anti-replay). **Wired into the screens** —
  `OnboardFaceScreen` drives a HEAD_TURN challenge (replacing duplicated math);
  `VerifyFaceScreen` gates liveness before a login match via the SDK facade.
- **Multi-frame enrollment** (`enrollment.ts`): averages several quality-gated frames
  into one robust template; wired into onboarding.
- **Matching** (`matching.ts`): 1:1 `matchFaceEmbedding` + 1:N `identifyFace` with an
  anti-look-alike margin.

### Crash-safe offline sync (ACK-before-purge)
- `syncQueue.ts` — durable auth-event queue: idempotent enqueue, batched flush,
  mark-synced on accept/duplicate, and **delete only after the backend `/sync/purge-ack`**.
  Survives offline windows and crashes between ack and purge.
- `authEventQueue.ts` + `backendClient.ts` + `nativeEventStore.ts` wire it to the backend
  transport + encrypted native store. `syncAuthEventFireAndForget` now enqueues durably.
  Flushes on app start and on return to foreground (`AppState`).

### Encryption at rest
- **Android** `EncryptedSharedPreferences` (Keystore master key) for the face template
  and a new encrypted `EventQueueStore`, with plaintext→encrypted migration
  (`SecurePrefs.kt`, `FaceTemplateStoreModule.kt`, `EventQueueStoreModule.kt`).
- **iOS** `FaceTemplateStore.swift` moved to Keychain (+ migration); `EventQueueStore.swift`
  added (needs adding to the Xcode target — see CLAUDE.md gotcha #8).
- Verified on device: the template store holds AES-SIV ciphertext, **no plaintext embedding**.

### UX + robustness
- Onboard/Verify show challenge prompts + a liveness progress bar; Verify shows match
  score vs threshold; Home shows device + auth-event sync status.
- Fixed a verify zombie-loop (sample loop self-rescheduled after unmount → "Camera is not
  ready" spam) with mounted/done guards + a single camera-ready-kicked driver.
- "No face" / "camera not ready" are now calm transient prompts, not red errors.
- Removed per-frame log spam (`camera:v4:capture-*`, `liveness:update`).
- Schema reconcile: app emits the backend's result enum + `SyncEventInput` shape;
  **embeddings are never sent** (privacy).

### Tests + tooling
- 41 tests: sync queue, liveness geometry + engine, enrollment, matching, and a 5-test
  SDK **e2e** suite (enroll→verify pass, liveness-reject, wrong-person reject, quality
  gate, log→sync→purge) via `MockEmbedder`.
- Fixed the previously-broken Jest setup (virtual vision-camera mock, device-info mock,
  `transformIgnorePatterns`) so the whole suite — including the existing App smoke test — runs.

---

## 2. Backend (`face-detection-backend/`)

- **JWT auth** (`internal/auth`): HS256 admin + tenant-user tokens; `POST /api/admin/login`
  (env creds) guards management routes; `POST /api/login` returns a user token.
- **bcrypt** password hashing at rest with a constant-time legacy-plaintext fallback.
- **Ed25519 offline-profile signing** (`service/signing.go`): replaces the no-op signer;
  `GET /api/signing/public-key` + `POST /api/verify-profile`. Key from
  `PROFILE_SIGNING_SEED` or ephemerally generated.
- **Reactivate user**: `UpdateUserRequest` carries `Status` so soft-deleted users can be
  set back to ACTIVE.
- **Privacy-preserving sync**: `validateSyncEvent` accepts events without an embedding
  (validates the dimension only when present).
- New tests: auth gate, reactivation, bcrypt login, signing (+ tamper). Merged cleanly
  with main's `api-contract-changes` (single default-tenant model — see CLAUDE.md gotcha #1).

---

## 3. Admin panel (`panel/`)

- Admin **login screen** + token persistence (localStorage), `Authorization: Bearer` on
  every call, auto-logout on 401.
- **Offline-profile viewer** modal with a live signature-valid badge (`/verify-profile`).
- **Purge-ack UI** for PENDING auth events.
- User status edit / **one-click reactivate**.
- Aligned the Vite dev proxy to the backend default port (`18081`).

---

## Verification status

- Backend `go build` + `go test ./...` — green.
- App `npx tsc --noEmit` — 0 errors; `yarn test` — 41/41; ESLint clean.
- Android full APK `assembleDebug` — BUILD SUCCESSFUL.
- On a real Galaxy Z Fold: app runs, encrypted storage confirmed (no plaintext
  embedding), liveness UI + engine working with a real face, console clean (0 error/warn).

## Known follow-ups (not blocking)

- iOS: add the two `EventQueueStore` files to the Xcode target; `pod install`.
- Android 16: prebuilt native libs aren't 16 KB-aligned (NDK r28+/dep bumps for prod).
- Point `app/src/faceAuth/backendClient.ts` at the intended backend for end-to-end runs.
- Optional: int8 TFLite model (~1.2 MB vs current ~6.5 MB FP16); 1:N multi-user wiring.

## Commit trail

```
Merge remote-tracking branch 'origin/main' (resolve api-contract-changes conflicts)
fix(app): eliminate verify zombie-loop + console spam, graceful no-face handling
feat(app): SDK facade with DI, wire liveness engine into screens, e2e tests, UX
feat: reconcile event schema, foreground flush, multi-frame enrollment
feat: add auth, bcrypt, profile signing, user reactivation, and finish panel
docs(app): document offline-sync, liveness, enrollment, and encryption architecture
feat(app): offline sync queue, richer liveness, multi-frame enroll, 1:N, encrypted storage
```

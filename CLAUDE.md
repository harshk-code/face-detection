# CLAUDE.md — repo guide for developers & AI agents

Guidance for working in this repo. Read this before making changes.

## What this is

A three-part offline face-authentication system (see [README.md](README.md)):
- `app/` — React Native mobile app (on-device recognition + liveness + offline sync)
- `face-detection-backend/` — Go + Gin + MongoDB API (provisioning, signing, sync ingest)
- `panel/` — React + Vite admin panel

The three are independent builds. Most "face-auth" logic lives in
`app/src/faceAuth/`.

## Build / test / run

| Component | Install | Test | Typecheck | Run |
|---|---|---|---|---|
| backend | — | `go test ./...` | `go vet ./...` | `docker compose up -d mongo && go run ./cmd/server` |
| panel | `npm install` | — | `tsc -b` | `npm run dev` |
| app | `yarn install` | `yarn test` | `npx tsc --noEmit` | `yarn android` / `yarn ios` |

Always run the relevant test + typecheck before committing. Current green baseline:
backend `go test` passes; app `yarn test` = **41/41**, `tsc` = 0 errors.

## Conventions

- **Backend** is hexagonal: `domain` → `service` (business logic) → `store` (interface
  with `mongo` + `memory` impls) → `httpapi` (Gin handlers). Tests run against the
  in-memory store via the real handlers — no Mongo needed.
- **App face-auth** is dependency-injected behind an SDK facade (`app/src/faceAuth/sdk/`):
  `FaceAuth.enroll()` / `.authenticate()` depend only on interfaces (`Embedder`,
  configs), so the core is unit-testable with `MockEmbedder` (no camera/TFLite). Device
  wiring (`TfliteEmbedder`, native stores) plugs in via adapters. Prefer adding logic to
  the SDK + a unit test over putting it in a screen.
- **Liveness** math lives only in `app/src/faceAuth/liveness/` (`geometry.ts` +
  `engine.ts`). Screens drive the `LivenessEngine` — do not re-implement head-turn/EAR
  math in screens.

## Important gotchas (read these)

1. **Single default tenant.** The backend uses ONE tenant, `service.DefaultTenantID`
   (`"Cars24"`), seeded at startup via `EnsureDefaultTenant`. The `x-tenant-id` header
   is **ignored** — `tenantIDFromHeader` always returns the default. Tests must call
   `service.New(store).EnsureDefaultTenant(ctx)` in setup (see `newTestApp`).
2. **Backend default port is `18081`** (not 8080 — that's commonly taken locally). The
   panel's Vite proxy and the app expect `18081`. Override with `PORT` /
   `BACKEND_URL`.
3. **Auth.** `AUTH_ENABLED=true` by default. Admin token: `POST /api/admin/login` with
   `ADMIN_USERNAME`/`ADMIN_PASSWORD`. Tenant-user token: `POST /api/login`. Passwords are
   bcrypt-hashed (legacy plaintext has a constant-time fallback). Dev defaults log a
   warning — set real `JWT_SECRET`/`ADMIN_PASSWORD`/`PROFILE_SIGNING_SEED` in prod.
4. **Offline profiles are Ed25519-signed.** `GET /api/signing/public-key` +
   `POST /api/verify-profile`. Set `PROFILE_SIGNING_SEED` to a stable base64 32-byte seed;
   otherwise an ephemeral key is generated (logged).
5. **App backend URL** is `https://api.cars24.com/gw/plt/bffsvc` in
   `app/src/faceAuth/backendClient.ts`. Point at the local backend for end-to-end testing.
6. **Embeddings are never sent on the wire.** Sync events carry only the abstract result;
   the backend treats embedding as optional (`hasMobileEventFields`).
7. **Android 16 / 16 KB pages.** On Android 15+ a "not 16 KB-compatible" advisory may show
   for debuggable builds — the prebuilt native libs (TFLite, Hermes, MediaPipe, worklets)
   aren't 16 KB-aligned yet. Non-blocking on 4 KB-page devices; fix for prod = NDK r28+ /
   updated deps.
8. **iOS event-store wiring.** `app/ios/MorthHackathon/EventQueueStore.swift` +
   `EventQueueStoreBridge.m` must be added to the Xcode target (the template-encryption
   Keychain change is already wired). Until then iOS falls back to an in-memory queue;
   Android is fully wired.

## Running the app on a device (notes)

- Debug builds load JS from Metro: `yarn start` (or `npx react-native start --port <p>`)
  and `adb reverse tcp:8081 tcp:<p>`.
- JS-only changes don't need a native rebuild — reload the bundle.
- Native changes (Kotlin/Swift/gradle) need `yarn android` / a Gradle rebuild.

## Git

- Work on feature branches; `feat/faceauth-complete` carries the consolidated work.
- The remote `origin` is `harshk-code/face-detection` (write access required to push).
- Run the component's tests + typecheck before committing.

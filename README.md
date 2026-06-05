# Face Detection — Offline Face Authentication for Field Personnel

A **mobile, fully-offline** facial recognition + liveness system for authenticating
field personnel in zero-network zones, with a multi-tenant backend for provisioning
and audit, and an admin panel for operations. Built for the NHAI/MORTH hackathon.

> **Problem:** authenticate field staff via face + liveness on mid-range phones with
> **no internet**, then sync the audit trail to the backend when connectivity returns —
> without ever sending biometrics off the device.

---

## Repository layout

This is a monorepo with three independently buildable components:

```
face-detection/
├── app/                      React Native mobile app ("MorthHackathon")
│   ├── src/faceAuth/         On-device face-auth core (recognition, liveness, sync)
│   │   ├── sdk/              FaceAuth SDK facade (dependency-injected, testable)
│   │   ├── liveness/         EAR/smile/yaw geometry + challenge state machine
│   │   └── ...               matching, enrollment, embedding, sync queue
│   ├── src/screens/          Intro → Onboard → Verify → Home/Profile
│   ├── android/ · ios/       Native modules (MediaPipe FaceMesh, encrypted stores)
│   └── __tests__/            41 unit + e2e tests (no device needed)
│
├── face-detection-backend/   Go + Gin + MongoDB API
│   └── internal/
│       ├── domain/           Tenant, User, Client, AuthEvent models
│       ├── service/          Business logic: provisioning, signing, sync
│       ├── auth/             JWT (HS256) admin + tenant-user tokens
│       ├── httpapi/          Routes + handlers
│       └── store/            Mongo + in-memory implementations
│
└── panel/                    React + Vite admin panel
```

---

## Architecture

```
   ┌──────────────────────────── PHONE (offline) ─────────────────────────────┐
   │  Camera → MediaPipe FaceMesh → liveness (head-turn) → MobileFaceNet TFLite │
   │  → 512-d embedding → cosine match vs encrypted local template             │
   │  → auth event queued locally (encrypted)                                  │
   └───────────────────────────────────┬───────────────────────────────────────┘
                                        │  when network returns (ACK-before-purge)
                                        ▼
   ┌──────────────────── BACKEND (Go + MongoDB) ───────────────────┐      ┌─────────────┐
   │  /api/users /clients  · offline-profile (Ed25519 signed)      │◄────►│ Admin panel │
   │  /sync/events → /sync/purge-ack  · JWT auth · bcrypt          │      │ (React/Vite)│
   └───────────────────────────────────────────────────────────────┘      └─────────────┘
```

**Biometric privacy:** face images are never stored or transmitted. Only abstract
embeddings live on-device (encrypted), and only abstract auth events (result, scores,
liveness) are synced — never the embedding.

---

## Key features

| Area | What it does |
|---|---|
| **On-device recognition** | MobileFaceNet ArcFace (w600k FP16, 512-d) via TFLite — runs fully offline |
| **Liveness** | Randomized blink/smile/head-turn challenge state machine (EAR/MAR/yaw geometry); anti-replay |
| **Multi-frame enrollment** | Averages several quality-gated frames into one robust template |
| **Encryption at rest** | Templates + auth-event queue in Android `EncryptedSharedPreferences` / iOS Keychain |
| **Crash-safe offline sync** | ACK-before-purge queue — idempotent, batched, survives offline windows + restarts |
| **Signed offline profiles** | Backend signs each offline profile with Ed25519 (tamper-evident, verifiable offline) |
| **Auth** | JWT (HS256) admin + tenant-user tokens; bcrypt password hashing |
| **Admin panel** | Provision tenants/users/devices, view events, purge-ack, signed-profile viewer |

---

## Quick start

### Backend
```bash
cd face-detection-backend
docker compose up -d mongo
go run ./cmd/server            # listens on :18081 by default
go test ./...                  # in-memory store, no Mongo needed
```

### Admin panel
```bash
cd panel
npm install
npm run dev                    # http://127.0.0.1:5173 (proxies /api -> :18081)
```

### Mobile app
```bash
cd app
yarn install
yarn test                      # 41 unit + e2e tests, no device
yarn android                   # build + run on a connected device/emulator
```
> Requires the TFLite + MediaPipe model assets under `app/{android,ios}/.../assets/models/`.
> See [app/README.md](app/README.md) for the on-device architecture and an iOS wiring note.

---

## Documentation

- **[CLAUDE.md](CLAUDE.md)** — repo guide for developers + AI agents (structure, commands, conventions, gotchas)
- **[docs/WHATS-NEW.md](docs/WHATS-NEW.md)** — what the `feat/faceauth-complete` work added (gap analysis + features)
- **[app/README.md](app/README.md)** — mobile app / face-auth SDK architecture
- **[face-detection-backend/README.md](face-detection-backend/README.md)** — backend API, auth, signing
- **[face-detection-backend/docs/](face-detection-backend/docs/)** — PRD, technical design, test plan, user stories

---

## Tech stack

- **Mobile:** React Native 0.80, TypeScript, react-native-vision-camera, react-native-fast-tflite, MediaPipe Tasks Vision, androidx.security / iOS Keychain
- **Backend:** Go 1.24, Gin, MongoDB, golang-jwt, bcrypt, Ed25519
- **Panel:** React 18, Vite, TypeScript

# Face Detection Backend

Stage 1 offline face-auth backend built with Go, Gin, and MongoDB.

## Run locally

```bash
docker compose up -d mongo
go run ./cmd/server
```

Defaults:

- `PORT=18081` (matches the panel's Vite dev proxy)
- `MONGO_URI=mongodb://localhost:27017`
- `MONGO_DATABASE=face_detection`

See [.env.example](.env.example) for the full set of variables.

## Authentication

When `AUTH_ENABLED=true` (default), routes are protected with JWT bearer tokens:

- **Admin** — `POST /api/admin/login` with `ADMIN_USERNAME`/`ADMIN_PASSWORD`
  returns an admin token that grants access to all management routes
  (tenants, users, clients, admin reports) across every tenant.
- **Tenant user** — `POST /api/login` (with the `x-tenant-id` header) verifies
  the user's bcrypt password and returns a tenant-scoped token. User tokens can
  only reach device routes for their own tenant; the `x-tenant-id` header is
  ignored in favour of the token's tenant, enforcing isolation.

User passwords are hashed with bcrypt at rest. Set `AUTH_ENABLED=false` to run
fully open for local experimentation.

## Offline-profile signing

Offline profiles are signed with Ed25519 so devices can verify authenticity and
the `validUntil` expiry while offline.

- `GET /api/signing/public-key` — advertises the public key + algorithm.
- `POST /api/verify-profile` — verifies a `{ profile, signature }` pair.

Set `PROFILE_SIGNING_SEED` (base64 32-byte seed) to use a stable key; otherwise
an ephemeral key is generated at startup and logged.

## Test

```bash
go test ./...
```

The test suite uses an in-memory store through the same handlers and services, so it does not require a running Mongo instance.

## API docs

OpenAPI contract: [openapi.yaml](openapi.yaml)

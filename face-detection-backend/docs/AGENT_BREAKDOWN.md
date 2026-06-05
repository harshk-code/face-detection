# Agent Breakdown: Stage 1 Offline Face Auth Backend

## Summary

Build the Stage 1 backend in the backend project using Go 1.24, Gin, and pluggable persistence. The hackathon/local runtime uses JSON files by default; MongoDB is optional.

Stage 1 goal: working backend APIs for tenant, user, client onboarding, offline profile generation, bulk sync, purge acknowledgement, and admin/demo views. No auth in Stage 1. Stage 2 will add JWT everywhere.

Core rule: Stage 1 login returns `tenantId` and `userId`; the app uses those ids once to register the device. After device registration, app sends only `clientId`, and backend resolves tenant and user from `clientId`.

## Agent 1: Project Scaffold And App Foundation

Goal: Create the Go backend skeleton.

Build:

- Go module targeting Go 1.24.
- Gin HTTP server.
- File-store setup and optional MongoDB connection setup.
- Environment config loading.
- Health endpoint.
- Shared response/error format.
- Basic request validation helpers.
- App layering:
  - handlers
  - services
  - repositories
  - models
  - config

Required dependencies:

- Gin.
- MongoDB Go driver for optional Mongo-backed runs.
- Validator package.
- UUID package.
- Test/assertion package.

Acceptance:

- `GET /health` returns success.
- App starts without requiring MongoDB by default.
- Tests can run without requiring production Mongo config.
- No auth middleware exists.

## Agent 2: Domain Models And Store Repositories

Goal: Implement persistence models and repository methods.

Collections:

- `tenants`
- `users`
- `clients`
- `auth_events`

Rules:

- No DBRef-style relationships.
- Store ids only.
- Use soft delete/status fields.
- `employeeId` is unique within tenant only.
- `clientId` is globally unique and backend-generated.
- Client stores `tenantId` and `userId`.
- Auth events store resolved `tenantId`, `userId`, and `clientId`.

Required models:

- Tenant.
- TenantConfig.
- ModelConfig.
- LivenessConfig.
- User.
- UserEmbedding.
- Client.
- AuthEvent.
- PurgeStatus.
- AuthEventResult enum.

Indexes:

- Users: unique `(tenantId, employeeId)`.
- Clients: unique `clientId`.
- Auth events: unique `(clientId, eventId)`.

Acceptance:

- Repositories support create, get, list, update, and soft delete.
- Duplicate user employee id fails only inside same tenant.
- Duplicate event id for same client does not create a second event.

## Agent 3: Tenant APIs

Goal: Implement tenant CRUD and config validation.

APIs:

- `POST /api/tenants`
- `GET /api/tenants`
- `GET /api/tenants/{tenantId}`
- `PUT /api/tenants/{tenantId}`
- `DELETE /api/tenants/{tenantId}`

Tenant config must support:

- `MODEL_CONFIG`
  - `modelVersion`
  - `faceThreshold`
  - `livenessThreshold`
  - `embeddingDimension`
  - `modelChecksum`
  - `active`
- `LIVENESS_CONFIG`
  - `challengeTypes`
  - `active`

Acceptance:

- Create tenant with valid config works.
- Missing model config fails.
- Invalid thresholds fail.
- Invalid embedding dimension fails.
- Delete soft-deletes tenant.
- Inactive tenant is not eligible for offline profile generation.

## Agent 4: User APIs And Enrollment

Goal: Implement user onboarding and CRUD under tenant.

APIs:

- `POST /api/tenants/{tenantId}/users`
- `GET /api/tenants/{tenantId}/users`
- `GET /api/tenants/{tenantId}/users/{userId}`
- `PUT /api/tenants/{tenantId}/users/{userId}`
- `DELETE /api/tenants/{tenantId}/users/{userId}`

User fields:

- `employeeId`
- `name`
- `role`
- `status`
- `embeddings`

Embedding rules:

- Multiple vectors allowed.
- Vector dimension must match tenant model config.
- Store embeddings inside user document for Stage 1.

Acceptance:

- User create validates tenant exists and is active.
- Duplicate employee id inside same tenant fails.
- Same employee id in different tenant succeeds.
- Embedding dimension mismatch fails.
- Updating embeddings changes future offline profile output.
- Soft-deleted user cannot generate offline profile.

## Agent 5: Login, Client APIs, And Client Resolver

Goal: Implement Stage 1 login context, app-driven client creation, and the deep resolver module.

Stage 1 login API:

- `POST /api/login`

Stage 1 login behavior:

- Returns `tenantId` and `userId`.
- These ids are used by the app when the user taps register device.
- Stage 2 replaces this with JWT; backend decodes tenant/user from token claims.

Client creation API:

- `POST /api/clients`

Client management APIs:

- `GET /api/tenants/{tenantId}/clients`
- `GET /api/tenants/{tenantId}/clients/{clientId}`
- `PUT /api/tenants/{tenantId}/clients/{clientId}`
- `DELETE /api/tenants/{tenantId}/clients/{clientId}`

Client metadata:

- `deviceType`
- `deviceName`
- `platform`
- `appVersion`
- optional `imei`
- `status`
- `activatedAt`
- `deactivatedAt`

Resolver behavior:

- Input: `clientId`.
- Output: client, tenant, user, and eligibility state.
- Reject unknown client.
- Reject inactive tenant, user, or client for offline profile.
- Client ownership cannot be reassigned.
- Client update can change metadata/status only.

Acceptance:

- Login returns `tenantId` and `userId` for the app.
- Client creation accepts `tenantId`, `userId`, and device metadata from the app in Stage 1.
- Client creation validates tenant/user belong together.
- Backend generates globally unique opaque `clientId`.
- App never needs tenantId/userId after device registration.
- Deactivated client cannot fetch offline profile.
- Resolver is unit-tested separately.

## Agent 6: Offline Profile API

Goal: Generate mobile offline profile using only `clientId`.

API:

- `GET /api/clients/{clientId}/offline-profile`

Response includes:

- `clientId`
- `tenantId`
- `userId`
- `employeeId`
- `userName`
- `modelConfig`
- `livenessConfig`
- `embeddings`
- `validUntil`
- `signature`

Stage 1 signature:

- Keep `signature` field.
- Return `null`.
- Implement signer interface with no-op Stage 1 implementation.

Acceptance:

- Valid `clientId` returns full profile.
- Request does not require tenantId or userId after device registration.
- Unknown client returns not found.
- Inactive tenant/user/client returns conflict.
- Signature field exists and is null.
- Profile changes when tenant config or user embeddings change.

## Agent 7: Bulk Event Sync API

Goal: Store offline verification logs from the app.

API:

- `POST /api/clients/{clientId}/sync/events`

Request:

- array of events.
- maximum 100 events.
- each event has mobile-generated `eventId`.
- `capturedAt`.
- `result`.
- `faceScore`.
- `livenessScore`.
- `challengeTypes`.
- `latencyMs`.
- `embedding`.
- optional `failureReason`.

Result enum:

- `SUCCESS`
- `FACE_FAILED`
- `LIVENESS_FAILED`
- `ERROR`

Behavior:

- Resolve tenant and user from `clientId`.
- Store resolved tenantId, userId, and clientId on every event.
- Validate embedding dimension.
- Enforce idempotency by `(clientId, eventId)`.
- Response separates accepted, duplicate, and rejected event ids.
- If client is inactive, accept only events captured before `deactivatedAt`.

Acceptance:

- Bulk sync accepts valid events.
- More than 100 events is rejected.
- Retry with same event ids does not duplicate.
- Invalid result enum is rejected.
- Wrong embedding dimension is rejected.
- Historical events before deactivation can sync.
- Events after deactivation are rejected.

## Agent 8: Purge Ack API

Goal: Track that mobile deleted local synced events.

API:

- `POST /api/clients/{clientId}/sync/purge-ack`

Request:

- `eventIds`

Behavior:

- Resolve tenant and user from `clientId`.
- Mark known client events as `PURGED`.
- Treat already purged events as success.
- Return unknown ids separately.
- Events belonging to another client must not be marked.

Acceptance:

- Known events become purged.
- Repeated purge ack succeeds.
- Unknown ids are reported.
- Other-client ids are not updated.
- Admin event view shows purge status.

## Agent 9: Admin/Demo Read APIs

Goal: Provide simple dashboard-friendly reads.

APIs:

- `GET /api/admin/tenants`
- `GET /api/admin/tenants/{tenantId}/users`
- `GET /api/admin/tenants/{tenantId}/clients`
- `GET /api/admin/tenants/{tenantId}/events`

Behavior:

- Tenant-scoped reads.
- Include enough data for demo dashboard.
- No auth in Stage 1.

Acceptance:

- Users list only returns users for selected tenant.
- Clients list only returns clients for selected tenant.
- Events list only returns events for selected tenant.
- Events include scores, challenge types, capturedAt, receivedAt, result, and purgeStatus.

## Agent 10: Test Suite And API Docs

Goal: Add confidence and handoff clarity.

Test categories:

- Tenant tests.
- User tests.
- Client resolver tests.
- Offline profile tests.
- Bulk sync tests.
- Purge ack tests.
- Admin read tests.

Minimum test cases:

- Valid tenant create succeeds.
- Invalid tenant config fails.
- User duplicate employee id fails within same tenant.
- Same employee id succeeds across tenants.
- User embedding dimension mismatch fails.
- Client creation returns unique `clientId`.
- Stage 1 login returns tenant/user ids.
- Client cannot be reassigned.
- Offline profile resolves only from `clientId`.
- Offline profile blocks inactive tenant/user/client.
- Bulk sync is idempotent.
- Bulk sync rejects more than 100 events.
- Purge ack is idempotent.
- Admin APIs are tenant-scoped.

Docs:

- Add setup instructions.
- Add environment variables.
- Add run command.
- Add sample curl flow.
- Add OpenAPI/Swagger if time permits.

Demo flow:

1. Create tenant.
2. Create user.
3. App login returns tenant/user ids.
4. Register device to create client.
5. Fetch offline profile.
6. Sync auth events.
7. Send purge ack.
8. View admin events.

## Recommended Agent Order

1. Agent 1: project scaffold and app foundation.
2. Agent 2: domain models and Mongo repositories.
3. Agent 3: tenant APIs.
4. Agent 4: user APIs and enrollment.
5. Agent 5: client APIs and client resolver.
6. Agent 6: offline profile API.
7. Agent 7: bulk event sync API.
8. Agent 8: purge ack API.
9. Agent 9: admin/demo read APIs.
10. Agent 10: test suite and API docs.

## Shared Constraints For Every Agent

- Use Go, not Java.
- Use Gin and MongoDB.
- Do not add auth in Stage 1.
- Stage 1 app may send tenantId and userId only for device registration after login.
- Do not make the app send tenantId or userId after device registration.
- Do not use DBRef-style relations.
- Do not hard-delete domain records.
- Do not reassign a client to another user.
- Keep face recognition and liveness out of backend.
- Keep signature pluggable but null in Stage 1.
- Keep code modular enough for Stage 2 JWT and signing.

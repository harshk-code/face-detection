# Test Plan: Stage 1 Offline Face Auth Backend

## Testing Principles

- Test external behavior and contracts, not implementation details.
- Prefer service-level tests for domain rules and handler-level tests for API contracts.
- The client resolver is the most important deep module and must be tested directly.
- Store behavior should be tested around uniqueness, persistence, soft delete, and idempotency.
- Stage 1 has no auth tests because auth is out of scope.

## Tenant Tests

### TC-TENANT-001: Create tenant with valid config

Input: valid tenant name, `MODEL_CONFIG`, and `LIVENESS_CONFIG`.

Expected: tenant is created with active status and saved config.

### TC-TENANT-002: Missing model config

Input: tenant create request without `MODEL_CONFIG`.

Expected: request fails validation.

### TC-TENANT-003: Invalid model thresholds

Input: face or liveness threshold outside accepted numeric range.

Expected: request fails validation.

### TC-TENANT-004: Invalid embedding dimension

Input: `embeddingDimension` less than or equal to zero.

Expected: request fails validation.

### TC-TENANT-005: Update tenant config

Input: valid config update for existing tenant.

Expected: tenant config changes and future offline profiles use the updated config.

### TC-TENANT-006: Soft-delete tenant

Input: delete request for active tenant.

Expected: tenant status changes to inactive/deleted; record is not physically removed.

### TC-TENANT-007: Inactive tenant blocks profile

Input: offline profile request for a client under inactive tenant.

Expected: API returns conflict.

## User Tests

### TC-USER-001: Create user with valid embeddings

Input: tenant id, basic profile, and multiple embeddings matching tenant embedding dimension.

Expected: user is created under tenant.

### TC-USER-002: Duplicate employee id inside same tenant

Input: create two users with same `employeeId` under same tenant.

Expected: second request fails.

### TC-USER-003: Same employee id across tenants

Input: create users with same `employeeId` under different tenants.

Expected: both users are created.

### TC-USER-004: Embedding dimension mismatch

Input: user embedding vector length different from tenant model config dimension.

Expected: request fails validation.

### TC-USER-005: Update user embeddings

Input: update user with new valid embeddings.

Expected: user is updated and future offline profile returns new embeddings.

### TC-USER-006: Soft-delete user

Input: delete request for active user.

Expected: user status changes to inactive/deleted; record is not physically removed.

### TC-USER-007: Inactive user blocks profile

Input: offline profile request for client mapped to inactive user.

Expected: API returns conflict.

## Client Tests

### TC-CLIENT-001: Login returns tenant and user ids

Input: Stage 1 login request for an enrolled user.

Expected: response includes `tenantId` and `userId`.

### TC-CLIENT-002: Create client from login ids

Input: `tenantId`, `userId`, and device metadata after login.

Expected: client is created and response includes globally unique backend-generated `clientId`.

### TC-CLIENT-003: Missing tenant

Input: create client for unknown tenant id.

Expected: request fails.

### TC-CLIENT-004: Missing user

Input: create client for unknown user id.

Expected: request fails.

### TC-CLIENT-005: User from another tenant

Input: tenant id and a user id that belongs to another tenant.

Expected: request fails.

### TC-CLIENT-006: Client id uniqueness

Input: create multiple clients.

Expected: every generated `clientId` is unique.

### TC-CLIENT-007: Client ownership cannot be reassigned

Input: update client request attempting to change `tenantId` or `userId`.

Expected: ownership fields are rejected or ignored according to the API contract.

### TC-CLIENT-008: Update client metadata

Input: update request changing device name, platform, app version, or IMEI.

Expected: metadata updates successfully.

### TC-CLIENT-009: Deactivate client

Input: delete/deactivate request for active client.

Expected: client status changes and `deactivatedAt` is set.

### TC-CLIENT-010: Deactivated client blocks profile

Input: offline profile request using deactivated client id.

Expected: API returns conflict.

## Client Resolver Tests

### TC-RESOLVER-001: Resolve valid client

Input: active `clientId`.

Expected: resolver returns client, tenant, and user.

### TC-RESOLVER-002: Unknown client id

Input: unknown `clientId`.

Expected: resolver returns not found.

### TC-RESOLVER-003: Inactive tenant

Input: client id whose tenant is inactive.

Expected: resolver reports inactive tenant state.

### TC-RESOLVER-004: Inactive user

Input: client id whose user is inactive.

Expected: resolver reports inactive user state.

### TC-RESOLVER-005: Inactive client

Input: inactive client id.

Expected: resolver reports inactive client state.

## Offline Profile Tests

### TC-PROFILE-001: Generate profile from client id

Input: `GET /api/clients/{clientId}/offline-profile`.

Expected: response includes client id, tenant id, user id, employee id, user name, model config, liveness config, embeddings, validUntil, and signature.

### TC-PROFILE-002: No tenant or user supplied by app

Input: post-registration profile request with only `clientId`.

Expected: backend resolves tenant and user internally.

### TC-PROFILE-003: Unknown client

Input: profile request for unknown `clientId`.

Expected: not found.

### TC-PROFILE-004: Inactive tenant/user/client

Input: profile request where any resolved record is inactive.

Expected: conflict.

### TC-PROFILE-005: Signature is null in Stage 1

Input: valid profile request.

Expected: `signature` field is present and null.

### TC-PROFILE-006: Updated config reflected

Input: update tenant config, then fetch profile.

Expected: profile uses updated config.

### TC-PROFILE-007: Updated embeddings reflected

Input: update user embeddings, then fetch profile.

Expected: profile uses updated embeddings.

## Bulk Event Sync Tests

### TC-SYNC-001: Sync valid event batch

Input: up to 100 valid events for a valid `clientId`.

Expected: events are stored with tenantId, userId, and clientId resolved from the registered client.

### TC-SYNC-002: Reject more than 100 events

Input: batch with 101 events.

Expected: request fails.

### TC-SYNC-003: Idempotent retry

Input: send the same event ids twice for same client.

Expected: first request accepts events; second reports duplicates without creating new records.

### TC-SYNC-004: Invalid result enum

Input: event result outside `SUCCESS`, `FACE_FAILED`, `LIVENESS_FAILED`, `ERROR`.

Expected: event is rejected.

### TC-SYNC-005: Embedding dimension mismatch

Input: synced event embedding length differs from tenant model config.

Expected: event is rejected.

### TC-SYNC-006: Store event payload fields

Input: valid event with scores, challenge types, latency, embedding, and capturedAt.

Expected: persisted event contains all required fields and backend `receivedAt`.

### TC-SYNC-007: Historical inactive-client event

Input: event captured before client `deactivatedAt`.

Expected: event is accepted.

### TC-SYNC-008: Post-deactivation event

Input: event captured after client `deactivatedAt`.

Expected: event is rejected.

### TC-SYNC-009: Mixed batch response

Input: batch containing accepted, duplicate, and invalid events.

Expected: response separates accepted, duplicate, and rejected event ids.

## Purge Ack Tests

### TC-PURGE-001: Mark known events purged

Input: purge ack with known event ids for client.

Expected: matching events are marked `PURGED`.

### TC-PURGE-002: Idempotent repeated purge

Input: same purge ack request twice.

Expected: second request succeeds without error.

### TC-PURGE-003: Unknown ids reported

Input: purge ack containing unknown event ids.

Expected: unknown ids are returned separately.

### TC-PURGE-004: Other-client event not updated

Input: purge ack from one client containing event id owned by another client.

Expected: other client's event is not marked purged.

### TC-PURGE-005: Purge status visible

Input: admin event list after purge ack.

Expected: event shows updated purge status.

## Admin/Demo Tests

### TC-ADMIN-001: List tenant users

Input: admin users list for tenant.

Expected: only users from that tenant are returned.

### TC-ADMIN-002: List tenant clients

Input: admin clients list for tenant.

Expected: only clients from that tenant are returned.

### TC-ADMIN-003: List tenant events

Input: admin events list for tenant.

Expected: only events from that tenant are returned.

### TC-ADMIN-004: Event details are demo-friendly

Input: admin events list after sync.

Expected: events include result, scores, challenge types, capturedAt, receivedAt, latency, and purgeStatus.

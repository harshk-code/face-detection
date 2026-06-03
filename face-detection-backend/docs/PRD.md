# PRD: Stage 1 Offline Face Auth Backend

## Problem Statement

The hackathon prototype needs a backend that can support a mobile offline facial authentication flow. The mobile app will perform face recognition and liveness detection fully offline, but it needs backend APIs to onboard tenants, users, and registered client devices, distribute offline profile data, receive offline verification events after network returns, track local purge acknowledgements, and expose simple admin/demo views.

Stage 1 must focus only on making the backend work with the app through simple APIs. There is no authentication or authorization in Stage 1. Stage 2 will add JWT security to every API.

## Solution

Build a Go 1.24 backend using Gin and MongoDB.

The mobile onboarding order is:

1. Create a tenant.
2. Create a user under that tenant.
3. User downloads the app and logs in.
4. Stage 1 login returns `tenantId` and `userId`.
5. In Stage 2, login will return a JWT and backend will decode `tenantId` and `userId` from JWT claims.
6. After login, the app shows a register-device button.
7. Register-device calls the create client API with `tenantId`, `userId`, and device metadata.
8. Backend generates a globally unique opaque `clientId`.
9. The mobile app stores `clientId`.
10. All post-registration runtime mobile calls send only `clientId`.
11. Backend resolves tenant and user internally from `clientId`.

The backend will expose tenant, user, and client CRUD, offline profile generation, bulk event sync, purge acknowledgement, and tenant-scoped admin/demo read APIs.

## User Stories

1. As an admin, I want to create a tenant, so that each organization has isolated model and liveness configuration.
2. As an admin, I want to update tenant model config, so that face thresholds and model metadata can change without app code changes.
3. As an admin, I want to define liveness config for a tenant, so that the mobile app knows which offline challenges to use.
4. As an admin, I want to create a user under a tenant, so that an employee can be enrolled for offline verification.
5. As an admin, I want to store multiple face embeddings for a user, so that the app has enough enrolled vectors for local matching.
6. As an admin, I want to update a user's basic profile and embeddings, so that corrections can be made after enrollment.
7. As an admin, I want users to be soft-deleted or deactivated, so that historical auth events remain traceable.
8. As a mobile app, I want login to return `tenantId` and `userId` in Stage 1, so that I can register the device for the logged-in user.
9. As an admin, I want the backend to generate the `clientId`, so that client identity is globally unique and controlled server-side.
10. As a mobile app, I want to call register-device after login with `tenantId`, `userId`, and device metadata, so that the backend can create the client mapping.
11. As a mobile app, I want to send only `clientId` after device registration, so that normal runtime APIs do not require tenant or user identifiers.
12. As a mobile app, I want to download an offline profile by `clientId`, so that I can verify the mapped user without network.
13. As a mobile app, I want the offline profile to include user info, embeddings, model config, and liveness config, so that verification can run fully offline.
14. As a backend developer, I want signature support to be pluggable, so that Stage 1 can return unsigned profiles and Stage 2 can add signing without changing the API shape.
15. As a mobile app, I want to upload offline auth events in bulk, so that stored local events can sync after network returns.
16. As a mobile app, I want bulk sync to be idempotent by event id, so that retrying a failed upload does not duplicate events.
17. As an admin, I want synced events to show face score, liveness score, result, challenge types, latency, captured time, and received time, so that the demo dashboard can inspect verification history.
18. As a mobile app, I want purge acknowledgement support, so that the backend can track which synced local events were deleted from the device.
19. As an admin, I want tenant-scoped event views, so that demo data does not mix across tenants.
20. As a future security implementer, I want device registration to read tenant/user from JWT claims in Stage 2, so that request body ids can be removed or verified.

## Implementation Decisions

- Use Go 1.24 with Gin for HTTP routing and MongoDB for persistence.
- Do not use Java or Spring Boot.
- Do not add authentication in Stage 1.
- Do not perform face recognition or liveness detection in the backend.
- Use Mongo document references by id only; do not use DBRef-style relationships.
- `clientId` is globally unique, opaque, backend-generated, and is the only identifier the app sends after device registration.
- Tenant is created first and user is created under tenant.
- Stage 1 login returns `tenantId` and `userId` to the app.
- Device registration creates a client from `{tenantId, userId}` plus device metadata.
- Stage 2 replaces Stage 1 login ids with JWT claims.
- Runtime APIs resolve tenant and user entirely from `clientId`.
- Management APIs are nested under tenants.
- Runtime APIs are client-scoped.
- Tenant config is a typed config map. Stage 1 supports `MODEL_CONFIG` and `LIVENESS_CONFIG`.
- User documents store basic user info and embedded face embeddings for Stage 1.
- Auth events store synced attempt data, including captured embedding vectors.
- Bulk event sync accepts up to 100 events per request.
- Duplicate event uploads are handled by mobile-generated `eventId`.
- Deletes are soft deletes/status changes.
- Offline profile signature is kept as a nullable/pluggable field for Stage 1.

## Testing Decisions

- Test external behavior, not internal implementation details.
- Test the client resolver module heavily because it is the core deep module: given a `clientId`, it resolves tenant, user, client status, and profile eligibility.
- Test tenant config validation, especially model version, thresholds, liveness challenges, and embedding dimension.
- Test user enrollment validation with multiple embedding vectors.
- Test login response shape, client creation uniqueness, and immutable tenant/user mapping.
- Test offline profile generation from only `clientId`.
- Test bulk sync idempotency, duplicate handling, validation failures, and batch-size limits.
- Test purge acknowledgement idempotency and unknown event reporting.
- Since the repo is currently empty, there is no existing test prior art to follow.

## Out of Scope

- JWT authentication and authorization.
- Role-based permissions.
- Real offline profile signing.
- Encryption of biometric data at rest.
- Production-grade retention policy for captured event embeddings.
- Mobile face recognition and liveness implementation.
- React Native app implementation.
- AWS deployment.
- Separate face template collection.
- Multi-user-per-client support.
- Client reassignment from one user to another.

## Further Notes

Stage 1 is intentionally optimized for a working backend-to-mobile demo. The design keeps enough structure for Stage 2 security: login and device registration can move to JWT claims, runtime identity is centralized through `clientId`, signing is abstracted, and tenant/user/client boundaries are explicit.

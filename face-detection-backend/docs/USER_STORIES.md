# User Stories: Stage 1 Offline Face Auth Backend

## Tenant Management

1. As an admin, I want to create a tenant, so that each organization has isolated backend data and configuration.
2. As an admin, I want to list tenants, so that I can see all organizations configured in the demo backend.
3. As an admin, I want to view tenant details, so that I can inspect model and liveness configuration.
4. As an admin, I want to update tenant model config, so that model version, thresholds, checksum, and embedding dimension can change without mobile code changes.
5. As an admin, I want to update tenant liveness config, so that the app knows which challenges are allowed.
6. As an admin, I want to deactivate a tenant, so that new offline profiles cannot be generated for that tenant.
7. As a backend developer, I want tenant config to be typed by config key, so that more config categories can be added later without changing the tenant collection shape.

## User Enrollment

8. As an admin, I want to create a user under a tenant, so that an employee can be enrolled for offline verification.
9. As an admin, I want `employeeId` to be unique only inside a tenant, so that different tenants can use the same employee id format.
10. As an admin, I want to store basic user information, so that offline profiles and demo screens can show the employee identity.
11. As an admin, I want to store multiple face embedding vectors for a user, so that offline matching has stronger reference data.
12. As an admin, I want embedding vectors validated against tenant model config, so that bad enrollment data does not reach the mobile app.
13. As an admin, I want to update user embeddings, so that re-enrollment can refresh future offline profiles.
14. As an admin, I want to deactivate a user, so that new offline profiles cannot be generated for that user.
15. As an admin, I want old auth events to remain linked after user deactivation, so that audit/demo history remains readable.

## Client Onboarding

16. As a mobile app, I want login to return `tenantId` and `userId` in Stage 1, so that I can register the device for the logged-in user.
17. As a mobile user, I want a register-device button after login, so that I can explicitly bind this app installation to my account.
18. As a mobile app, I want to call create client with `tenantId`, `userId`, and device metadata, so that the backend can create the device mapping.
19. As a mobile app, I want the backend to return `clientId`, so that I can store it for all later offline-profile and sync calls.
20. As an admin, I want the backend to generate `clientId`, so that client identity is globally unique and controlled by the server.
21. As an admin, I want client metadata to include device type, device name, platform, app version, and optional IMEI, so that registered phones can be identified in the demo view.
22. As an admin, I want client ownership to be immutable, so that old events from the client remain attributable to the original user.
23. As an admin, I want to deactivate a client, so that new profile downloads are blocked.
24. As an admin, I want to create a new client when a phone moves to another user, so that the event history stays unambiguous.

## Offline Profile

25. As a mobile app, I want to send only `clientId` after device registration, so that runtime APIs do not require tenant id or user id.
26. As a mobile app, I want to fetch an offline profile by `clientId`, so that I can verify the mapped user without active internet.
27. As a mobile app, I want the offline profile to include employee id and user name, so that the local app can display the mapped person.
28. As a mobile app, I want the offline profile to include multiple embeddings, so that local face matching can compare against enrolled vectors.
29. As a mobile app, I want the offline profile to include model config, so that thresholds and model metadata are tenant-controlled.
30. As a mobile app, I want the offline profile to include liveness config, so that the app knows the allowed offline challenge types.
31. As a mobile app, I want the offline profile response shape to include `signature`, so that Stage 2 can add tamper protection without a response contract change.
32. As a backend developer, I want `signature` to be nullable in Stage 1, so that the working demo is not blocked by signing.
33. As an admin, I want inactive tenant/user/client state to block offline profile generation, so that disabled records cannot receive refreshed local verification data.

## Event Sync

31. As a mobile app, I want to save auth events locally while offline, so that verification history is not lost.
32. As a mobile app, I want to upload auth events in bulk after network returns, so that sync is efficient.
33. As a mobile app, I want bulk sync to accept up to 100 events per request, so that payloads stay manageable.
34. As a mobile app, I want each event to include a stable `eventId`, so that retries are safe.
35. As a mobile app, I want duplicate uploads to be idempotent, so that retrying a failed sync does not create duplicate events.
36. As an admin, I want events to store face score and liveness score, so that demo results are explainable.
37. As an admin, I want events to store challenge types, so that I can see which liveness checks were performed.
38. As an admin, I want events to store latency, so that the demo can show performance characteristics.
39. As an admin, I want events to store captured time and received time, so that offline-to-online delay is visible.
40. As an admin, I want events to store the captured embedding vector in Stage 1, so that the backend has the full synced event payload requested for the prototype.
41. As a backend developer, I want synced event tenant/user fields resolved from `clientId`, so that the mobile app cannot spoof tenant or user identity after device registration.
42. As an admin, I want historical events from a deactivated client to sync if captured before deactivation, so that offline data is not lost.
43. As an admin, I want events captured after client deactivation to be rejected, so that deactivation has operational meaning.

## Purge Acknowledgement

44. As a mobile app, I want to purge local events after successful sync, so that device storage does not grow indefinitely.
45. As a mobile app, I want to acknowledge purged event ids, so that the backend knows local cleanup happened.
46. As a mobile app, I want purge acknowledgement to be idempotent, so that retrying purge ack is safe.
47. As an admin, I want unknown purge ids reported separately, so that sync issues can be debugged without failing the whole request.
48. As an admin, I want purge status visible in event views, so that the demo can show the full sync-and-purge lifecycle.

## Admin/Demo Views

49. As an admin, I want to list users for a tenant, so that the demo dashboard can show enrolled people.
50. As an admin, I want to list clients for a tenant, so that the demo dashboard can show registered phones.
51. As an admin, I want to list events for a tenant, so that the demo dashboard can show offline verification history.
52. As an admin, I want event views to include result, scores, challenges, captured time, received time, and purge status, so that the demo is easy to explain.

## Stage 2 Readiness

53. As a security implementer, I want handler logic separated from business services, so that JWT middleware can be added later.
54. As a security implementer, I want Stage 2 device registration to derive tenant/user from JWT claims, so that request body ids are not trusted.
55. As a security implementer, I want runtime identity centralized through `clientId`, so that future JWT claims can be validated against one resolver path.
56. As a security implementer, I want a signer interface already present, so that real offline profile signing can be added without changing mobile response shape.
57. As a backend developer, I want soft deletes rather than hard deletes, so that historical event references remain valid.

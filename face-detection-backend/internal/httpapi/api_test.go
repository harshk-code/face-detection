package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"face-detection-backend/internal/domain"
	"face-detection-backend/internal/httpapi"
	"face-detection-backend/internal/service"
	"face-detection-backend/internal/store"
	"github.com/stretchr/testify/require"
)

type testApp struct {
	t      *testing.T
	store  *store.MemoryStore
	router http.Handler
}

func newTestApp(t *testing.T) *testApp {
	t.Helper()
	mem := store.NewMemoryStore()
	return &testApp{t: t, store: mem, router: httpapi.NewRouter(mem)}
}

func (a *testApp) request(method, path string, body any) *httptest.ResponseRecorder {
	return a.requestWithTenant(method, path, "", body)
}

func (a *testApp) requestWithTenant(method, path, tenantID string, body any) *httptest.ResponseRecorder {
	a.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		require.NoError(a.t, json.NewEncoder(&buf).Encode(body))
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if tenantID != "" {
		req.Header.Set("x-tenant-id", tenantID)
	}
	rec := httptest.NewRecorder()
	a.router.ServeHTTP(rec, req)
	return rec
}

func decode[T any](t *testing.T, rec *httptest.ResponseRecorder) T {
	t.Helper()
	var value T
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &value), rec.Body.String())
	return value
}

func validConfig(dimension int) map[string]any {
	return map[string]any{
		"MODEL_CONFIG": map[string]any{
			"modelVersion":       "facenet-v1",
			"faceThreshold":      0.82,
			"livenessThreshold":  0.77,
			"embeddingDimension": dimension,
			"modelChecksum":      "sha256:demo",
			"active":             true,
		},
		"LIVENESS_CONFIG": map[string]any{
			"challengeTypes": []string{"BLINK", "SMILE"},
			"active":         true,
		},
	}
}

func validTenantReq(name string, dimension int) map[string]any {
	return map[string]any{
		"name":    name,
		"configs": validConfig(dimension),
	}
}

func validUserReqWithDimension(employeeID string, embeddings [][]float64, dimension int) map[string]any {
	items := []map[string]any{}
	for i, vector := range embeddings {
		items = append(items, map[string]any{"id": "emb-" + string(rune('a'+i)), "vector": vector})
	}
	return map[string]any{
		"employeeId": employeeID,
		"username":   employeeID + "-" + time.Now().Format("150405.000000000"),
		"password":   "pass-" + employeeID,
		"name":       "Asha Rao",
		"role":       "Security",
		"configs":    validConfig(dimension),
		"embeddings": items,
	}
}

func validUserReq(employeeID string, embeddings [][]float64) map[string]any {
	return validUserReqWithDimension(employeeID, embeddings, 3)
}

func createTenant(t *testing.T, app *testApp, name string, dimension int) domain.Tenant {
	rec := app.request(http.MethodPost, "/api/tenants", validTenantReq(name, dimension))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	return decode[domain.Tenant](t, rec)
}

func createUser(t *testing.T, app *testApp, tenantID, employeeID string) domain.User {
	rec := app.requestWithTenant(http.MethodPost, "/api/users", tenantID, validUserReq(employeeID, [][]float64{{0.1, 0.2, 0.3}, {0.3, 0.2, 0.1}}))
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	return decode[domain.User](t, rec)
}

func createClient(t *testing.T, app *testApp, tenantID, userID string) domain.Client {
	rec := app.requestWithTenant(http.MethodPost, "/api/clients", tenantID, map[string]any{
		"userId":     userID,
		"deviceType": "PHONE",
		"deviceName": "Pixel 9",
		"platform":   "ANDROID",
		"appVersion": "1.0.0",
		"imei":       "123456789012345",
	})
	require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	return decode[domain.Client](t, rec)
}

func seedActiveFlow(t *testing.T, app *testApp) (domain.Tenant, domain.User, domain.Client) {
	tenant := createTenant(t, app, "Acme", 3)
	user := createUser(t, app, tenant.ID, "E-100")
	client := createClient(t, app, tenant.ID, user.ID)
	return tenant, user, client
}

func TestHealth(t *testing.T) {
	app := newTestApp(t)
	root := app.request(http.MethodGet, "/", nil)
	require.Equal(t, http.StatusOK, root.Code)

	rec := app.request(http.MethodGet, "/health", nil)
	require.Equal(t, http.StatusOK, rec.Code)

	docs := app.request(http.MethodGet, "/docs", nil)
	require.Equal(t, http.StatusOK, docs.Code)
	require.Contains(t, docs.Body.String(), "SwaggerUIBundle")
}

func TestTenantAPIs(t *testing.T) {
	t.Run("TC-TENANT-001 create tenant with valid config", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		require.Equal(t, domain.StatusActive, tenant.Status)
		require.Equal(t, 3, tenant.Configs.ModelConfig.EmbeddingDimension)

		detail := app.request(http.MethodGet, "/api/tenants/"+tenant.ID, nil)
		require.Equal(t, http.StatusOK, detail.Code, detail.Body.String())
		require.Equal(t, tenant.ID, decode[domain.Tenant](t, detail).ID)

		oldHeaderDetail := app.requestWithTenant(http.MethodGet, "/api/tenant", tenant.ID, nil)
		require.Equal(t, http.StatusNotFound, oldHeaderDetail.Code)
	})

	t.Run("TC-TENANT-002 missing model config", func(t *testing.T) {
		app := newTestApp(t)
		rec := app.request(http.MethodPost, "/api/tenants", map[string]any{"name": "Bad", "configs": map[string]any{}})
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("TC-TENANT-003 invalid model thresholds", func(t *testing.T) {
		app := newTestApp(t)
		req := validTenantReq("Bad", 3)
		req["configs"].(map[string]any)["MODEL_CONFIG"].(map[string]any)["faceThreshold"] = 1.7
		rec := app.request(http.MethodPost, "/api/tenants", req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("TC-TENANT-004 invalid embedding dimension", func(t *testing.T) {
		app := newTestApp(t)
		rec := app.request(http.MethodPost, "/api/tenants", validTenantReq("Bad", 0))
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("TC-TENANT-005 update tenant config does not alter user profile config snapshot", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		req := validTenantReq("Acme Updated", 3)
		req["configs"].(map[string]any)["MODEL_CONFIG"].(map[string]any)["faceThreshold"] = 0.91
		rec := app.requestWithTenant(http.MethodPut, "/api/tenant", tenant.ID, req)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		profileRec := app.requestWithTenant(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", tenant.ID, nil)
		require.Equal(t, http.StatusOK, profileRec.Code, profileRec.Body.String())
		profile := decode[service.OfflineProfile](t, profileRec)
		require.Equal(t, 0.82, profile.ModelConfig.FaceThreshold)
	})

	t.Run("TC-TENANT-006 and TC-TENANT-007 soft-delete blocks profile", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodDelete, "/api/tenant", tenant.ID, nil)
		require.Equal(t, http.StatusOK, rec.Code)
		deleted := decode[domain.Tenant](t, rec)
		require.Equal(t, domain.StatusInactive, deleted.Status)
		profileRec := app.requestWithTenant(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", tenant.ID, nil)
		require.Equal(t, http.StatusConflict, profileRec.Code)
	})
}

func TestUserAPIs(t *testing.T) {
	t.Run("TC-USER-001 create user with valid embeddings", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		user := createUser(t, app, tenant.ID, "E-100")
		require.Equal(t, tenant.ID, user.TenantID)
		require.Equal(t, 3, user.Configs.ModelConfig.EmbeddingDimension)
		require.Len(t, user.Embeddings, 2)
	})

	t.Run("TC-USER-002 missing user config", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		req := validUserReq("E-100", [][]float64{{0.1, 0.2, 0.3}})
		delete(req, "configs")
		rec := app.requestWithTenant(http.MethodPost, "/api/users", tenant.ID, req)
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("TC-USER-003 duplicate employee id inside same tenant", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		_ = createUser(t, app, tenant.ID, "E-100")
		rec := app.requestWithTenant(http.MethodPost, "/api/users", tenant.ID, validUserReq("E-100", [][]float64{{0.1, 0.2, 0.3}}))
		require.Equal(t, http.StatusConflict, rec.Code)
	})

	t.Run("TC-USER-004 same employee id across tenants", func(t *testing.T) {
		app := newTestApp(t)
		t1 := createTenant(t, app, "Acme", 3)
		t2 := createTenant(t, app, "Beta", 3)
		_ = createUser(t, app, t1.ID, "E-100")
		rec := app.requestWithTenant(http.MethodPost, "/api/users", t2.ID, validUserReq("E-100", [][]float64{{0.1, 0.2, 0.3}}))
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
	})

	t.Run("TC-USER-005 embedding dimension mismatch", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		rec := app.requestWithTenant(http.MethodPost, "/api/users", tenant.ID, validUserReq("E-100", [][]float64{{0.1, 0.2}}))
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("TC-USER-006 update embeddings reflected in profile", func(t *testing.T) {
		app := newTestApp(t)
		tenant, user, client := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodPut, "/api/users/"+user.ID, tenant.ID, validUserReq("E-100", [][]float64{{0.7, 0.8, 0.9}}))
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		profileRec := app.requestWithTenant(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", tenant.ID, nil)
		profile := decode[service.OfflineProfile](t, profileRec)
		require.Len(t, profile.Embeddings, 1)
		require.Equal(t, []float64{0.7, 0.8, 0.9}, profile.Embeddings[0].Vector)
	})

	t.Run("TC-USER-007 user config decouples profile from tenant config dimension", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 2)
		userReq := validUserReqWithDimension("E-100", [][]float64{{0.1, 0.2, 0.3}}, 3)
		rec := app.requestWithTenant(http.MethodPost, "/api/users", tenant.ID, userReq)
		require.Equal(t, http.StatusCreated, rec.Code, rec.Body.String())
		user := decode[domain.User](t, rec)
		client := createClient(t, app, tenant.ID, user.ID)
		profileRec := app.requestWithTenant(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", tenant.ID, nil)
		require.Equal(t, http.StatusOK, profileRec.Code, profileRec.Body.String())
		profile := decode[service.OfflineProfile](t, profileRec)
		require.Equal(t, 3, profile.ModelConfig.EmbeddingDimension)
	})

	t.Run("TC-USER-008 and TC-USER-009 soft-delete blocks profile", func(t *testing.T) {
		app := newTestApp(t)
		tenant, user, client := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodDelete, "/api/users/"+user.ID, tenant.ID, nil)
		require.Equal(t, http.StatusOK, rec.Code)
		profileRec := app.requestWithTenant(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", tenant.ID, nil)
		require.Equal(t, http.StatusConflict, profileRec.Code)
	})
}

func TestClientLoginAndProfileAPIs(t *testing.T) {
	t.Run("TC-CLIENT-001 login returns tenant and user ids", func(t *testing.T) {
		app := newTestApp(t)
		tenant, user, _ := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodPost, "/api/login", tenant.ID, map[string]any{"username": user.Username, "password": "pass-" + user.EmployeeID})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decode[service.LoginResponse](t, rec)
		require.Equal(t, tenant.ID, body.TenantID)
		require.Equal(t, user.ID, body.UserID)
		require.Equal(t, user.Username, body.User.Username)
		require.NotContains(t, rec.Body.String(), "password")

		missingHeader := app.request(http.MethodPost, "/api/login", map[string]any{"username": user.Username, "password": "pass-" + user.EmployeeID})
		require.Equal(t, http.StatusBadRequest, missingHeader.Code)

		otherTenant := createTenant(t, app, "Other", 3)
		wrongTenant := app.requestWithTenant(http.MethodPost, "/api/login", otherTenant.ID, map[string]any{"username": user.Username, "password": "pass-" + user.EmployeeID})
		require.Equal(t, http.StatusNotFound, wrongTenant.Code)
	})

	t.Run("TC-CLIENT-002 and TC-CLIENT-006 create clients with unique ids", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		user := createUser(t, app, tenant.ID, "E-100")
		c1 := createClient(t, app, tenant.ID, user.ID)
		c2 := createClient(t, app, tenant.ID, user.ID)
		require.NotEmpty(t, c1.ClientID)
		require.NotEqual(t, c1.ClientID, c2.ClientID)
	})

	t.Run("TC-CLIENT-003 missing tenant", func(t *testing.T) {
		app := newTestApp(t)
		rec := app.requestWithTenant(http.MethodPost, "/api/clients", "missing", map[string]any{"userId": "missing", "deviceType": "PHONE", "deviceName": "Pixel", "platform": "ANDROID", "appVersion": "1"})
		require.Equal(t, http.StatusNotFound, rec.Code)
	})

	t.Run("TC-CLIENT-004 missing user and TC-CLIENT-005 other tenant user", func(t *testing.T) {
		app := newTestApp(t)
		t1 := createTenant(t, app, "Acme", 3)
		t2 := createTenant(t, app, "Beta", 3)
		u2 := createUser(t, app, t2.ID, "B-1")
		missing := app.requestWithTenant(http.MethodPost, "/api/clients", t1.ID, map[string]any{"userId": "missing", "deviceType": "PHONE", "deviceName": "Pixel", "platform": "ANDROID", "appVersion": "1"})
		require.Equal(t, http.StatusNotFound, missing.Code)
		otherTenant := app.requestWithTenant(http.MethodPost, "/api/clients", t1.ID, map[string]any{"userId": u2.ID, "deviceType": "PHONE", "deviceName": "Pixel", "platform": "ANDROID", "appVersion": "1"})
		require.Equal(t, http.StatusNotFound, otherTenant.Code)
	})

	t.Run("TC-CLIENT-007 immutable ownership and TC-CLIENT-008 metadata update", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		bad := app.requestWithTenant(http.MethodPut, "/api/clients/"+client.ClientID, tenant.ID, map[string]any{"tenantId": "new"})
		require.Equal(t, http.StatusBadRequest, bad.Code)
		good := app.requestWithTenant(http.MethodPut, "/api/clients/"+client.ClientID, tenant.ID, map[string]any{"deviceName": "Pixel 10", "platform": "ANDROID", "appVersion": "1.1.0", "imei": "999"})
		require.Equal(t, http.StatusOK, good.Code, good.Body.String())
		updated := decode[domain.Client](t, good)
		require.Equal(t, "Pixel 10", updated.DeviceName)
		require.Equal(t, client.UserID, updated.UserID)
	})

	t.Run("TC-CLIENT-009 and TC-CLIENT-010 deactivate client blocks profile", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodDelete, "/api/clients/"+client.ClientID, tenant.ID, nil)
		require.Equal(t, http.StatusOK, rec.Code)
		deactivated := decode[domain.Client](t, rec)
		require.Equal(t, domain.StatusInactive, deactivated.Status)
		require.NotNil(t, deactivated.DeactivatedAt)
		profileRec := app.requestWithTenant(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", tenant.ID, nil)
		require.Equal(t, http.StatusConflict, profileRec.Code)
	})

	t.Run("TC-PROFILE-001 through TC-PROFILE-005 profile contract", func(t *testing.T) {
		app := newTestApp(t)
		tenant, user, client := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", tenant.ID, nil)
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		profile := decode[service.OfflineProfile](t, rec)
		require.Equal(t, client.ClientID, profile.ClientID)
		require.Equal(t, tenant.ID, profile.TenantID)
		require.Equal(t, user.ID, profile.UserID)
		require.Equal(t, user.EmployeeID, profile.EmployeeID)
		require.Equal(t, user.Name, profile.UserName)
		require.Len(t, profile.Embeddings, 2)
		require.Nil(t, profile.Signature)
		unknown := app.requestWithTenant(http.MethodGet, "/api/clients/unknown/offline-profile", tenant.ID, nil)
		require.Equal(t, http.StatusNotFound, unknown.Code)
		missingHeader := app.request(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", nil)
		require.Equal(t, http.StatusBadRequest, missingHeader.Code)
	})
}

func TestResolverService(t *testing.T) {
	ctx := context.Background()

	t.Run("TC-RESOLVER-001 resolve valid client", func(t *testing.T) {
		app := newTestApp(t)
		tenant, user, client := seedActiveFlow(t, app)
		svc := service.New(app.store)
		resolved, err := svc.ResolveProfileEligibleClient(ctx, client.ClientID)
		require.NoError(t, err)
		require.Equal(t, tenant.ID, resolved.Tenant.ID)
		require.Equal(t, user.ID, resolved.User.ID)
	})

	t.Run("TC-RESOLVER-002 unknown client id", func(t *testing.T) {
		app := newTestApp(t)
		svc := service.New(app.store)
		_, err := svc.ResolveProfileEligibleClient(ctx, "missing")
		require.Error(t, err)
	})

	t.Run("TC-RESOLVER-003 inactive tenant", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		_, _ = app.store.SoftDeleteTenant(ctx, tenant.ID)
		svc := service.New(app.store)
		_, err := svc.ResolveProfileEligibleClient(ctx, client.ClientID)
		require.Error(t, err)
	})

	t.Run("TC-RESOLVER-004 inactive user", func(t *testing.T) {
		app := newTestApp(t)
		tenant, user, client := seedActiveFlow(t, app)
		_, _ = app.store.SoftDeleteUser(ctx, tenant.ID, user.ID)
		svc := service.New(app.store)
		_, err := svc.ResolveProfileEligibleClient(ctx, client.ClientID)
		require.Error(t, err)
	})

	t.Run("TC-RESOLVER-005 inactive client", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		_, _ = app.store.SoftDeleteClient(ctx, tenant.ID, client.ClientID)
		svc := service.New(app.store)
		_, err := svc.ResolveProfileEligibleClient(ctx, client.ClientID)
		require.Error(t, err)
	})
}

func TestSyncPurgeAndAdminAPIs(t *testing.T) {
	eventTime := time.Now().UTC().Add(-time.Hour)
	event := func(id string) map[string]any {
		return map[string]any{
			"eventId":        id,
			"result":         domain.ResultSuccess,
			"faceScore":      0.93,
			"livenessScore":  0.88,
			"challengeTypes": []string{"BLINK"},
			"latencyMs":      120,
			"embedding":      []float64{0.1, 0.2, 0.3},
			"capturedAt":     eventTime.Format(time.RFC3339Nano),
		}
	}

	t.Run("TC-SYNC-001 store valid event payload and TC-ADMIN-003/004 list details", func(t *testing.T) {
		app := newTestApp(t)
		tenant, user, client := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/events", tenant.ID, map[string]any{"events": []map[string]any{event("evt-1")}})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decode[service.SyncEventsResponse](t, rec)
		require.Equal(t, []string{"evt-1"}, body.AcceptedEventIDs)
		eventsRec := app.requestWithTenant(http.MethodGet, "/api/admin/events", tenant.ID, nil)
		require.Equal(t, http.StatusOK, eventsRec.Code)
		var listed struct {
			Events []domain.AuthEvent `json:"events"`
		}
		require.NoError(t, json.Unmarshal(eventsRec.Body.Bytes(), &listed))
		require.Len(t, listed.Events, 1)
		require.Equal(t, tenant.ID, listed.Events[0].TenantID)
		require.Equal(t, user.ID, listed.Events[0].UserID)
		require.Equal(t, domain.PurgePending, listed.Events[0].PurgeStatus)
		require.False(t, listed.Events[0].ReceivedAt.IsZero())
		require.Equal(t, 120, listed.Events[0].LatencyMs)
	})

	t.Run("TC-SYNC-002 reject more than 100 events", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		events := []map[string]any{}
		for i := 0; i < 101; i++ {
			events = append(events, event("evt-many"))
		}
		rec := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/events", tenant.ID, map[string]any{"events": events})
		require.Equal(t, http.StatusBadRequest, rec.Code)
	})

	t.Run("TC-SYNC-003 idempotent retry and TC-SYNC-009 mixed batch", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		first := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/events", tenant.ID, map[string]any{"events": []map[string]any{event("evt-1")}})
		require.Equal(t, http.StatusOK, first.Code)
		bad := event("evt-bad")
		bad["result"] = "NOPE"
		second := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/events", tenant.ID, map[string]any{"events": []map[string]any{event("evt-1"), event("evt-2"), bad}})
		require.Equal(t, http.StatusOK, second.Code, second.Body.String())
		body := decode[service.SyncEventsResponse](t, second)
		require.Equal(t, []string{"evt-2"}, body.AcceptedEventIDs)
		require.Equal(t, []string{"evt-1"}, body.DuplicateEventIDs)
		require.Len(t, body.RejectedEvents, 1)
	})

	t.Run("TC-SYNC-004 invalid result and TC-SYNC-005 embedding mismatch rejected", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		invalidResult := event("evt-invalid-result")
		invalidResult["result"] = "BAD"
		badEmbedding := event("evt-bad-embedding")
		badEmbedding["embedding"] = []float64{1}
		rec := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/events", tenant.ID, map[string]any{"events": []map[string]any{invalidResult, badEmbedding}})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decode[service.SyncEventsResponse](t, rec)
		require.Empty(t, body.AcceptedEventIDs)
		require.Len(t, body.RejectedEvents, 2)
	})

	t.Run("TC-SYNC-007 historical inactive-client event and TC-SYNC-008 post-deactivation event", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		rec := app.requestWithTenant(http.MethodDelete, "/api/clients/"+client.ClientID, tenant.ID, nil)
		require.Equal(t, http.StatusOK, rec.Code)
		deactivated := decode[domain.Client](t, rec)
		before := event("evt-before")
		before["capturedAt"] = deactivated.DeactivatedAt.Add(-time.Minute).Format(time.RFC3339Nano)
		after := event("evt-after")
		after["capturedAt"] = deactivated.DeactivatedAt.Add(time.Minute).Format(time.RFC3339Nano)
		syncRec := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/events", tenant.ID, map[string]any{"events": []map[string]any{before, after}})
		require.Equal(t, http.StatusOK, syncRec.Code, syncRec.Body.String())
		body := decode[service.SyncEventsResponse](t, syncRec)
		require.Equal(t, []string{"evt-before"}, body.AcceptedEventIDs)
		require.Len(t, body.RejectedEvents, 1)
		require.Equal(t, "evt-after", body.RejectedEvents[0].EventID)
	})

	t.Run("TC-PURGE-001 through TC-PURGE-005 purge ack behavior", func(t *testing.T) {
		app := newTestApp(t)
		tenant, _, client := seedActiveFlow(t, app)
		_, _, otherClient := seedActiveFlow(t, app)
		_ = app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/events", tenant.ID, map[string]any{"events": []map[string]any{event("evt-1")}})
		_ = app.requestWithTenant(http.MethodPost, "/api/clients/"+otherClient.ClientID+"/sync/events", otherClient.TenantID, map[string]any{"events": []map[string]any{event("other-evt")}})
		rec := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/purge-ack", tenant.ID, map[string]any{"eventIds": []string{"evt-1", "missing", "other-evt"}})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decode[service.PurgeAckResponse](t, rec)
		require.Equal(t, []string{"evt-1"}, body.PurgedEventIDs)
		require.ElementsMatch(t, []string{"missing", "other-evt"}, body.UnknownEventIDs)
		again := app.requestWithTenant(http.MethodPost, "/api/clients/"+client.ClientID+"/sync/purge-ack", tenant.ID, map[string]any{"eventIds": []string{"evt-1"}})
		require.Equal(t, http.StatusOK, again.Code)
		eventsRec := app.requestWithTenant(http.MethodGet, "/api/admin/events", tenant.ID, nil)
		var listed struct {
			Events []domain.AuthEvent `json:"events"`
		}
		require.NoError(t, json.Unmarshal(eventsRec.Body.Bytes(), &listed))
		require.Len(t, listed.Events, 1)
		require.Equal(t, domain.PurgePurged, listed.Events[0].PurgeStatus)
	})

	t.Run("TC-ADMIN-001 and TC-ADMIN-002 tenant scoped user/client lists", func(t *testing.T) {
		app := newTestApp(t)
		t1, _, _ := seedActiveFlow(t, app)
		_, _, _ = seedActiveFlow(t, app)
		usersRec := app.requestWithTenant(http.MethodGet, "/api/admin/users", t1.ID, nil)
		clientsRec := app.requestWithTenant(http.MethodGet, "/api/admin/clients", t1.ID, nil)
		var users struct {
			Users []domain.User `json:"users"`
		}
		var clients struct {
			Clients []domain.Client `json:"clients"`
		}
		require.NoError(t, json.Unmarshal(usersRec.Body.Bytes(), &users))
		require.NoError(t, json.Unmarshal(clientsRec.Body.Bytes(), &clients))
		require.Len(t, users.Users, 1)
		require.Len(t, clients.Clients, 1)
		require.Equal(t, t1.ID, users.Users[0].TenantID)
		require.Equal(t, t1.ID, clients.Clients[0].TenantID)
	})
}

func TestOfflineOnboardingSyncAPIs(t *testing.T) {
	eventTime := time.Now().UTC().Add(-time.Hour)
	device := map[string]any{
		"deviceType": "PHONE",
		"deviceName": "Pixel 9",
		"platform":   "ANDROID",
		"appVersion": "1.0.0",
		"imei":       "123456789012345",
	}
	event := func(localEnrollmentID, eventID string) map[string]any {
		return map[string]any{
			"localEnrollmentId": localEnrollmentID,
			"eventId":           eventID,
			"result":            domain.ResultSuccess,
			"faceScore":         0.93,
			"livenessScore":     0.88,
			"challengeTypes":    []string{"BLINK"},
			"latencyMs":         120,
			"embedding":         []float64{0.1, 0.2, 0.3},
			"capturedAt":        eventTime.Format(time.RFC3339Nano),
		}
	}
	enrollment := func(localEnrollmentID, employeeID string, embeddings [][]float64) map[string]any {
		req := validUserReq(employeeID, embeddings)
		req["localEnrollmentId"] = localEnrollmentID
		return req
	}

	t.Run("creates synced user client and linked auth event", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		rec := app.requestWithTenant(http.MethodPost, "/api/offline/onboarding-sync", tenant.ID, map[string]any{
			"device":      device,
			"enrollments": []map[string]any{enrollment("local-1", "J-100", [][]float64{{0.1, 0.2, 0.3}})},
			"events":      []map[string]any{event("local-1", "evt-1"), event("local-1", "evt-1")},
		})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decode[service.OfflineOnboardingSyncResponse](t, rec)
		require.Len(t, body.Enrollments, 1)
		require.NotEmpty(t, body.Enrollments[0].UserID)
		require.NotEmpty(t, body.Enrollments[0].ClientID)
		require.Equal(t, []string{"evt-1"}, body.AcceptedEventIDs)
		require.Equal(t, []string{"evt-1"}, body.DuplicateEventIDs)
		require.Empty(t, body.RejectedEvents)
		require.Empty(t, body.RejectedEnrollments)

		usersRec := app.requestWithTenant(http.MethodGet, "/api/admin/users", tenant.ID, nil)
		clientsRec := app.requestWithTenant(http.MethodGet, "/api/admin/clients", tenant.ID, nil)
		eventsRec := app.requestWithTenant(http.MethodGet, "/api/admin/events", tenant.ID, nil)
		var users struct {
			Users []domain.User `json:"users"`
		}
		var clients struct {
			Clients []domain.Client `json:"clients"`
		}
		var events struct {
			Events []domain.AuthEvent `json:"events"`
		}
		require.NoError(t, json.Unmarshal(usersRec.Body.Bytes(), &users))
		require.NoError(t, json.Unmarshal(clientsRec.Body.Bytes(), &clients))
		require.NoError(t, json.Unmarshal(eventsRec.Body.Bytes(), &events))
		require.Len(t, users.Users, 1)
		require.Len(t, clients.Clients, 1)
		require.Len(t, events.Events, 1)
		require.Equal(t, users.Users[0].ID, events.Events[0].UserID)
		require.Equal(t, clients.Clients[0].ClientID, events.Events[0].ClientID)
	})

	t.Run("rejects events for failed or unknown local enrollments", func(t *testing.T) {
		app := newTestApp(t)
		tenant := createTenant(t, app, "Acme", 3)
		rec := app.requestWithTenant(http.MethodPost, "/api/offline/onboarding-sync", tenant.ID, map[string]any{
			"device":      device,
			"enrollments": []map[string]any{enrollment("bad-local", "J-200", [][]float64{{0.1}})},
			"events":      []map[string]any{event("bad-local", "evt-bad"), event("missing-local", "evt-missing")},
		})
		require.Equal(t, http.StatusOK, rec.Code, rec.Body.String())
		body := decode[service.OfflineOnboardingSyncResponse](t, rec)
		require.Empty(t, body.Enrollments)
		require.Empty(t, body.AcceptedEventIDs)
		require.Len(t, body.RejectedEnrollments, 1)
		require.Len(t, body.RejectedEvents, 2)
		require.Equal(t, "bad-local", body.RejectedEnrollments[0].LocalEnrollmentID)
	})
}

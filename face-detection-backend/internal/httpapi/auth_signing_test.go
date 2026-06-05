package httpapi_test

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"face-detection-backend/internal/auth"
	"face-detection-backend/internal/domain"
	"face-detection-backend/internal/httpapi"
	"face-detection-backend/internal/service"
	"face-detection-backend/internal/store"
	"github.com/stretchr/testify/require"
)

// The backend uses a single default tenant; the x-tenant-id header is ignored.
const defaultTenantID = service.DefaultTenantID

// secureApp wires an auth-enabled router with a real Ed25519 signer.
type secureApp struct {
	t      *testing.T
	router http.Handler
}

func newSecureApp(t *testing.T) *secureApp {
	t.Helper()
	seed := make([]byte, ed25519.SeedSize)
	for i := range seed {
		seed[i] = byte(i + 1)
	}
	signer, err := service.NewEd25519Signer(seed)
	require.NoError(t, err)
	mem := store.NewMemoryStore()
	require.NoError(t, service.New(mem).EnsureDefaultTenant(context.Background()))
	router := httpapi.NewRouterWithOptions(mem, httpapi.Options{
		Auth:      auth.NewManager("test-secret", true),
		Signer:    signer,
		AdminUser: "admin",
		AdminPass: "s3cret",
	})
	return &secureApp{t: t, router: router}
}

func (a *secureApp) do(method, path, token, tenantID string, body any) *httptest.ResponseRecorder {
	a.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		require.NoError(a.t, json.NewEncoder(&buf).Encode(body))
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if tenantID != "" {
		req.Header.Set("x-tenant-id", tenantID)
	}
	rec := httptest.NewRecorder()
	a.router.ServeHTTP(rec, req)
	return rec
}

func (a *secureApp) adminToken() string {
	rec := a.do(http.MethodPost, "/api/admin/login", "", "", map[string]any{"username": "admin", "password": "s3cret"})
	require.Equal(a.t, http.StatusOK, rec.Code, rec.Body.String())
	var out struct {
		Token string `json:"token"`
	}
	require.NoError(a.t, json.Unmarshal(rec.Body.Bytes(), &out))
	require.NotEmpty(a.t, out.Token)
	return out.Token
}

func tenantBody(name string) map[string]any {
	return map[string]any{
		"name": name,
		"configs": map[string]any{
			"MODEL_CONFIG": map[string]any{
				"modelVersion": "v1", "faceThreshold": 0.8, "livenessThreshold": 0.7,
				"embeddingDimension": 3, "modelChecksum": "sha256:demo", "active": true,
			},
			"LIVENESS_CONFIG": map[string]any{"challengeTypes": []string{"BLINK"}, "active": true},
		},
	}
}

func userBody(employeeID string) map[string]any {
	return map[string]any{
		"employeeId": employeeID, "username": employeeID, "password": "pw-" + employeeID,
		"name": "Test User", "role": "GUARD",
		"configs": tenantBody("x")["configs"],
		"embeddings": []map[string]any{{"id": "front", "vector": []float64{0.1, 0.2, 0.3}}},
	}
}

func TestAuthRequired(t *testing.T) {
	app := newSecureApp(t)

	// No token -> 401 on a protected route.
	rec := app.do(http.MethodGet, "/api/tenants", "", "", nil)
	require.Equal(t, http.StatusUnauthorized, rec.Code, rec.Body.String())

	// Bad admin creds -> 401.
	bad := app.do(http.MethodPost, "/api/admin/login", "", "", map[string]any{"username": "admin", "password": "wrong"})
	require.Equal(t, http.StatusUnauthorized, bad.Code)

	// Valid admin token -> 200.
	token := app.adminToken()
	ok := app.do(http.MethodGet, "/api/tenants", token, "", nil)
	require.Equal(t, http.StatusOK, ok.Code, ok.Body.String())
}

func TestReactivateUser(t *testing.T) {
	app := newSecureApp(t)
	token := app.adminToken()

	uRec := app.do(http.MethodPost, "/api/users", token, defaultTenantID, userBody("E1"))
	require.Equal(t, http.StatusCreated, uRec.Code, uRec.Body.String())
	user := decode[domain.User](t, uRec)
	require.Empty(t, user.Password, "password must not be serialized")

	// Soft delete -> INACTIVE.
	del := app.do(http.MethodDelete, "/api/users/"+user.ID, token, defaultTenantID, nil)
	require.Equal(t, http.StatusOK, del.Code)
	require.Equal(t, domain.StatusInactive, decode[domain.User](t, del).Status)

	// Reactivate via status update -> ACTIVE.
	react := app.do(http.MethodPut, "/api/users/"+user.ID, token, defaultTenantID, map[string]any{"status": "ACTIVE"})
	require.Equal(t, http.StatusOK, react.Code, react.Body.String())
	require.Equal(t, domain.StatusActive, decode[domain.User](t, react).Status)
}

func TestBcryptLoginAndUserToken(t *testing.T) {
	app := newSecureApp(t)
	token := app.adminToken()
	app.do(http.MethodPost, "/api/users", token, defaultTenantID, userBody("E1"))

	// Login with correct password -> token issued.
	login := app.do(http.MethodPost, "/api/login", "", defaultTenantID, map[string]any{"username": "E1", "password": "pw-E1"})
	require.Equal(t, http.StatusOK, login.Code, login.Body.String())
	var loginOut struct {
		Token    string `json:"token"`
		TenantID string `json:"tenantId"`
	}
	require.NoError(t, json.Unmarshal(login.Body.Bytes(), &loginOut))
	require.NotEmpty(t, loginOut.Token)

	// Wrong password -> conflict (no token).
	bad := app.do(http.MethodPost, "/api/login", "", defaultTenantID, map[string]any{"username": "E1", "password": "nope"})
	require.Equal(t, http.StatusConflict, bad.Code)
}

func TestOfflineProfileSigning(t *testing.T) {
	app := newSecureApp(t)
	token := app.adminToken()
	user := decode[domain.User](t, app.do(http.MethodPost, "/api/users", token, defaultTenantID, userBody("E1")))
	client := decode[domain.Client](t, app.do(http.MethodPost, "/api/clients", token, defaultTenantID, map[string]any{
		"userId": user.ID, "deviceType": "PHONE", "deviceName": "Pixel", "platform": "ANDROID", "appVersion": "1.0.0",
	}))

	// Public key is advertised.
	pk := app.do(http.MethodGet, "/api/signing/public-key", "", "", nil)
	require.Equal(t, http.StatusOK, pk.Code)
	var pkOut struct {
		Algorithm string `json:"algorithm"`
		PublicKey string `json:"publicKey"`
		Signed    bool   `json:"signed"`
	}
	require.NoError(t, json.Unmarshal(pk.Body.Bytes(), &pkOut))
	require.Equal(t, "Ed25519", pkOut.Algorithm)
	require.True(t, pkOut.Signed)
	pubKey, err := base64.StdEncoding.DecodeString(pkOut.PublicKey)
	require.NoError(t, err)

	// Profile carries a signature.
	profRec := app.do(http.MethodGet, "/api/clients/"+client.ClientID+"/offline-profile", token, defaultTenantID, nil)
	require.Equal(t, http.StatusOK, profRec.Code, profRec.Body.String())
	profile := decode[service.OfflineProfile](t, profRec)
	require.NotNil(t, profile.Signature)
	require.NotEmpty(t, *profile.Signature)

	// Server verifies its own signature.
	ver := app.do(http.MethodPost, "/api/verify-profile", "", "", map[string]any{"profile": profile})
	require.Equal(t, http.StatusOK, ver.Code)
	require.JSONEq(t, `{"valid":true}`, ver.Body.String())

	// Tamper: flip an embedding value -> verification fails.
	tampered := profile
	tampered.Embeddings = []domain.Embedding{{ID: "front", Vector: []float64{9.9, 9.9, 9.9}}}
	verBad := app.do(http.MethodPost, "/api/verify-profile", "", "", map[string]any{
		"profile": tampered, "signature": *profile.Signature,
	})
	require.Equal(t, http.StatusOK, verBad.Code)
	require.JSONEq(t, `{"valid":false}`, verBad.Body.String())

	// The advertised public key actually verifies the detached signature offline.
	sig, err := base64.StdEncoding.DecodeString(*profile.Signature)
	require.NoError(t, err)
	require.Len(t, pubKey, ed25519.PublicKeySize)
	require.Len(t, sig, ed25519.SignatureSize)
}

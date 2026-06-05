package httpapi

import (
	"crypto/subtle"
	"errors"
	"net/http"

	"face-detection-backend/internal/auth"
	"face-detection-backend/internal/service"
	"face-detection-backend/internal/store"
	"github.com/gin-gonic/gin"
)

type API struct {
	service   *service.Service
	auth      *auth.Manager
	adminUser string
	adminPass string
}

// Options configures a router. The zero value yields auth-disabled behaviour
// with a no-op signer, which keeps tests and local experimentation simple.
type Options struct {
	Auth      *auth.Manager
	Signer    service.ProfileSigner
	AdminUser string
	AdminPass string
}

func NewRouter(store store.Store) http.Handler {
	return NewRouterWithOptions(store, Options{})
}

func NewRouterWithOptions(store store.Store, opts Options) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	if opts.Auth == nil {
		opts.Auth = auth.NewManager("disabled", false)
	}
	api := &API{
		service:   service.NewWithSigner(store, opts.Signer),
		auth:      opts.Auth,
		adminUser: opts.AdminUser,
		adminPass: opts.AdminPass,
	}
	router := gin.New()
	router.Use(gin.Recovery())

	// Public routes.
	router.GET("/", api.index)
	router.GET("/health", api.health)
	router.GET("/openapi.yaml", api.openapiSpec)
	router.GET("/docs", api.swaggerUI)
	router.GET("/swagger", api.swaggerUI)

	v1 := router.Group("/api")
	v1.POST("/admin/login", api.adminLogin)
	v1.POST("/login", api.login)
	v1.GET("/signing/public-key", api.signingPublicKey)
	v1.POST("/verify-profile", api.verifyProfile)

	// Admin-only management surface.
	admin := router.Group("/api")
	admin.Use(api.auth.RequireAdmin())
	admin.POST("/tenants", api.createTenant)
	admin.GET("/tenants", api.listTenants)
	admin.GET("/tenants/:tenantId", api.getTenant)
	admin.PUT("/tenant", api.updateTenant)
	admin.DELETE("/tenant", api.deleteTenant)

	admin.POST("/users", api.createUser)
	admin.GET("/users", api.listUsers)
	admin.GET("/users/:userId", api.getUser)
	admin.PUT("/users/:userId", api.updateUser)
	admin.DELETE("/users/:userId", api.deleteUser)

	admin.POST("/clients", api.createClient)
	admin.GET("/clients", api.listClients)
	admin.GET("/clients/:clientId", api.getClient)
	admin.PUT("/clients/:clientId", api.updateClient)
	admin.DELETE("/clients/:clientId", api.deleteClient)

	admin.GET("/admin/tenants", api.listTenants)
	admin.GET("/admin/users", api.listUsers)
	admin.GET("/admin/clients", api.listClients)
	admin.GET("/admin/events", api.listEvents)

	// Device/offline surface: admin tokens (cross-tenant) or tenant-user tokens.
	device := router.Group("/api")
	device.Use(api.auth.RequireUserOrAdmin())
	device.GET("/clients/:clientId/offline-profile", api.offlineProfile)
	device.POST("/clients/:clientId/sync/events", api.syncEvents)
	device.POST("/clients/:clientId/sync/purge-ack", api.purgeAck)

	return router
}

func (api *API) health(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (api *API) index(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"service": "face-detection-backend",
		"status":  "ok",
		"endpoints": []string{
			"GET /health",
			"GET /docs",
			"GET /openapi.yaml",
			"POST /api/tenants",
			"GET /api/tenants/{tenantId}",
			"POST /api/users",
			"POST /api/login",
			"POST /api/clients",
			"GET /api/clients/{clientId}/offline-profile",
			"POST /api/clients/{clientId}/sync/events",
			"POST /api/clients/{clientId}/sync/purge-ack",
		},
	})
}

func (api *API) openapiSpec(c *gin.Context) {
	c.File("openapi.yaml")
}

func (api *API) swaggerUI(c *gin.Context) {
	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Face Detection Backend API</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.onload = function() {
        window.ui = SwaggerUIBundle({
          url: "/openapi.yaml",
          dom_id: "#swagger-ui",
          deepLinking: true,
          presets: [SwaggerUIBundle.presets.apis],
          layout: "BaseLayout"
        });
      };
    </script>
  </body>
</html>`)
}

func bindJSON[T any](c *gin.Context) (T, bool) {
	var req T
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": service.AppError{Code: "INVALID_JSON", Msg: err.Error(), Status: http.StatusBadRequest}})
		return req, false
	}
	return req, true
}

func respond(c *gin.Context, status int, value any, err error) {
	if err != nil {
		var appErr service.AppError
		if errors.As(err, &appErr) {
			c.JSON(appErr.Status, gin.H{"error": appErr})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": service.AppError{Code: "INTERNAL_ERROR", Msg: err.Error(), Status: http.StatusInternalServerError}})
		return
	}
	c.JSON(status, value)
}

func tenantIDFromHeader(c *gin.Context) (string, bool) {
	return service.DefaultTenantID, true
}

func (api *API) createTenant(c *gin.Context) {
	req, ok := bindJSON[service.CreateTenantRequest](c)
	if !ok {
		return
	}
	value, err := api.service.CreateTenant(c.Request.Context(), req)
	respond(c, http.StatusCreated, value, err)
}

func (api *API) listTenants(c *gin.Context) {
	value, err := api.service.ListTenants(c.Request.Context())
	respond(c, http.StatusOK, gin.H{"tenants": value}, err)
}

func (api *API) getTenant(c *gin.Context) {
	value, err := api.service.GetTenant(c.Request.Context(), c.Param("tenantId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) updateTenant(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.UpdateTenantRequest](c)
	if !ok {
		return
	}
	value, err := api.service.UpdateTenant(c.Request.Context(), tenantID, req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) deleteTenant(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.DeleteTenant(c.Request.Context(), tenantID)
	respond(c, http.StatusOK, value, err)
}

func (api *API) createUser(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.CreateUserRequest](c)
	if !ok {
		return
	}
	value, err := api.service.CreateUser(c.Request.Context(), tenantID, req)
	respond(c, http.StatusCreated, value, err)
}

func (api *API) listUsers(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.ListUsers(c.Request.Context(), tenantID)
	respond(c, http.StatusOK, gin.H{"users": value}, err)
}

func (api *API) getUser(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.GetUser(c.Request.Context(), tenantID, c.Param("userId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) updateUser(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.UpdateUserRequest](c)
	if !ok {
		return
	}
	value, err := api.service.UpdateUser(c.Request.Context(), tenantID, c.Param("userId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) deleteUser(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.DeleteUser(c.Request.Context(), tenantID, c.Param("userId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) login(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.LoginRequest](c)
	if !ok {
		return
	}
	value, err := api.service.Login(c.Request.Context(), tenantID, req)
	if err != nil {
		respond(c, http.StatusOK, value, err)
		return
	}
	token, expiresAt, err := api.auth.MintUser(value.TenantID, value.UserID, value.User.Role)
	if err != nil {
		respond(c, http.StatusInternalServerError, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"tenantId":  value.TenantID,
		"userId":    value.UserID,
		"user":      value.User,
		"token":     token,
		"expiresAt": expiresAt,
		"role":      value.User.Role,
	})
}

type adminLoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (api *API) adminLogin(c *gin.Context) {
	req, ok := bindJSON[adminLoginRequest](c)
	if !ok {
		return
	}
	userMatch := subtle.ConstantTimeCompare([]byte(req.Username), []byte(api.adminUser)) == 1
	passMatch := subtle.ConstantTimeCompare([]byte(req.Password), []byte(api.adminPass)) == 1
	if api.adminUser == "" || api.adminPass == "" || !userMatch || !passMatch {
		c.JSON(http.StatusUnauthorized, gin.H{"error": service.AppError{
			Code: "UNAUTHORIZED", Msg: "invalid admin credentials", Status: http.StatusUnauthorized,
		}})
		return
	}
	token, expiresAt, err := api.auth.MintAdmin(req.Username)
	if err != nil {
		respond(c, http.StatusInternalServerError, nil, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token":     token,
		"expiresAt": expiresAt,
		"role":      auth.RoleAdmin,
	})
}

func (api *API) signingPublicKey(c *gin.Context) {
	key, algorithm := api.service.SigningPublicKey()
	c.JSON(http.StatusOK, gin.H{
		"algorithm": algorithm,
		"publicKey": key,
		"signed":    key != "",
	})
}

type verifyProfileRequest struct {
	Profile   service.OfflineProfile `json:"profile"`
	Signature string                 `json:"signature"`
}

func (api *API) verifyProfile(c *gin.Context) {
	req, ok := bindJSON[verifyProfileRequest](c)
	if !ok {
		return
	}
	signature := req.Signature
	if signature == "" && req.Profile.Signature != nil {
		signature = *req.Profile.Signature
	}
	valid := signature != "" && api.service.VerifyProfile(req.Profile, signature)
	c.JSON(http.StatusOK, gin.H{"valid": valid})
}

func (api *API) createClient(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.CreateClientRequest](c)
	if !ok {
		return
	}
	req.TenantID = tenantID
	value, err := api.service.CreateClient(c.Request.Context(), req)
	respond(c, http.StatusCreated, value, err)
}

func (api *API) listClients(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.ListClients(c.Request.Context(), tenantID)
	respond(c, http.StatusOK, gin.H{"clients": value}, err)
}

func (api *API) getClient(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.GetClient(c.Request.Context(), tenantID, c.Param("clientId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) updateClient(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.UpdateClientRequest](c)
	if !ok {
		return
	}
	value, err := api.service.UpdateClient(c.Request.Context(), tenantID, c.Param("clientId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) deleteClient(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.DeleteClient(c.Request.Context(), tenantID, c.Param("clientId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) offlineProfile(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.OfflineProfile(c.Request.Context(), tenantID, c.Param("clientId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) syncEvents(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.SyncEventsRequest](c)
	if !ok {
		return
	}
	value, err := api.service.SyncEvents(c.Request.Context(), tenantID, c.Param("clientId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) purgeAck(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	req, ok := bindJSON[service.PurgeAckRequest](c)
	if !ok {
		return
	}
	value, err := api.service.PurgeAck(c.Request.Context(), tenantID, c.Param("clientId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) listEvents(c *gin.Context) {
	tenantID, ok := tenantIDFromHeader(c)
	if !ok {
		return
	}
	value, err := api.service.ListEvents(c.Request.Context(), tenantID)
	respond(c, http.StatusOK, gin.H{"events": value}, err)
}

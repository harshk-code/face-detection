package httpapi

import (
	"errors"
	"net/http"

	"face-detection-backend/internal/service"
	"face-detection-backend/internal/store"
	"github.com/gin-gonic/gin"
)

type API struct {
	service *service.Service
}

func NewRouter(store store.Store) http.Handler {
	gin.SetMode(gin.ReleaseMode)
	api := &API{service: service.New(store)}
	router := gin.New()
	router.Use(gin.Recovery())

	router.GET("/", api.index)
	router.GET("/health", api.health)

	v1 := router.Group("/api")
	v1.POST("/tenants", api.createTenant)
	v1.GET("/tenants", api.listTenants)
	v1.GET("/tenants/:tenantId", api.getTenant)
	v1.PUT("/tenants/:tenantId", api.updateTenant)
	v1.DELETE("/tenants/:tenantId", api.deleteTenant)

	v1.POST("/tenants/:tenantId/users", api.createUser)
	v1.GET("/tenants/:tenantId/users", api.listUsers)
	v1.GET("/tenants/:tenantId/users/:userId", api.getUser)
	v1.PUT("/tenants/:tenantId/users/:userId", api.updateUser)
	v1.DELETE("/tenants/:tenantId/users/:userId", api.deleteUser)

	v1.POST("/login", api.login)
	v1.POST("/clients", api.createClient)
	v1.GET("/tenants/:tenantId/clients", api.listClients)
	v1.GET("/tenants/:tenantId/clients/:clientId", api.getClient)
	v1.PUT("/tenants/:tenantId/clients/:clientId", api.updateClient)
	v1.DELETE("/tenants/:tenantId/clients/:clientId", api.deleteClient)

	v1.GET("/clients/:clientId/offline-profile", api.offlineProfile)
	v1.POST("/clients/:clientId/sync/events", api.syncEvents)
	v1.POST("/clients/:clientId/sync/purge-ack", api.purgeAck)

	v1.GET("/admin/tenants", api.listTenants)
	v1.GET("/admin/tenants/:tenantId/users", api.listUsers)
	v1.GET("/admin/tenants/:tenantId/clients", api.listClients)
	v1.GET("/admin/tenants/:tenantId/events", api.listEvents)

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
			"POST /api/tenants",
			"POST /api/tenants/{tenantId}/users",
			"POST /api/login",
			"POST /api/clients",
			"GET /api/clients/{clientId}/offline-profile",
			"POST /api/clients/{clientId}/sync/events",
			"POST /api/clients/{clientId}/sync/purge-ack",
		},
	})
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
	req, ok := bindJSON[service.UpdateTenantRequest](c)
	if !ok {
		return
	}
	value, err := api.service.UpdateTenant(c.Request.Context(), c.Param("tenantId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) deleteTenant(c *gin.Context) {
	value, err := api.service.DeleteTenant(c.Request.Context(), c.Param("tenantId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) createUser(c *gin.Context) {
	req, ok := bindJSON[service.CreateUserRequest](c)
	if !ok {
		return
	}
	value, err := api.service.CreateUser(c.Request.Context(), c.Param("tenantId"), req)
	respond(c, http.StatusCreated, value, err)
}

func (api *API) listUsers(c *gin.Context) {
	value, err := api.service.ListUsers(c.Request.Context(), c.Param("tenantId"))
	respond(c, http.StatusOK, gin.H{"users": value}, err)
}

func (api *API) getUser(c *gin.Context) {
	value, err := api.service.GetUser(c.Request.Context(), c.Param("tenantId"), c.Param("userId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) updateUser(c *gin.Context) {
	req, ok := bindJSON[service.CreateUserRequest](c)
	if !ok {
		return
	}
	value, err := api.service.UpdateUser(c.Request.Context(), c.Param("tenantId"), c.Param("userId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) deleteUser(c *gin.Context) {
	value, err := api.service.DeleteUser(c.Request.Context(), c.Param("tenantId"), c.Param("userId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) login(c *gin.Context) {
	req, ok := bindJSON[service.LoginRequest](c)
	if !ok {
		return
	}
	value, err := api.service.Login(c.Request.Context(), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) createClient(c *gin.Context) {
	req, ok := bindJSON[service.CreateClientRequest](c)
	if !ok {
		return
	}
	value, err := api.service.CreateClient(c.Request.Context(), req)
	respond(c, http.StatusCreated, value, err)
}

func (api *API) listClients(c *gin.Context) {
	value, err := api.service.ListClients(c.Request.Context(), c.Param("tenantId"))
	respond(c, http.StatusOK, gin.H{"clients": value}, err)
}

func (api *API) getClient(c *gin.Context) {
	value, err := api.service.GetClient(c.Request.Context(), c.Param("tenantId"), c.Param("clientId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) updateClient(c *gin.Context) {
	req, ok := bindJSON[service.UpdateClientRequest](c)
	if !ok {
		return
	}
	value, err := api.service.UpdateClient(c.Request.Context(), c.Param("tenantId"), c.Param("clientId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) deleteClient(c *gin.Context) {
	value, err := api.service.DeleteClient(c.Request.Context(), c.Param("tenantId"), c.Param("clientId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) offlineProfile(c *gin.Context) {
	value, err := api.service.OfflineProfile(c.Request.Context(), c.Param("clientId"))
	respond(c, http.StatusOK, value, err)
}

func (api *API) syncEvents(c *gin.Context) {
	req, ok := bindJSON[service.SyncEventsRequest](c)
	if !ok {
		return
	}
	value, err := api.service.SyncEvents(c.Request.Context(), c.Param("clientId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) purgeAck(c *gin.Context) {
	req, ok := bindJSON[service.PurgeAckRequest](c)
	if !ok {
		return
	}
	value, err := api.service.PurgeAck(c.Request.Context(), c.Param("clientId"), req)
	respond(c, http.StatusOK, value, err)
}

func (api *API) listEvents(c *gin.Context) {
	value, err := api.service.ListEvents(c.Request.Context(), c.Param("tenantId"))
	respond(c, http.StatusOK, gin.H{"events": value}, err)
}

package service

import (
	"context"
	"errors"
	"strings"
	"time"

	"face-detection-backend/internal/cache"
	"face-detection-backend/internal/domain"
	"face-detection-backend/internal/store"
	"github.com/google/uuid"
)

type Service struct {
	store         store.Store
	signer        ProfileSigner
	resolverCache *cache.TTL[string, ResolvedClientContext]
}

func New(store store.Store) *Service {
	return &Service{
		store:         store,
		signer:        NoopSigner{},
		resolverCache: cache.NewTTL[string, ResolvedClientContext](2 * time.Minute),
	}
}

type ProfileSigner interface {
	Sign(ctx context.Context, profile OfflineProfile) (*string, error)
}

type NoopSigner struct{}

func (NoopSigner) Sign(context.Context, OfflineProfile) (*string, error) { return nil, nil }

type CreateTenantRequest struct {
	Name    string              `json:"name"`
	Configs domain.TenantConfig `json:"configs"`
}

type UpdateTenantRequest struct {
	Name    string              `json:"name"`
	Configs domain.TenantConfig `json:"configs"`
	Status  string              `json:"status"`
}

func (s *Service) CreateTenant(ctx context.Context, req CreateTenantRequest) (domain.Tenant, error) {
	if strings.TrimSpace(req.Name) == "" {
		return domain.Tenant{}, BadRequest("name is required")
	}
	if err := ValidateTenantConfig(req.Configs); err != nil {
		return domain.Tenant{}, err
	}
	now := time.Now().UTC()
	tenant := domain.Tenant{
		ID:        uuid.NewString(),
		Name:      req.Name,
		Status:    domain.StatusActive,
		Configs:   req.Configs,
		CreatedAt: now,
		UpdatedAt: now,
	}
	return s.store.CreateTenant(ctx, tenant)
}

func (s *Service) ListTenants(ctx context.Context) ([]domain.Tenant, error) {
	return s.store.ListTenants(ctx)
}

func (s *Service) GetTenant(ctx context.Context, tenantID string) (domain.Tenant, error) {
	tenant, err := s.store.GetTenant(ctx, tenantID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Tenant{}, NotFound("tenant")
	}
	return tenant, err
}

func (s *Service) UpdateTenant(ctx context.Context, tenantID string, req UpdateTenantRequest) (domain.Tenant, error) {
	tenant, err := s.GetTenant(ctx, tenantID)
	if err != nil {
		return domain.Tenant{}, err
	}
	if strings.TrimSpace(req.Name) != "" {
		tenant.Name = req.Name
	}
	if req.Configs.ModelConfig.EmbeddingDimension != 0 || req.Configs.ModelConfig.ModelVersion != "" || len(req.Configs.LivenessConfig.ChallengeTypes) > 0 {
		if err := ValidateTenantConfig(req.Configs); err != nil {
			return domain.Tenant{}, err
		}
		tenant.Configs = req.Configs
	}
	if req.Status != "" {
		if req.Status != domain.StatusActive && req.Status != domain.StatusInactive {
			return domain.Tenant{}, BadRequest("status must be ACTIVE or INACTIVE")
		}
		tenant.Status = req.Status
	}
	tenant.UpdatedAt = time.Now().UTC()
	updated, err := s.store.UpdateTenant(ctx, tenant)
	s.invalidateResolverCache()
	return updated, err
}

func (s *Service) DeleteTenant(ctx context.Context, tenantID string) (domain.Tenant, error) {
	tenant, err := s.store.SoftDeleteTenant(ctx, tenantID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Tenant{}, NotFound("tenant")
	}
	s.invalidateResolverCache()
	return tenant, err
}

type CreateUserRequest struct {
	EmployeeID string             `json:"employeeId"`
	Username   string             `json:"username"`
	Password   string             `json:"password"`
	Name       string             `json:"name"`
	Role       string             `json:"role"`
	Embeddings []domain.Embedding `json:"embeddings"`
}

func (s *Service) CreateUser(ctx context.Context, tenantID string, req CreateUserRequest) (domain.User, error) {
	tenant, err := s.GetTenant(ctx, tenantID)
	if err != nil {
		return domain.User{}, err
	}
	if tenant.Status != domain.StatusActive {
		return domain.User{}, Conflict("tenant is inactive")
	}
	if strings.TrimSpace(req.EmployeeID) == "" || strings.TrimSpace(req.Name) == "" {
		return domain.User{}, BadRequest("employeeId and name are required")
	}
	if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
		return domain.User{}, BadRequest("username and password are required")
	}
	if err := ValidateEmbeddings(req.Embeddings, tenant.Configs.ModelConfig.EmbeddingDimension); err != nil {
		return domain.User{}, err
	}
	now := time.Now().UTC()
	user := domain.User{
		ID:         uuid.NewString(),
		TenantID:   tenantID,
		EmployeeID: req.EmployeeID,
		Username:   req.Username,
		Password:   req.Password,
		Name:       req.Name,
		Role:       req.Role,
		Status:     domain.StatusActive,
		Embeddings: normalizeEmbeddingIDs(req.Embeddings),
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	created, err := s.store.CreateUser(ctx, user)
	if errors.Is(err, store.ErrDuplicate) {
		return domain.User{}, Conflict("employeeId already exists for tenant or username already exists")
	}
	s.invalidateResolverCache()
	return created, err
}

func normalizeEmbeddingIDs(embeddings []domain.Embedding) []domain.Embedding {
	out := make([]domain.Embedding, len(embeddings))
	for i, embedding := range embeddings {
		out[i] = embedding
		if strings.TrimSpace(out[i].ID) == "" {
			out[i].ID = uuid.NewString()
		}
	}
	return out
}

func (s *Service) ListUsers(ctx context.Context, tenantID string) ([]domain.User, error) {
	if _, err := s.GetTenant(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.store.ListUsers(ctx, tenantID)
}

func (s *Service) GetUser(ctx context.Context, tenantID, userID string) (domain.User, error) {
	user, err := s.store.GetUser(ctx, tenantID, userID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.User{}, NotFound("user")
	}
	return user, err
}

func (s *Service) UpdateUser(ctx context.Context, tenantID, userID string, req CreateUserRequest) (domain.User, error) {
	tenant, err := s.GetTenant(ctx, tenantID)
	if err != nil {
		return domain.User{}, err
	}
	user, err := s.GetUser(ctx, tenantID, userID)
	if err != nil {
		return domain.User{}, err
	}
	if strings.TrimSpace(req.EmployeeID) != "" {
		user.EmployeeID = req.EmployeeID
	}
	if strings.TrimSpace(req.Username) != "" {
		user.Username = req.Username
	}
	if strings.TrimSpace(req.Password) != "" {
		user.Password = req.Password
	}
	if strings.TrimSpace(req.Name) != "" {
		user.Name = req.Name
	}
	if req.Role != "" {
		user.Role = req.Role
	}
	if req.Embeddings != nil {
		if err := ValidateEmbeddings(req.Embeddings, tenant.Configs.ModelConfig.EmbeddingDimension); err != nil {
			return domain.User{}, err
		}
		user.Embeddings = normalizeEmbeddingIDs(req.Embeddings)
	}
	user.UpdatedAt = time.Now().UTC()
	updated, err := s.store.UpdateUser(ctx, user)
	if errors.Is(err, store.ErrDuplicate) {
		return domain.User{}, Conflict("employeeId already exists for tenant or username already exists")
	}
	s.invalidateResolverCache()
	return updated, err
}

func (s *Service) DeleteUser(ctx context.Context, tenantID, userID string) (domain.User, error) {
	user, err := s.store.SoftDeleteUser(ctx, tenantID, userID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.User{}, NotFound("user")
	}
	s.invalidateResolverCache()
	return user, err
}

type LoginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type LoginResponse struct {
	TenantID string      `json:"tenantId"`
	UserID   string      `json:"userId"`
	User     domain.User `json:"user"`
}

func (s *Service) Login(ctx context.Context, req LoginRequest) (LoginResponse, error) {
	if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
		return LoginResponse{}, BadRequest("username and password are required")
	}
	user, err := s.store.FindUserByUsername(ctx, req.Username)
	if errors.Is(err, store.ErrNotFound) {
		return LoginResponse{}, NotFound("user")
	}
	if err != nil {
		return LoginResponse{}, err
	}
	if user.Password != req.Password {
		return LoginResponse{}, Conflict("invalid username or password")
	}
	tenant, err := s.GetTenant(ctx, user.TenantID)
	if err != nil {
		return LoginResponse{}, err
	}
	if tenant.Status != domain.StatusActive {
		return LoginResponse{}, Conflict("tenant is inactive")
	}
	if user.Status != domain.StatusActive {
		return LoginResponse{}, Conflict("user is inactive")
	}
	return LoginResponse{TenantID: user.TenantID, UserID: user.ID, User: user}, nil
}

type CreateClientRequest struct {
	TenantID   string `json:"tenantId"`
	UserID     string `json:"userId"`
	DeviceType string `json:"deviceType"`
	DeviceName string `json:"deviceName"`
	Platform   string `json:"platform"`
	AppVersion string `json:"appVersion"`
	IMEI       string `json:"imei"`
}

type UpdateClientRequest struct {
	TenantID   string `json:"tenantId"`
	UserID     string `json:"userId"`
	DeviceType string `json:"deviceType"`
	DeviceName string `json:"deviceName"`
	Platform   string `json:"platform"`
	AppVersion string `json:"appVersion"`
	IMEI       string `json:"imei"`
	Status     string `json:"status"`
}

func (s *Service) CreateClient(ctx context.Context, req CreateClientRequest) (domain.Client, error) {
	if req.TenantID == "" || req.UserID == "" {
		return domain.Client{}, BadRequest("tenantId and userId are required")
	}
	if req.DeviceType == "" || req.DeviceName == "" || req.Platform == "" || req.AppVersion == "" {
		return domain.Client{}, BadRequest("deviceType, deviceName, platform, and appVersion are required")
	}
	tenant, err := s.GetTenant(ctx, req.TenantID)
	if err != nil {
		return domain.Client{}, err
	}
	if tenant.Status != domain.StatusActive {
		return domain.Client{}, Conflict("tenant is inactive")
	}
	user, err := s.GetUser(ctx, req.TenantID, req.UserID)
	if err != nil {
		return domain.Client{}, err
	}
	if user.Status != domain.StatusActive {
		return domain.Client{}, Conflict("user is inactive")
	}
	now := time.Now().UTC()
	client := domain.Client{
		ID:          uuid.NewString(),
		ClientID:    "cli_" + uuid.NewString(),
		TenantID:    req.TenantID,
		UserID:      req.UserID,
		DeviceType:  req.DeviceType,
		DeviceName:  req.DeviceName,
		Platform:    req.Platform,
		AppVersion:  req.AppVersion,
		IMEI:        req.IMEI,
		Status:      domain.StatusActive,
		ActivatedAt: now,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	created, err := s.store.CreateClient(ctx, client)
	s.invalidateResolverCache()
	return created, err
}

func (s *Service) ListClients(ctx context.Context, tenantID string) ([]domain.Client, error) {
	if _, err := s.GetTenant(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.store.ListClients(ctx, tenantID)
}

func (s *Service) GetClient(ctx context.Context, tenantID, clientID string) (domain.Client, error) {
	client, err := s.store.GetClient(ctx, tenantID, clientID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Client{}, NotFound("client")
	}
	return client, err
}

func (s *Service) UpdateClient(ctx context.Context, tenantID, clientID string, req UpdateClientRequest) (domain.Client, error) {
	if req.TenantID != "" || req.UserID != "" {
		return domain.Client{}, BadRequest("tenantId and userId are immutable for clients")
	}
	client, err := s.GetClient(ctx, tenantID, clientID)
	if err != nil {
		return domain.Client{}, err
	}
	if req.DeviceType != "" {
		client.DeviceType = req.DeviceType
	}
	if req.DeviceName != "" {
		client.DeviceName = req.DeviceName
	}
	if req.Platform != "" {
		client.Platform = req.Platform
	}
	if req.AppVersion != "" {
		client.AppVersion = req.AppVersion
	}
	if req.IMEI != "" {
		client.IMEI = req.IMEI
	}
	if req.Status != "" {
		if req.Status != domain.StatusActive && req.Status != domain.StatusInactive {
			return domain.Client{}, BadRequest("status must be ACTIVE or INACTIVE")
		}
		client.Status = req.Status
		if req.Status == domain.StatusInactive && client.DeactivatedAt == nil {
			now := time.Now().UTC()
			client.DeactivatedAt = &now
		}
	}
	client.UpdatedAt = time.Now().UTC()
	updated, err := s.store.UpdateClient(ctx, client)
	s.invalidateResolverCache()
	return updated, err
}

func (s *Service) DeleteClient(ctx context.Context, tenantID, clientID string) (domain.Client, error) {
	client, err := s.store.SoftDeleteClient(ctx, tenantID, clientID)
	if errors.Is(err, store.ErrNotFound) {
		return domain.Client{}, NotFound("client")
	}
	s.invalidateResolverCache()
	return client, err
}

type ResolvedClientContext struct {
	Client domain.Client
	Tenant domain.Tenant
	User   domain.User
}

func (s *Service) ResolveClient(ctx context.Context, clientID string) (ResolvedClientContext, error) {
	if resolved, ok := s.resolverCache.Get(clientID); ok {
		return resolved, nil
	}
	client, err := s.store.GetClientByClientID(ctx, clientID)
	if errors.Is(err, store.ErrNotFound) {
		return ResolvedClientContext{}, NotFound("client")
	}
	if err != nil {
		return ResolvedClientContext{}, err
	}
	tenant, err := s.store.GetTenant(ctx, client.TenantID)
	if errors.Is(err, store.ErrNotFound) {
		return ResolvedClientContext{}, Conflict("client tenant is missing")
	}
	if err != nil {
		return ResolvedClientContext{}, err
	}
	user, err := s.store.GetUser(ctx, client.TenantID, client.UserID)
	if errors.Is(err, store.ErrNotFound) {
		return ResolvedClientContext{}, Conflict("client user is missing or tenant mismatch")
	}
	if err != nil {
		return ResolvedClientContext{}, err
	}
	resolved := ResolvedClientContext{Client: client, Tenant: tenant, User: user}
	s.resolverCache.Set(clientID, resolved)
	return resolved, nil
}

func (s *Service) invalidateResolverCache() {
	s.resolverCache.Clear()
}

func (s *Service) ResolveProfileEligibleClient(ctx context.Context, clientID string) (ResolvedClientContext, error) {
	resolved, err := s.ResolveClient(ctx, clientID)
	if err != nil {
		return ResolvedClientContext{}, err
	}
	if resolved.Tenant.Status != domain.StatusActive {
		return ResolvedClientContext{}, Conflict("tenant is inactive")
	}
	if resolved.User.Status != domain.StatusActive {
		return ResolvedClientContext{}, Conflict("user is inactive")
	}
	if resolved.Client.Status != domain.StatusActive {
		return ResolvedClientContext{}, Conflict("client is inactive")
	}
	return resolved, nil
}

type OfflineProfile struct {
	ClientID       string                `json:"clientId"`
	TenantID       string                `json:"tenantId"`
	UserID         string                `json:"userId"`
	EmployeeID     string                `json:"employeeId"`
	UserName       string                `json:"userName"`
	ModelConfig    domain.ModelConfig    `json:"modelConfig"`
	LivenessConfig domain.LivenessConfig `json:"livenessConfig"`
	Embeddings     []domain.Embedding    `json:"embeddings"`
	ValidUntil     time.Time             `json:"validUntil"`
	Signature      *string               `json:"signature"`
}

func (s *Service) OfflineProfile(ctx context.Context, clientID string) (OfflineProfile, error) {
	resolved, err := s.ResolveProfileEligibleClient(ctx, clientID)
	if err != nil {
		return OfflineProfile{}, err
	}
	profile := OfflineProfile{
		ClientID:       resolved.Client.ClientID,
		TenantID:       resolved.Tenant.ID,
		UserID:         resolved.User.ID,
		EmployeeID:     resolved.User.EmployeeID,
		UserName:       resolved.User.Name,
		ModelConfig:    resolved.Tenant.Configs.ModelConfig,
		LivenessConfig: resolved.Tenant.Configs.LivenessConfig,
		Embeddings:     resolved.User.Embeddings,
		ValidUntil:     time.Now().UTC().Add(24 * time.Hour),
	}
	signature, err := s.signer.Sign(ctx, profile)
	if err != nil {
		return OfflineProfile{}, err
	}
	profile.Signature = signature
	return profile, nil
}

type SyncEventsRequest struct {
	Events []SyncEventInput `json:"events"`
}

type SyncEventInput struct {
	EventID        string    `json:"eventId"`
	Result         string    `json:"result"`
	FailureReason  string    `json:"failureReason"`
	FaceScore      float64   `json:"faceScore"`
	LivenessScore  float64   `json:"livenessScore"`
	ChallengeTypes []string  `json:"challengeTypes"`
	LatencyMs      int       `json:"latencyMs"`
	Embedding      []float64 `json:"embedding"`
	CapturedAt     time.Time `json:"capturedAt"`
}

type RejectedEvent struct {
	EventID string `json:"eventId"`
	Reason  string `json:"reason"`
}

type SyncEventsResponse struct {
	AcceptedEventIDs  []string        `json:"acceptedEventIds"`
	DuplicateEventIDs []string        `json:"duplicateEventIds"`
	RejectedEvents    []RejectedEvent `json:"rejectedEvents"`
}

func (s *Service) SyncEvents(ctx context.Context, clientID string, req SyncEventsRequest) (SyncEventsResponse, error) {
	if len(req.Events) == 0 {
		return SyncEventsResponse{}, BadRequest("events is required")
	}
	if len(req.Events) > 100 {
		return SyncEventsResponse{}, BadRequest("events cannot exceed 100 per request")
	}
	resolved, err := s.ResolveClient(ctx, clientID)
	if err != nil {
		return SyncEventsResponse{}, err
	}
	response := SyncEventsResponse{AcceptedEventIDs: []string{}, DuplicateEventIDs: []string{}, RejectedEvents: []RejectedEvent{}}
	now := time.Now().UTC()
	for _, input := range req.Events {
		if reason := s.validateSyncEvent(resolved, input); reason != "" {
			response.RejectedEvents = append(response.RejectedEvents, RejectedEvent{EventID: input.EventID, Reason: reason})
			continue
		}
		event := domain.AuthEvent{
			ID:             uuid.NewString(),
			TenantID:       resolved.Tenant.ID,
			UserID:         resolved.User.ID,
			ClientID:       resolved.Client.ClientID,
			EventID:        input.EventID,
			Result:         input.Result,
			FailureReason:  input.FailureReason,
			FaceScore:      input.FaceScore,
			LivenessScore:  input.LivenessScore,
			ChallengeTypes: input.ChallengeTypes,
			LatencyMs:      input.LatencyMs,
			Embedding:      input.Embedding,
			CapturedAt:     input.CapturedAt,
			ReceivedAt:     now,
			PurgeStatus:    domain.PurgePending,
		}
		_, err := s.store.CreateAuthEvent(ctx, event)
		if errors.Is(err, store.ErrDuplicate) {
			response.DuplicateEventIDs = append(response.DuplicateEventIDs, input.EventID)
			continue
		}
		if err != nil {
			return SyncEventsResponse{}, err
		}
		response.AcceptedEventIDs = append(response.AcceptedEventIDs, input.EventID)
	}
	return response, nil
}

func (s *Service) validateSyncEvent(resolved ResolvedClientContext, event SyncEventInput) string {
	if strings.TrimSpace(event.EventID) == "" {
		return "eventId is required"
	}
	if !allowedResults[event.Result] {
		return "invalid result"
	}
	if event.CapturedAt.IsZero() {
		return "capturedAt is required"
	}
	if err := ValidateEventEmbedding(event.Embedding, resolved.Tenant.Configs.ModelConfig.EmbeddingDimension); err != nil {
		return err.Error()
	}
	if resolved.Client.Status == domain.StatusInactive && resolved.Client.DeactivatedAt != nil && !event.CapturedAt.Before(*resolved.Client.DeactivatedAt) {
		return "event captured after client deactivation"
	}
	return ""
}

type PurgeAckRequest struct {
	EventIDs []string `json:"eventIds"`
}

type PurgeAckResponse struct {
	PurgedEventIDs  []string `json:"purgedEventIds"`
	UnknownEventIDs []string `json:"unknownEventIds"`
}

func (s *Service) PurgeAck(ctx context.Context, clientID string, req PurgeAckRequest) (PurgeAckResponse, error) {
	if len(req.EventIDs) == 0 {
		return PurgeAckResponse{}, BadRequest("eventIds is required")
	}
	if _, err := s.ResolveClient(ctx, clientID); err != nil {
		return PurgeAckResponse{}, err
	}
	purged, unknown, err := s.store.MarkEventsPurged(ctx, clientID, req.EventIDs)
	if err != nil {
		return PurgeAckResponse{}, err
	}
	return PurgeAckResponse{PurgedEventIDs: purged, UnknownEventIDs: unknown}, nil
}

func (s *Service) ListEvents(ctx context.Context, tenantID string) ([]domain.AuthEvent, error) {
	if _, err := s.GetTenant(ctx, tenantID); err != nil {
		return nil, err
	}
	return s.store.ListEvents(ctx, tenantID)
}

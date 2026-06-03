package store

import (
	"context"
	"sync"
	"time"

	"face-detection-backend/internal/domain"
)

type MemoryStore struct {
	mu      sync.RWMutex
	tenants map[string]domain.Tenant
	users   map[string]domain.User
	clients map[string]domain.Client
	events  map[string]domain.AuthEvent
}

func NewMemoryStore() *MemoryStore {
	return &MemoryStore{
		tenants: map[string]domain.Tenant{},
		users:   map[string]domain.User{},
		clients: map[string]domain.Client{},
		events:  map[string]domain.AuthEvent{},
	}
}

func (s *MemoryStore) EnsureIndexes(context.Context) error { return nil }

func (s *MemoryStore) CreateTenant(_ context.Context, tenant domain.Tenant) (domain.Tenant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.tenants[tenant.ID] = tenant
	return tenant, nil
}

func (s *MemoryStore) ListTenants(context.Context) ([]domain.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]domain.Tenant, 0, len(s.tenants))
	for _, tenant := range s.tenants {
		out = append(out, tenant)
	}
	return out, nil
}

func (s *MemoryStore) GetTenant(_ context.Context, tenantID string) (domain.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tenant, ok := s.tenants[tenantID]
	if !ok {
		return domain.Tenant{}, ErrNotFound
	}
	return tenant, nil
}

func (s *MemoryStore) UpdateTenant(_ context.Context, tenant domain.Tenant) (domain.Tenant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.tenants[tenant.ID]; !ok {
		return domain.Tenant{}, ErrNotFound
	}
	s.tenants[tenant.ID] = tenant
	return tenant, nil
}

func (s *MemoryStore) SoftDeleteTenant(ctx context.Context, tenantID string) (domain.Tenant, error) {
	tenant, err := s.GetTenant(ctx, tenantID)
	if err != nil {
		return domain.Tenant{}, err
	}
	tenant.Status = domain.StatusInactive
	tenant.UpdatedAt = time.Now().UTC()
	return s.UpdateTenant(ctx, tenant)
}

func (s *MemoryStore) CreateUser(_ context.Context, user domain.User) (domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.users {
		if existing.TenantID == user.TenantID && existing.EmployeeID == user.EmployeeID {
			return domain.User{}, ErrDuplicate
		}
		if existing.Username != "" && existing.Username == user.Username {
			return domain.User{}, ErrDuplicate
		}
	}
	s.users[user.ID] = user
	return user, nil
}

func (s *MemoryStore) ListUsers(_ context.Context, tenantID string) ([]domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []domain.User{}
	for _, user := range s.users {
		if user.TenantID == tenantID {
			out = append(out, user)
		}
	}
	return out, nil
}

func (s *MemoryStore) GetUser(_ context.Context, tenantID, userID string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	user, ok := s.users[userID]
	if !ok || user.TenantID != tenantID {
		return domain.User{}, ErrNotFound
	}
	return user, nil
}

func (s *MemoryStore) GetUserByID(_ context.Context, userID string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	user, ok := s.users[userID]
	if !ok {
		return domain.User{}, ErrNotFound
	}
	return user, nil
}

func (s *MemoryStore) FindUserByEmployeeID(_ context.Context, tenantID, employeeID string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, user := range s.users {
		if user.TenantID == tenantID && user.EmployeeID == employeeID {
			return user, nil
		}
	}
	return domain.User{}, ErrNotFound
}

func (s *MemoryStore) FindUserByUsername(_ context.Context, username string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, user := range s.users {
		if user.Username == username {
			return user, nil
		}
	}
	return domain.User{}, ErrNotFound
}

func (s *MemoryStore) UpdateUser(_ context.Context, user domain.User) (domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.users[user.ID]; !ok {
		return domain.User{}, ErrNotFound
	}
	for _, existing := range s.users {
		if existing.ID != user.ID && existing.TenantID == user.TenantID && existing.EmployeeID == user.EmployeeID {
			return domain.User{}, ErrDuplicate
		}
		if existing.ID != user.ID && existing.Username != "" && existing.Username == user.Username {
			return domain.User{}, ErrDuplicate
		}
	}
	s.users[user.ID] = user
	return user, nil
}

func (s *MemoryStore) SoftDeleteUser(ctx context.Context, tenantID, userID string) (domain.User, error) {
	user, err := s.GetUser(ctx, tenantID, userID)
	if err != nil {
		return domain.User{}, err
	}
	user.Status = domain.StatusInactive
	user.UpdatedAt = time.Now().UTC()
	return s.UpdateUser(ctx, user)
}

func (s *MemoryStore) CreateClient(_ context.Context, client domain.Client) (domain.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, existing := range s.clients {
		if existing.ClientID == client.ClientID {
			return domain.Client{}, ErrDuplicate
		}
	}
	s.clients[client.ClientID] = client
	return client, nil
}

func (s *MemoryStore) ListClients(_ context.Context, tenantID string) ([]domain.Client, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []domain.Client{}
	for _, client := range s.clients {
		if client.TenantID == tenantID {
			out = append(out, client)
		}
	}
	return out, nil
}

func (s *MemoryStore) GetClient(_ context.Context, tenantID, clientID string) (domain.Client, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	client, ok := s.clients[clientID]
	if !ok || client.TenantID != tenantID {
		return domain.Client{}, ErrNotFound
	}
	return client, nil
}

func (s *MemoryStore) GetClientByClientID(_ context.Context, clientID string) (domain.Client, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	client, ok := s.clients[clientID]
	if !ok {
		return domain.Client{}, ErrNotFound
	}
	return client, nil
}

func (s *MemoryStore) UpdateClient(_ context.Context, client domain.Client) (domain.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.clients[client.ClientID]; !ok {
		return domain.Client{}, ErrNotFound
	}
	s.clients[client.ClientID] = client
	return client, nil
}

func (s *MemoryStore) SoftDeleteClient(ctx context.Context, tenantID, clientID string) (domain.Client, error) {
	client, err := s.GetClient(ctx, tenantID, clientID)
	if err != nil {
		return domain.Client{}, err
	}
	now := time.Now().UTC()
	client.Status = domain.StatusInactive
	client.DeactivatedAt = &now
	client.UpdatedAt = now
	return s.UpdateClient(ctx, client)
}

func eventKey(clientID, eventID string) string { return clientID + "\x00" + eventID }

func (s *MemoryStore) CreateAuthEvent(_ context.Context, event domain.AuthEvent) (domain.AuthEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := eventKey(event.ClientID, event.EventID)
	if _, ok := s.events[key]; ok {
		return domain.AuthEvent{}, ErrDuplicate
	}
	s.events[key] = event
	return event, nil
}

func (s *MemoryStore) ListEvents(_ context.Context, tenantID string) ([]domain.AuthEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := []domain.AuthEvent{}
	for _, event := range s.events {
		if event.TenantID == tenantID {
			out = append(out, event)
		}
	}
	return out, nil
}

func (s *MemoryStore) GetEvent(_ context.Context, clientID, eventID string) (domain.AuthEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	event, ok := s.events[eventKey(clientID, eventID)]
	if !ok {
		return domain.AuthEvent{}, ErrNotFound
	}
	return event, nil
}

func (s *MemoryStore) MarkEventsPurged(_ context.Context, clientID string, eventIDs []string) ([]string, []string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	purged := []string{}
	unknown := []string{}
	for _, eventID := range eventIDs {
		key := eventKey(clientID, eventID)
		event, ok := s.events[key]
		if !ok {
			unknown = append(unknown, eventID)
			continue
		}
		event.PurgeStatus = domain.PurgePurged
		s.events[key] = event
		purged = append(purged, eventID)
	}
	return purged, unknown, nil
}

package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"face-detection-backend/internal/domain"
)

const (
	defaultFileStoreDir = "data"

	tenantsFile = "tenants.json"
	usersFile   = "users.json"
	clientsFile = "clients.json"
	eventsFile  = "auth_events.json"
)

type FileStore struct {
	mu      sync.RWMutex
	dir     string
	tenants map[string]domain.Tenant
	users   map[string]domain.User
	clients map[string]domain.Client
	events  map[string]domain.AuthEvent
}

func NewFileStore(dir string) (*FileStore, error) {
	if dir == "" {
		dir = defaultFileStoreDir
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	s := &FileStore{
		dir:     dir,
		tenants: map[string]domain.Tenant{},
		users:   map[string]domain.User{},
		clients: map[string]domain.Client{},
		events:  map[string]domain.AuthEvent{},
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	if err := s.saveAllLocked(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *FileStore) EnsureIndexes(context.Context) error { return nil }

func (s *FileStore) CreateTenant(_ context.Context, tenant domain.Tenant) (domain.Tenant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.tenants[tenant.ID]; ok {
		return domain.Tenant{}, ErrDuplicate
	}
	s.tenants[tenant.ID] = tenant
	if err := s.saveTenantsLocked(); err != nil {
		delete(s.tenants, tenant.ID)
		return domain.Tenant{}, err
	}
	return tenant, nil
}

func (s *FileStore) ListTenants(context.Context) ([]domain.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return sortedTenants(s.tenants), nil
}

func (s *FileStore) GetTenant(_ context.Context, tenantID string) (domain.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	tenant, ok := s.tenants[tenantID]
	if !ok {
		return domain.Tenant{}, ErrNotFound
	}
	return tenant, nil
}

func (s *FileStore) UpdateTenant(_ context.Context, tenant domain.Tenant) (domain.Tenant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, ok := s.tenants[tenant.ID]
	if !ok {
		return domain.Tenant{}, ErrNotFound
	}
	s.tenants[tenant.ID] = tenant
	if err := s.saveTenantsLocked(); err != nil {
		s.tenants[tenant.ID] = previous
		return domain.Tenant{}, err
	}
	return tenant, nil
}

func (s *FileStore) SoftDeleteTenant(ctx context.Context, tenantID string) (domain.Tenant, error) {
	tenant, err := s.GetTenant(ctx, tenantID)
	if err != nil {
		return domain.Tenant{}, err
	}
	tenant.Status = domain.StatusInactive
	tenant.UpdatedAt = time.Now().UTC()
	return s.UpdateTenant(ctx, tenant)
}

func (s *FileStore) CreateUser(_ context.Context, user domain.User) (domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if userConflict(s.users, user, "") {
		return domain.User{}, ErrDuplicate
	}
	s.users[user.ID] = user
	if err := s.saveUsersLocked(); err != nil {
		delete(s.users, user.ID)
		return domain.User{}, err
	}
	return user, nil
}

func (s *FileStore) ListUsers(_ context.Context, tenantID string) ([]domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	users := []domain.User{}
	for _, user := range s.users {
		if user.TenantID == tenantID {
			users = append(users, user)
		}
	}
	sortUsers(users)
	return users, nil
}

func (s *FileStore) GetUser(_ context.Context, tenantID, userID string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	user, ok := s.users[userID]
	if !ok || user.TenantID != tenantID {
		return domain.User{}, ErrNotFound
	}
	return user, nil
}

func (s *FileStore) GetUserByID(_ context.Context, userID string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	user, ok := s.users[userID]
	if !ok {
		return domain.User{}, ErrNotFound
	}
	return user, nil
}

func (s *FileStore) FindUserByEmployeeID(_ context.Context, tenantID, employeeID string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, user := range s.users {
		if user.TenantID == tenantID && user.EmployeeID == employeeID {
			return user, nil
		}
	}
	return domain.User{}, ErrNotFound
}

func (s *FileStore) FindUserByUsername(_ context.Context, tenantID, username string) (domain.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, user := range s.users {
		if user.TenantID == tenantID && user.Username == username {
			return user, nil
		}
	}
	return domain.User{}, ErrNotFound
}

func (s *FileStore) UpdateUser(_ context.Context, user domain.User) (domain.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, ok := s.users[user.ID]
	if !ok || previous.TenantID != user.TenantID {
		return domain.User{}, ErrNotFound
	}
	if userConflict(s.users, user, user.ID) {
		return domain.User{}, ErrDuplicate
	}
	s.users[user.ID] = user
	if err := s.saveUsersLocked(); err != nil {
		s.users[user.ID] = previous
		return domain.User{}, err
	}
	return user, nil
}

func (s *FileStore) SoftDeleteUser(ctx context.Context, tenantID, userID string) (domain.User, error) {
	user, err := s.GetUser(ctx, tenantID, userID)
	if err != nil {
		return domain.User{}, err
	}
	user.Status = domain.StatusInactive
	user.UpdatedAt = time.Now().UTC()
	return s.UpdateUser(ctx, user)
}

func (s *FileStore) CreateClient(_ context.Context, client domain.Client) (domain.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.clients[client.ClientID]; ok {
		return domain.Client{}, ErrDuplicate
	}
	s.clients[client.ClientID] = client
	if err := s.saveClientsLocked(); err != nil {
		delete(s.clients, client.ClientID)
		return domain.Client{}, err
	}
	return client, nil
}

func (s *FileStore) ListClients(_ context.Context, tenantID string) ([]domain.Client, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	clients := []domain.Client{}
	for _, client := range s.clients {
		if client.TenantID == tenantID {
			clients = append(clients, client)
		}
	}
	sortClients(clients)
	return clients, nil
}

func (s *FileStore) GetClient(_ context.Context, tenantID, clientID string) (domain.Client, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	client, ok := s.clients[clientID]
	if !ok || client.TenantID != tenantID {
		return domain.Client{}, ErrNotFound
	}
	return client, nil
}

func (s *FileStore) GetClientByClientID(_ context.Context, clientID string) (domain.Client, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	client, ok := s.clients[clientID]
	if !ok {
		return domain.Client{}, ErrNotFound
	}
	return client, nil
}

func (s *FileStore) UpdateClient(_ context.Context, client domain.Client) (domain.Client, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	previous, ok := s.clients[client.ClientID]
	if !ok {
		return domain.Client{}, ErrNotFound
	}
	s.clients[client.ClientID] = client
	if err := s.saveClientsLocked(); err != nil {
		s.clients[client.ClientID] = previous
		return domain.Client{}, err
	}
	return client, nil
}

func (s *FileStore) SoftDeleteClient(ctx context.Context, tenantID, clientID string) (domain.Client, error) {
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

func (s *FileStore) CreateAuthEvent(_ context.Context, event domain.AuthEvent) (domain.AuthEvent, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := eventKey(event.ClientID, event.EventID)
	if _, ok := s.events[key]; ok {
		return domain.AuthEvent{}, ErrDuplicate
	}
	s.events[key] = event
	if err := s.saveEventsLocked(); err != nil {
		delete(s.events, key)
		return domain.AuthEvent{}, err
	}
	return event, nil
}

func (s *FileStore) ListEvents(_ context.Context, tenantID string) ([]domain.AuthEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	events := []domain.AuthEvent{}
	for _, event := range s.events {
		if event.TenantID == tenantID {
			events = append(events, event)
		}
	}
	sortEvents(events)
	return events, nil
}

func (s *FileStore) GetEvent(_ context.Context, clientID, eventID string) (domain.AuthEvent, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	event, ok := s.events[eventKey(clientID, eventID)]
	if !ok {
		return domain.AuthEvent{}, ErrNotFound
	}
	return event, nil
}

func (s *FileStore) MarkEventsPurged(_ context.Context, clientID string, eventIDs []string) ([]string, []string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	purged := []string{}
	unknown := []string{}
	previous := map[string]domain.AuthEvent{}
	for _, eventID := range eventIDs {
		key := eventKey(clientID, eventID)
		event, ok := s.events[key]
		if !ok {
			unknown = append(unknown, eventID)
			continue
		}
		previous[key] = event
		event.PurgeStatus = domain.PurgePurged
		s.events[key] = event
		purged = append(purged, eventID)
	}
	if len(previous) == 0 {
		return purged, unknown, nil
	}
	if err := s.saveEventsLocked(); err != nil {
		for key, event := range previous {
			s.events[key] = event
		}
		return nil, nil, err
	}
	return purged, unknown, nil
}

func (s *FileStore) load() error {
	tenants, err := loadCollection[domain.Tenant](s.path(tenantsFile))
	if err != nil {
		return err
	}
	for i, tenant := range tenants {
		if tenant.ID == "" {
			return fmt.Errorf("%s item %d: id is required", tenantsFile, i)
		}
		if _, ok := s.tenants[tenant.ID]; ok {
			return fmt.Errorf("%s item %d: duplicate tenant id %q", tenantsFile, i, tenant.ID)
		}
		s.tenants[tenant.ID] = tenant
	}

	users, err := loadCollection[domain.User](s.path(usersFile))
	if err != nil {
		return err
	}
	for i, user := range users {
		if user.ID == "" {
			return fmt.Errorf("%s item %d: id is required", usersFile, i)
		}
		if _, ok := s.users[user.ID]; ok {
			return fmt.Errorf("%s item %d: duplicate user id %q", usersFile, i, user.ID)
		}
		if userConflict(s.users, user, "") {
			return fmt.Errorf("%s item %d: duplicate employeeId or username", usersFile, i)
		}
		s.users[user.ID] = user
	}

	clients, err := loadCollection[domain.Client](s.path(clientsFile))
	if err != nil {
		return err
	}
	for i, client := range clients {
		if client.ClientID == "" {
			return fmt.Errorf("%s item %d: clientId is required", clientsFile, i)
		}
		if _, ok := s.clients[client.ClientID]; ok {
			return fmt.Errorf("%s item %d: duplicate clientId %q", clientsFile, i, client.ClientID)
		}
		s.clients[client.ClientID] = client
	}

	events, err := loadCollection[domain.AuthEvent](s.path(eventsFile))
	if err != nil {
		return err
	}
	for i, event := range events {
		if event.ClientID == "" || event.EventID == "" {
			return fmt.Errorf("%s item %d: clientId and eventId are required", eventsFile, i)
		}
		key := eventKey(event.ClientID, event.EventID)
		if _, ok := s.events[key]; ok {
			return fmt.Errorf("%s item %d: duplicate clientId/eventId", eventsFile, i)
		}
		s.events[key] = event
	}
	return nil
}

func (s *FileStore) saveAllLocked() error {
	if err := s.saveTenantsLocked(); err != nil {
		return err
	}
	if err := s.saveUsersLocked(); err != nil {
		return err
	}
	if err := s.saveClientsLocked(); err != nil {
		return err
	}
	return s.saveEventsLocked()
}

func (s *FileStore) saveTenantsLocked() error {
	return writeCollection(s.path(tenantsFile), sortedTenants(s.tenants))
}

func (s *FileStore) saveUsersLocked() error {
	users := make([]domain.User, 0, len(s.users))
	for _, user := range s.users {
		users = append(users, user)
	}
	sortUsers(users)
	return writeCollection(s.path(usersFile), users)
}

func (s *FileStore) saveClientsLocked() error {
	clients := make([]domain.Client, 0, len(s.clients))
	for _, client := range s.clients {
		clients = append(clients, client)
	}
	sortClients(clients)
	return writeCollection(s.path(clientsFile), clients)
}

func (s *FileStore) saveEventsLocked() error {
	events := make([]domain.AuthEvent, 0, len(s.events))
	for _, event := range s.events {
		events = append(events, event)
	}
	sortEvents(events)
	return writeCollection(s.path(eventsFile), events)
}

func (s *FileStore) path(name string) string {
	return filepath.Join(s.dir, name)
}

func userConflict(users map[string]domain.User, user domain.User, ignoreID string) bool {
	for _, existing := range users {
		if existing.ID == ignoreID {
			continue
		}
		if existing.TenantID == user.TenantID && existing.EmployeeID == user.EmployeeID {
			return true
		}
		if existing.TenantID == user.TenantID && existing.Username != "" && existing.Username == user.Username {
			return true
		}
	}
	return false
}

func loadCollection[T any](path string) ([]T, error) {
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return []T{}, nil
	}
	if err != nil {
		return nil, err
	}
	if len(bytes.TrimSpace(data)) == 0 {
		return []T{}, nil
	}
	var items []T
	if err := json.Unmarshal(data, &items); err != nil {
		return nil, fmt.Errorf("decode %s: %w", path, err)
	}
	if items == nil {
		return []T{}, nil
	}
	return items, nil
}

func writeCollection(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	file, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".*.tmp")
	if err != nil {
		return err
	}
	tmpName := file.Name()
	removeTmp := true
	defer func() {
		if removeTmp {
			_ = os.Remove(tmpName)
		}
	}()

	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Sync(); err != nil {
		_ = file.Close()
		return err
	}
	if err := file.Close(); err != nil {
		return err
	}
	if err := os.Chmod(tmpName, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmpName, path); err != nil {
		return err
	}
	removeTmp = false
	return nil
}

func sortedTenants(items map[string]domain.Tenant) []domain.Tenant {
	tenants := make([]domain.Tenant, 0, len(items))
	for _, tenant := range items {
		tenants = append(tenants, tenant)
	}
	sort.Slice(tenants, func(i, j int) bool {
		if tenants[i].CreatedAt.Equal(tenants[j].CreatedAt) {
			return tenants[i].ID < tenants[j].ID
		}
		return tenants[i].CreatedAt.After(tenants[j].CreatedAt)
	})
	return tenants
}

func sortUsers(users []domain.User) {
	sort.Slice(users, func(i, j int) bool {
		if users[i].CreatedAt.Equal(users[j].CreatedAt) {
			return users[i].ID < users[j].ID
		}
		return users[i].CreatedAt.After(users[j].CreatedAt)
	})
}

func sortClients(clients []domain.Client) {
	sort.Slice(clients, func(i, j int) bool {
		if clients[i].CreatedAt.Equal(clients[j].CreatedAt) {
			return clients[i].ClientID < clients[j].ClientID
		}
		return clients[i].CreatedAt.After(clients[j].CreatedAt)
	})
}

func sortEvents(events []domain.AuthEvent) {
	sort.Slice(events, func(i, j int) bool {
		if events[i].ReceivedAt.Equal(events[j].ReceivedAt) {
			return events[i].EventID < events[j].EventID
		}
		return events[i].ReceivedAt.After(events[j].ReceivedAt)
	})
}

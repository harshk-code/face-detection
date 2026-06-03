package store

import (
	"context"
	"errors"

	"face-detection-backend/internal/domain"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrDuplicate = errors.New("duplicate")
)

type Store interface {
	EnsureIndexes(ctx context.Context) error

	CreateTenant(ctx context.Context, tenant domain.Tenant) (domain.Tenant, error)
	ListTenants(ctx context.Context) ([]domain.Tenant, error)
	GetTenant(ctx context.Context, tenantID string) (domain.Tenant, error)
	UpdateTenant(ctx context.Context, tenant domain.Tenant) (domain.Tenant, error)
	SoftDeleteTenant(ctx context.Context, tenantID string) (domain.Tenant, error)

	CreateUser(ctx context.Context, user domain.User) (domain.User, error)
	ListUsers(ctx context.Context, tenantID string) ([]domain.User, error)
	GetUser(ctx context.Context, tenantID, userID string) (domain.User, error)
	GetUserByID(ctx context.Context, userID string) (domain.User, error)
	FindUserByEmployeeID(ctx context.Context, tenantID, employeeID string) (domain.User, error)
	FindUserByUsername(ctx context.Context, username string) (domain.User, error)
	UpdateUser(ctx context.Context, user domain.User) (domain.User, error)
	SoftDeleteUser(ctx context.Context, tenantID, userID string) (domain.User, error)

	CreateClient(ctx context.Context, client domain.Client) (domain.Client, error)
	ListClients(ctx context.Context, tenantID string) ([]domain.Client, error)
	GetClient(ctx context.Context, tenantID, clientID string) (domain.Client, error)
	GetClientByClientID(ctx context.Context, clientID string) (domain.Client, error)
	UpdateClient(ctx context.Context, client domain.Client) (domain.Client, error)
	SoftDeleteClient(ctx context.Context, tenantID, clientID string) (domain.Client, error)

	CreateAuthEvent(ctx context.Context, event domain.AuthEvent) (domain.AuthEvent, error)
	ListEvents(ctx context.Context, tenantID string) ([]domain.AuthEvent, error)
	GetEvent(ctx context.Context, clientID, eventID string) (domain.AuthEvent, error)
	MarkEventsPurged(ctx context.Context, clientID string, eventIDs []string) ([]string, []string, error)
}

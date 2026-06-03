package store

import (
	"context"
	"errors"
	"time"

	"face-detection-backend/internal/domain"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoStore struct {
	client  *mongo.Client
	db      *mongo.Database
	tenants *mongo.Collection
	users   *mongo.Collection
	clients *mongo.Collection
	events  *mongo.Collection
}

func NewMongoStore(ctx context.Context, uri, database string) (*MongoStore, error) {
	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		_ = client.Disconnect(ctx)
		return nil, err
	}
	db := client.Database(database)
	return &MongoStore{
		client:  client,
		db:      db,
		tenants: db.Collection("tenants"),
		users:   db.Collection("users"),
		clients: db.Collection("clients"),
		events:  db.Collection("auth_events"),
	}, nil
}

func (s *MongoStore) Close(ctx context.Context) error {
	return s.client.Disconnect(ctx)
}

func (s *MongoStore) EnsureIndexes(ctx context.Context) error {
	if _, err := s.users.Indexes().DropOne(ctx, "username_1"); err != nil && !isIndexNotFound(err) {
		return err
	}
	indexes := []struct {
		collection *mongo.Collection
		models     []mongo.IndexModel
	}{
		{s.users, []mongo.IndexModel{{
			Keys:    bson.D{{Key: "tenantId", Value: 1}, {Key: "employeeId", Value: 1}},
			Options: options.Index().SetUnique(true),
		}, {
			Keys:    bson.D{{Key: "tenantId", Value: 1}, {Key: "username", Value: 1}},
			Options: options.Index().SetUnique(true).SetSparse(true),
		}}},
		{s.clients, []mongo.IndexModel{{
			Keys:    bson.D{{Key: "clientId", Value: 1}},
			Options: options.Index().SetUnique(true),
		}}},
		{s.events, []mongo.IndexModel{{
			Keys:    bson.D{{Key: "clientId", Value: 1}, {Key: "eventId", Value: 1}},
			Options: options.Index().SetUnique(true),
		}, {
			Keys: bson.D{{Key: "tenantId", Value: 1}, {Key: "receivedAt", Value: -1}},
		}}},
	}
	for _, index := range indexes {
		if _, err := index.collection.Indexes().CreateMany(ctx, index.models); err != nil {
			return err
		}
	}
	return nil
}

func isIndexNotFound(err error) bool {
	var commandErr mongo.CommandError
	return errors.As(err, &commandErr) && (commandErr.Code == 26 || commandErr.Code == 27)
}

func mapMongoErr(err error) error {
	if err == nil {
		return nil
	}
	if errors.Is(err, mongo.ErrNoDocuments) {
		return ErrNotFound
	}
	if mongo.IsDuplicateKeyError(err) {
		return ErrDuplicate
	}
	return err
}

func (s *MongoStore) CreateTenant(ctx context.Context, tenant domain.Tenant) (domain.Tenant, error) {
	_, err := s.tenants.InsertOne(ctx, tenant)
	return tenant, mapMongoErr(err)
}

func (s *MongoStore) ListTenants(ctx context.Context) ([]domain.Tenant, error) {
	cursor, err := s.tenants.Find(ctx, bson.D{}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var tenants []domain.Tenant
	if err := cursor.All(ctx, &tenants); err != nil {
		return nil, err
	}
	return tenants, nil
}

func (s *MongoStore) GetTenant(ctx context.Context, tenantID string) (domain.Tenant, error) {
	var tenant domain.Tenant
	err := s.tenants.FindOne(ctx, bson.M{"_id": tenantID}).Decode(&tenant)
	return tenant, mapMongoErr(err)
}

func (s *MongoStore) UpdateTenant(ctx context.Context, tenant domain.Tenant) (domain.Tenant, error) {
	result, err := s.tenants.ReplaceOne(ctx, bson.M{"_id": tenant.ID}, tenant)
	if err != nil {
		return domain.Tenant{}, mapMongoErr(err)
	}
	if result.MatchedCount == 0 {
		return domain.Tenant{}, ErrNotFound
	}
	return tenant, nil
}

func (s *MongoStore) SoftDeleteTenant(ctx context.Context, tenantID string) (domain.Tenant, error) {
	tenant, err := s.GetTenant(ctx, tenantID)
	if err != nil {
		return domain.Tenant{}, err
	}
	tenant.Status = domain.StatusInactive
	tenant.UpdatedAt = time.Now().UTC()
	return s.UpdateTenant(ctx, tenant)
}

func (s *MongoStore) CreateUser(ctx context.Context, user domain.User) (domain.User, error) {
	_, err := s.users.InsertOne(ctx, user)
	return user, mapMongoErr(err)
}

func (s *MongoStore) ListUsers(ctx context.Context, tenantID string) ([]domain.User, error) {
	cursor, err := s.users.Find(ctx, bson.M{"tenantId": tenantID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var users []domain.User
	if err := cursor.All(ctx, &users); err != nil {
		return nil, err
	}
	return users, nil
}

func (s *MongoStore) GetUser(ctx context.Context, tenantID, userID string) (domain.User, error) {
	var user domain.User
	err := s.users.FindOne(ctx, bson.M{"_id": userID, "tenantId": tenantID}).Decode(&user)
	return user, mapMongoErr(err)
}

func (s *MongoStore) GetUserByID(ctx context.Context, userID string) (domain.User, error) {
	var user domain.User
	err := s.users.FindOne(ctx, bson.M{"_id": userID}).Decode(&user)
	return user, mapMongoErr(err)
}

func (s *MongoStore) FindUserByEmployeeID(ctx context.Context, tenantID, employeeID string) (domain.User, error) {
	var user domain.User
	err := s.users.FindOne(ctx, bson.M{"tenantId": tenantID, "employeeId": employeeID}).Decode(&user)
	return user, mapMongoErr(err)
}

func (s *MongoStore) FindUserByUsername(ctx context.Context, tenantID, username string) (domain.User, error) {
	var user domain.User
	err := s.users.FindOne(ctx, bson.M{"tenantId": tenantID, "username": username}).Decode(&user)
	return user, mapMongoErr(err)
}

func (s *MongoStore) UpdateUser(ctx context.Context, user domain.User) (domain.User, error) {
	result, err := s.users.ReplaceOne(ctx, bson.M{"_id": user.ID, "tenantId": user.TenantID}, user)
	if err != nil {
		return domain.User{}, mapMongoErr(err)
	}
	if result.MatchedCount == 0 {
		return domain.User{}, ErrNotFound
	}
	return user, nil
}

func (s *MongoStore) SoftDeleteUser(ctx context.Context, tenantID, userID string) (domain.User, error) {
	user, err := s.GetUser(ctx, tenantID, userID)
	if err != nil {
		return domain.User{}, err
	}
	user.Status = domain.StatusInactive
	user.UpdatedAt = time.Now().UTC()
	return s.UpdateUser(ctx, user)
}

func (s *MongoStore) CreateClient(ctx context.Context, client domain.Client) (domain.Client, error) {
	_, err := s.clients.InsertOne(ctx, client)
	return client, mapMongoErr(err)
}

func (s *MongoStore) ListClients(ctx context.Context, tenantID string) ([]domain.Client, error) {
	cursor, err := s.clients.Find(ctx, bson.M{"tenantId": tenantID}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var clients []domain.Client
	if err := cursor.All(ctx, &clients); err != nil {
		return nil, err
	}
	return clients, nil
}

func (s *MongoStore) GetClient(ctx context.Context, tenantID, clientID string) (domain.Client, error) {
	var client domain.Client
	err := s.clients.FindOne(ctx, bson.M{"tenantId": tenantID, "clientId": clientID}).Decode(&client)
	return client, mapMongoErr(err)
}

func (s *MongoStore) GetClientByClientID(ctx context.Context, clientID string) (domain.Client, error) {
	var client domain.Client
	err := s.clients.FindOne(ctx, bson.M{"clientId": clientID}).Decode(&client)
	return client, mapMongoErr(err)
}

func (s *MongoStore) UpdateClient(ctx context.Context, client domain.Client) (domain.Client, error) {
	result, err := s.clients.ReplaceOne(ctx, bson.M{"clientId": client.ClientID}, client)
	if err != nil {
		return domain.Client{}, mapMongoErr(err)
	}
	if result.MatchedCount == 0 {
		return domain.Client{}, ErrNotFound
	}
	return client, nil
}

func (s *MongoStore) SoftDeleteClient(ctx context.Context, tenantID, clientID string) (domain.Client, error) {
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

func (s *MongoStore) CreateAuthEvent(ctx context.Context, event domain.AuthEvent) (domain.AuthEvent, error) {
	_, err := s.events.InsertOne(ctx, event)
	return event, mapMongoErr(err)
}

func (s *MongoStore) ListEvents(ctx context.Context, tenantID string) ([]domain.AuthEvent, error) {
	cursor, err := s.events.Find(ctx, bson.M{"tenantId": tenantID}, options.Find().SetSort(bson.D{{Key: "receivedAt", Value: -1}}))
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var events []domain.AuthEvent
	if err := cursor.All(ctx, &events); err != nil {
		return nil, err
	}
	return events, nil
}

func (s *MongoStore) GetEvent(ctx context.Context, clientID, eventID string) (domain.AuthEvent, error) {
	var event domain.AuthEvent
	err := s.events.FindOne(ctx, bson.M{"clientId": clientID, "eventId": eventID}).Decode(&event)
	return event, mapMongoErr(err)
}

func (s *MongoStore) MarkEventsPurged(ctx context.Context, clientID string, eventIDs []string) ([]string, []string, error) {
	purged := []string{}
	unknown := []string{}
	for _, eventID := range eventIDs {
		result, err := s.events.UpdateOne(ctx, bson.M{"clientId": clientID, "eventId": eventID}, bson.M{"$set": bson.M{"purgeStatus": domain.PurgePurged}})
		if err != nil {
			return nil, nil, err
		}
		if result.MatchedCount == 0 {
			unknown = append(unknown, eventID)
			continue
		}
		purged = append(purged, eventID)
	}
	return purged, unknown, nil
}

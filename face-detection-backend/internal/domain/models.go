package domain

import "time"

const (
	StatusActive   = "ACTIVE"
	StatusInactive = "INACTIVE"

	ConfigModel    = "MODEL_CONFIG"
	ConfigLiveness = "LIVENESS_CONFIG"

	ResultSuccess        = "SUCCESS"
	ResultFaceFailed     = "FACE_FAILED"
	ResultLivenessFailed = "LIVENESS_FAILED"
	ResultError          = "ERROR"

	PurgePending = "PENDING"
	PurgePurged  = "PURGED"
)

type Tenant struct {
	ID        string       `json:"id" bson:"_id"`
	Name      string       `json:"name" bson:"name"`
	Status    string       `json:"status" bson:"status"`
	Configs   TenantConfig `json:"configs" bson:"configs"`
	CreatedAt time.Time    `json:"createdAt" bson:"createdAt"`
	UpdatedAt time.Time    `json:"updatedAt" bson:"updatedAt"`
}

type TenantConfig struct {
	ModelConfig    ModelConfig    `json:"MODEL_CONFIG" bson:"MODEL_CONFIG"`
	LivenessConfig LivenessConfig `json:"LIVENESS_CONFIG" bson:"LIVENESS_CONFIG"`
}

type ModelConfig struct {
	ModelVersion       string  `json:"modelVersion" bson:"modelVersion"`
	FaceThreshold      float64 `json:"faceThreshold" bson:"faceThreshold"`
	LivenessThreshold  float64 `json:"livenessThreshold" bson:"livenessThreshold"`
	EmbeddingDimension int     `json:"embeddingDimension" bson:"embeddingDimension"`
	ModelChecksum      string  `json:"modelChecksum" bson:"modelChecksum"`
	Active             bool    `json:"active" bson:"active"`
}

type LivenessConfig struct {
	ChallengeTypes []string `json:"challengeTypes" bson:"challengeTypes"`
	Active         bool     `json:"active" bson:"active"`
}

type User struct {
	ID         string      `json:"id" bson:"_id"`
	TenantID   string      `json:"tenantId" bson:"tenantId"`
	EmployeeID string      `json:"employeeId" bson:"employeeId"`
	Username   string      `json:"username" bson:"username"`
	Password   string      `json:"-" bson:"password"`
	Name       string      `json:"name" bson:"name"`
	Role       string      `json:"role" bson:"role"`
	Status     string      `json:"status" bson:"status"`
	Embeddings []Embedding `json:"embeddings" bson:"embeddings"`
	CreatedAt  time.Time   `json:"createdAt" bson:"createdAt"`
	UpdatedAt  time.Time   `json:"updatedAt" bson:"updatedAt"`
}

type Embedding struct {
	ID     string    `json:"id" bson:"id"`
	Vector []float64 `json:"vector" bson:"vector"`
}

type Client struct {
	ID            string     `json:"id" bson:"_id"`
	ClientID      string     `json:"clientId" bson:"clientId"`
	TenantID      string     `json:"tenantId" bson:"tenantId"`
	UserID        string     `json:"userId" bson:"userId"`
	DeviceType    string     `json:"deviceType" bson:"deviceType"`
	DeviceName    string     `json:"deviceName" bson:"deviceName"`
	Platform      string     `json:"platform" bson:"platform"`
	AppVersion    string     `json:"appVersion" bson:"appVersion"`
	IMEI          string     `json:"imei,omitempty" bson:"imei,omitempty"`
	Status        string     `json:"status" bson:"status"`
	ActivatedAt   time.Time  `json:"activatedAt" bson:"activatedAt"`
	DeactivatedAt *time.Time `json:"deactivatedAt" bson:"deactivatedAt,omitempty"`
	CreatedAt     time.Time  `json:"createdAt" bson:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt" bson:"updatedAt"`
}

type AuthEvent struct {
	ID             string    `json:"id" bson:"_id"`
	TenantID       string    `json:"tenantId" bson:"tenantId"`
	UserID         string    `json:"userId" bson:"userId"`
	ClientID       string    `json:"clientId" bson:"clientId"`
	EventID        string    `json:"eventId" bson:"eventId"`
	Result         string    `json:"result" bson:"result"`
	FailureReason  string    `json:"failureReason,omitempty" bson:"failureReason,omitempty"`
	FaceScore      float64   `json:"faceScore" bson:"faceScore"`
	LivenessScore  float64   `json:"livenessScore" bson:"livenessScore"`
	ChallengeTypes []string  `json:"challengeTypes" bson:"challengeTypes"`
	LatencyMs      int       `json:"latencyMs" bson:"latencyMs"`
	Embedding      []float64 `json:"embedding" bson:"embedding"`
	CapturedAt     time.Time `json:"capturedAt" bson:"capturedAt"`
	ReceivedAt     time.Time `json:"receivedAt" bson:"receivedAt"`
	PurgeStatus    string    `json:"purgeStatus" bson:"purgeStatus"`
}

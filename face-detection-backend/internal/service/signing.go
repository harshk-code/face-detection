package service

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"time"

	"face-detection-backend/internal/domain"
)

// ProfileSigner signs offline profiles so devices can verify authenticity and
// integrity (including the validUntil expiry) while operating offline.
type ProfileSigner interface {
	Sign(ctx context.Context, profile OfflineProfile) (*string, error)
	PublicKeyBase64() string
	Algorithm() string
	Verify(profile OfflineProfile, signatureB64 string) bool
}

// NoopSigner is the default signer used when no signing key is configured. It
// produces no signature and never verifies, making the absence of signing
// explicit rather than silently "valid".
type NoopSigner struct{}

func (NoopSigner) Sign(context.Context, OfflineProfile) (*string, error) { return nil, nil }
func (NoopSigner) PublicKeyBase64() string                              { return "" }
func (NoopSigner) Algorithm() string                                   { return "none" }
func (NoopSigner) Verify(OfflineProfile, string) bool                  { return false }

// Ed25519Signer signs offline profiles with an Ed25519 private key.
type Ed25519Signer struct {
	priv ed25519.PrivateKey
	pub  ed25519.PublicKey
}

// NewEd25519Signer builds a signer from a 32-byte seed.
func NewEd25519Signer(seed []byte) (*Ed25519Signer, error) {
	if len(seed) != ed25519.SeedSize {
		return nil, BadRequest("signing seed must be %d bytes, got %d", ed25519.SeedSize, len(seed))
	}
	priv := ed25519.NewKeyFromSeed(seed)
	return &Ed25519Signer{priv: priv, pub: priv.Public().(ed25519.PublicKey)}, nil
}

// GenerateEd25519Signer creates a signer from a freshly generated ephemeral key.
// Returns the signer and the base64-encoded seed so it can be persisted.
func GenerateEd25519Signer() (*Ed25519Signer, string, error) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		return nil, "", err
	}
	seed := priv.Seed()
	return &Ed25519Signer{priv: priv, pub: pub}, base64.StdEncoding.EncodeToString(seed), nil
}

func (s *Ed25519Signer) Algorithm() string { return "Ed25519" }

func (s *Ed25519Signer) PublicKeyBase64() string {
	return base64.StdEncoding.EncodeToString(s.pub)
}

func (s *Ed25519Signer) Sign(_ context.Context, profile OfflineProfile) (*string, error) {
	payload, err := canonicalProfileBytes(profile)
	if err != nil {
		return nil, err
	}
	sig := ed25519.Sign(s.priv, payload)
	encoded := base64.StdEncoding.EncodeToString(sig)
	return &encoded, nil
}

func (s *Ed25519Signer) Verify(profile OfflineProfile, signatureB64 string) bool {
	sig, err := base64.StdEncoding.DecodeString(signatureB64)
	if err != nil {
		return false
	}
	payload, err := canonicalProfileBytes(profile)
	if err != nil {
		return false
	}
	return ed25519.Verify(s.pub, payload, sig)
}

// signablePayload is the canonical, signature-free view of an offline profile.
// Field order is fixed by struct declaration so json.Marshal is deterministic;
// re-marshalling from typed values on verify yields identical bytes regardless
// of how the client transmitted the JSON.
type signablePayload struct {
	ClientID       string                `json:"clientId"`
	TenantID       string                `json:"tenantId"`
	UserID         string                `json:"userId"`
	EmployeeID     string                `json:"employeeId"`
	UserName       string                `json:"userName"`
	ModelConfig    domain.ModelConfig    `json:"modelConfig"`
	LivenessConfig domain.LivenessConfig `json:"livenessConfig"`
	Embeddings     []domain.Embedding    `json:"embeddings"`
	ValidUntil     time.Time             `json:"validUntil"`
}

func canonicalProfileBytes(profile OfflineProfile) ([]byte, error) {
	return json.Marshal(signablePayload{
		ClientID:       profile.ClientID,
		TenantID:       profile.TenantID,
		UserID:         profile.UserID,
		EmployeeID:     profile.EmployeeID,
		UserName:       profile.UserName,
		ModelConfig:    profile.ModelConfig,
		LivenessConfig: profile.LivenessConfig,
		Embeddings:     profile.Embeddings,
		ValidUntil:     profile.ValidUntil.UTC(),
	})
}

package config

import (
	"os"
	"strings"
)

type Config struct {
	Port          string
	MongoURI      string
	MongoDatabase string

	// SigningSeed is a base64-encoded 32-byte Ed25519 seed used to sign offline
	// profiles. If empty, an ephemeral key is generated at startup.
	SigningSeed string

	// AuthEnabled toggles JWT enforcement on protected routes.
	AuthEnabled bool
	// JWTSecret signs HS256 access tokens.
	JWTSecret string
	// AdminUsername / AdminPassword are the bootstrap admin-login credentials.
	AdminUsername string
	AdminPassword string
}

func Load() Config {
	return Config{
		Port:          envOrDefault("PORT", "18081"),
		MongoURI:      envOrDefault("MONGO_URI", "mongodb://localhost:27017"),
		MongoDatabase: envOrDefault("MONGO_DATABASE", "face_detection"),
		SigningSeed:   os.Getenv("PROFILE_SIGNING_SEED"),
		AuthEnabled:   envBool("AUTH_ENABLED", true),
		JWTSecret:     envOrDefault("JWT_SECRET", "dev-insecure-jwt-secret-change-me"),
		AdminUsername: envOrDefault("ADMIN_USERNAME", "admin"),
		AdminPassword: envOrDefault("ADMIN_PASSWORD", "admin"),
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	switch strings.ToLower(value) {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

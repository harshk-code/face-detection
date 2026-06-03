package config

import "os"

type Config struct {
	Port          string
	MongoURI      string
	MongoDatabase string
}

func Load() Config {
	return Config{
		Port:          envOrDefault("PORT", "8080"),
		MongoURI:      envOrDefault("MONGO_URI", "mongodb://localhost:27017"),
		MongoDatabase: envOrDefault("MONGO_DATABASE", "face_detection"),
	}
}

func envOrDefault(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

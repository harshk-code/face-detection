package config

import "os"

type Config struct {
	Port          string
	StoreBackend  string
	FileStoreDir  string
	MongoURI      string
	MongoDatabase string
}

func Load() Config {
	return Config{
		Port:          envOrDefault("PORT", "8080"),
		StoreBackend:  envOrDefault("STORE_BACKEND", envOrDefault("STORE_TYPE", "file")),
		FileStoreDir:  envOrDefault("FILE_STORE_DIR", "data"),
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

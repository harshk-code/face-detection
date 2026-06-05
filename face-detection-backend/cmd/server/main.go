package main

import (
	"context"
	"encoding/base64"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"face-detection-backend/internal/auth"
	"face-detection-backend/internal/config"
	"face-detection-backend/internal/httpapi"
	"face-detection-backend/internal/service"
	"face-detection-backend/internal/store"
)

func buildSigner(cfg config.Config) service.ProfileSigner {
	if cfg.SigningSeed != "" {
		seed, err := base64.StdEncoding.DecodeString(cfg.SigningSeed)
		if err != nil {
			log.Fatalf("decode PROFILE_SIGNING_SEED: %v", err)
		}
		signer, err := service.NewEd25519Signer(seed)
		if err != nil {
			log.Fatalf("build signer: %v", err)
		}
		log.Printf("profile signing enabled (Ed25519, pubkey=%s)", signer.PublicKeyBase64())
		return signer
	}
	signer, seed, err := service.GenerateEd25519Signer()
	if err != nil {
		log.Fatalf("generate signer: %v", err)
	}
	log.Printf("WARNING: PROFILE_SIGNING_SEED not set; generated an ephemeral key (set PROFILE_SIGNING_SEED=%s to persist across restarts)", seed)
	log.Printf("profile signing enabled (Ed25519, pubkey=%s)", signer.PublicKeyBase64())
	return signer
}

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	mongoStore, err := store.NewMongoStore(ctx, cfg.MongoURI, cfg.MongoDatabase)
	if err != nil {
		log.Fatalf("connect mongo: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = mongoStore.Close(ctx)
	}()

	if err := mongoStore.EnsureIndexes(ctx); err != nil {
		log.Fatalf("ensure mongo indexes: %v", err)
	}
	if err := service.New(mongoStore).EnsureDefaultTenant(ctx); err != nil {
		log.Fatalf("ensure default tenant: %v", err)
	}

	if !cfg.AuthEnabled {
		log.Printf("WARNING: AUTH_ENABLED=false; all routes are unauthenticated")
	}
	if cfg.JWTSecret == "dev-insecure-jwt-secret-change-me" {
		log.Printf("WARNING: using default JWT_SECRET; set JWT_SECRET in production")
	}
	if cfg.AdminPassword == "admin" {
		log.Printf("WARNING: using default admin password; set ADMIN_PASSWORD in production")
	}

	authManager := auth.NewManager(cfg.JWTSecret, cfg.AuthEnabled)
	router := httpapi.NewRouterWithOptions(mongoStore, httpapi.Options{
		Auth:      authManager,
		Signer:    buildSigner(cfg),
		AdminUser: cfg.AdminUsername,
		AdminPass: cfg.AdminPassword,
	})
	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("face-detection backend listening on :%s", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Fatalf("server shutdown: %v", err)
	}
}

package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"face-detection-backend/internal/config"
	"face-detection-backend/internal/httpapi"
	"face-detection-backend/internal/service"
	"face-detection-backend/internal/store"
)

func main() {
	cfg := config.Load()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	appStore, closeStore, err := newStore(ctx, cfg)
	if err != nil {
		log.Fatalf("initialize store: %v", err)
	}
	defer func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = closeStore(ctx)
	}()

	if err := appStore.EnsureIndexes(ctx); err != nil {
		log.Fatalf("ensure store indexes: %v", err)
	}
	if err := service.New(appStore).EnsureDefaultTenant(ctx); err != nil {
		log.Fatalf("ensure default tenant: %v", err)
	}

	router := httpapi.NewRouter(appStore)
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

func newStore(ctx context.Context, cfg config.Config) (store.Store, func(context.Context) error, error) {
	switch strings.ToLower(strings.TrimSpace(cfg.StoreBackend)) {
	case "", "file", "json":
		fileStore, err := store.NewFileStore(cfg.FileStoreDir)
		if err != nil {
			return nil, nil, err
		}
		log.Printf("using file store in %s", cfg.FileStoreDir)
		return fileStore, func(context.Context) error { return nil }, nil
	case "mongo", "mongodb":
		mongoStore, err := store.NewMongoStore(ctx, cfg.MongoURI, cfg.MongoDatabase)
		if err != nil {
			return nil, nil, err
		}
		log.Printf("using mongo store database %s", cfg.MongoDatabase)
		return mongoStore, mongoStore.Close, nil
	default:
		return nil, nil, fmt.Errorf("unsupported STORE_BACKEND %q", cfg.StoreBackend)
	}
}

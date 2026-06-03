package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"face-detection-backend/internal/config"
	"face-detection-backend/internal/httpapi"
	"face-detection-backend/internal/store"
)

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

	router := httpapi.NewRouter(mongoStore)
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

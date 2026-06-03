package service

import (
	"strings"

	"face-detection-backend/internal/domain"
)

var allowedChallenges = map[string]bool{
	"BLINK":      true,
	"SMILE":      true,
	"TURN_LEFT":  true,
	"TURN_RIGHT": true,
	"NOD":        true,
}

var allowedResults = map[string]bool{
	domain.ResultSuccess:        true,
	domain.ResultFaceFailed:     true,
	domain.ResultLivenessFailed: true,
	domain.ResultError:          true,
}

func ValidateTenantConfig(config domain.TenantConfig) error {
	if strings.TrimSpace(config.ModelConfig.ModelVersion) == "" {
		return BadRequest("MODEL_CONFIG.modelVersion is required")
	}
	if config.ModelConfig.FaceThreshold < 0 || config.ModelConfig.FaceThreshold > 1 {
		return BadRequest("MODEL_CONFIG.faceThreshold must be between 0 and 1")
	}
	if config.ModelConfig.LivenessThreshold < 0 || config.ModelConfig.LivenessThreshold > 1 {
		return BadRequest("MODEL_CONFIG.livenessThreshold must be between 0 and 1")
	}
	if config.ModelConfig.EmbeddingDimension <= 0 {
		return BadRequest("MODEL_CONFIG.embeddingDimension must be greater than zero")
	}
	if strings.TrimSpace(config.ModelConfig.ModelChecksum) == "" {
		return BadRequest("MODEL_CONFIG.modelChecksum is required")
	}
	if len(config.LivenessConfig.ChallengeTypes) == 0 {
		return BadRequest("LIVENESS_CONFIG.challengeTypes is required")
	}
	for _, challenge := range config.LivenessConfig.ChallengeTypes {
		if !allowedChallenges[challenge] {
			return BadRequest("unsupported liveness challenge type %q", challenge)
		}
	}
	return nil
}

func ValidateEmbeddings(embeddings []domain.Embedding, dimension int) error {
	if len(embeddings) == 0 {
		return BadRequest("at least one embedding is required")
	}
	for _, embedding := range embeddings {
		if len(embedding.Vector) != dimension {
			return BadRequest("embedding %q dimension mismatch: expected %d, got %d", embedding.ID, dimension, len(embedding.Vector))
		}
	}
	return nil
}

func ValidateEventEmbedding(embedding []float64, dimension int) error {
	if len(embedding) != dimension {
		return BadRequest("event embedding dimension mismatch: expected %d, got %d", dimension, len(embedding))
	}
	return nil
}

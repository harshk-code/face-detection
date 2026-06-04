package service

import (
	"crypto/subtle"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

// hashPassword returns a bcrypt hash of the plaintext password.
func hashPassword(plaintext string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plaintext), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// looksHashed reports whether stored looks like a bcrypt hash ($2a$, $2b$, $2y$).
func looksHashed(stored string) bool {
	return strings.HasPrefix(stored, "$2a$") ||
		strings.HasPrefix(stored, "$2b$") ||
		strings.HasPrefix(stored, "$2y$")
}

// verifyPassword checks a plaintext candidate against a stored credential.
// Stored values created before bcrypt was introduced are compared in
// constant time as a legacy fallback so existing data keeps working.
func verifyPassword(stored, candidate string) bool {
	if looksHashed(stored) {
		return bcrypt.CompareHashAndPassword([]byte(stored), []byte(candidate)) == nil
	}
	return subtle.ConstantTimeCompare([]byte(stored), []byte(candidate)) == 1
}

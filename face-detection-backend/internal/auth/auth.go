package auth

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

const (
	RoleAdmin = "ADMIN"

	headerTenant = "x-tenant-id"
)

// Claims is the JWT payload for both admin and tenant-user tokens.
type Claims struct {
	TenantID string `json:"tenantId,omitempty"`
	UserID   string `json:"userId,omitempty"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

// Manager mints and verifies access tokens and exposes gin middleware.
type Manager struct {
	enabled bool
	secret  []byte
	ttl     time.Duration
}

func NewManager(secret string, enabled bool) *Manager {
	return &Manager{
		enabled: enabled,
		secret:  []byte(secret),
		ttl:     12 * time.Hour,
	}
}

func (m *Manager) Enabled() bool { return m.enabled }

func (m *Manager) mint(claims Claims) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(m.ttl)
	claims.RegisteredClaims = jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(expiresAt),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(m.secret)
	return signed, expiresAt, err
}

// MintAdmin issues a token granting cross-tenant admin access.
func (m *Manager) MintAdmin(subject string) (string, time.Time, error) {
	return m.mint(Claims{UserID: subject, Role: RoleAdmin})
}

// MintUser issues a tenant-scoped user token.
func (m *Manager) MintUser(tenantID, userID, role string) (string, time.Time, error) {
	if role == "" {
		role = "USER"
	}
	return m.mint(Claims{TenantID: tenantID, UserID: userID, Role: role})
}

func (m *Manager) parse(tokenString string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, jwt.ErrTokenSignatureInvalid
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, err
	}
	return claims, nil
}

func bearerToken(c *gin.Context) string {
	header := c.GetHeader("Authorization")
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
		return strings.TrimSpace(parts[1])
	}
	return ""
}

func unauthorized(c *gin.Context, msg string) {
	c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
		"error": gin.H{"code": "UNAUTHORIZED", "message": msg},
	})
}

func forbidden(c *gin.Context, msg string) {
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
		"error": gin.H{"code": "FORBIDDEN", "message": msg},
	})
}

// RequireAdmin permits only admin tokens.
func (m *Manager) RequireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !m.enabled {
			c.Next()
			return
		}
		token := bearerToken(c)
		if token == "" {
			unauthorized(c, "missing bearer token")
			return
		}
		claims, err := m.parse(token)
		if err != nil {
			unauthorized(c, "invalid or expired token")
			return
		}
		if claims.Role != RoleAdmin {
			forbidden(c, "admin access required")
			return
		}
		c.Next()
	}
}

// RequireUserOrAdmin permits admin tokens (cross-tenant) and tenant-user tokens.
// For user tokens the x-tenant-id header is forced to the token's tenant so a
// user can only act within their own tenant.
func (m *Manager) RequireUserOrAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !m.enabled {
			c.Next()
			return
		}
		token := bearerToken(c)
		if token == "" {
			unauthorized(c, "missing bearer token")
			return
		}
		claims, err := m.parse(token)
		if err != nil {
			unauthorized(c, "invalid or expired token")
			return
		}
		if claims.Role == RoleAdmin {
			c.Next()
			return
		}
		if claims.TenantID == "" {
			forbidden(c, "token is not bound to a tenant")
			return
		}
		// Enforce tenant isolation: ignore any client-supplied tenant header.
		c.Request.Header.Set(headerTenant, claims.TenantID)
		c.Next()
	}
}

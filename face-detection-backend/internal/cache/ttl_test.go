package cache_test

import (
	"testing"
	"time"

	"face-detection-backend/internal/cache"
	"github.com/stretchr/testify/require"
)

func TestTTLCache(t *testing.T) {
	c := cache.NewTTL[string, string](20 * time.Millisecond)
	c.Set("client", "resolved")

	value, ok := c.Get("client")
	require.True(t, ok)
	require.Equal(t, "resolved", value)

	time.Sleep(30 * time.Millisecond)
	_, ok = c.Get("client")
	require.False(t, ok)
}

func TestTTLCacheClear(t *testing.T) {
	c := cache.NewTTL[string, string](time.Minute)
	c.Set("client", "resolved")
	c.Clear()

	_, ok := c.Get("client")
	require.False(t, ok)
}

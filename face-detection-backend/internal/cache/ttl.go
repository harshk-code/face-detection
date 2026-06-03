package cache

import (
	"sync"
	"time"
)

type TTL[K comparable, V any] struct {
	mu      sync.RWMutex
	ttl     time.Duration
	entries map[K]entry[V]
}

type entry[V any] struct {
	value     V
	expiresAt time.Time
}

func NewTTL[K comparable, V any](ttl time.Duration) *TTL[K, V] {
	return &TTL[K, V]{
		ttl:     ttl,
		entries: map[K]entry[V]{},
	}
}

func (c *TTL[K, V]) Get(key K) (V, bool) {
	c.mu.RLock()
	item, ok := c.entries[key]
	c.mu.RUnlock()
	var zero V
	if !ok {
		return zero, false
	}
	if time.Now().After(item.expiresAt) {
		c.Delete(key)
		return zero, false
	}
	return item.value, true
}

func (c *TTL[K, V]) Set(key K, value V) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries[key] = entry[V]{
		value:     value,
		expiresAt: time.Now().Add(c.ttl),
	}
}

func (c *TTL[K, V]) Delete(key K) {
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.entries, key)
}

func (c *TTL[K, V]) Clear() {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.entries = map[K]entry[V]{}
}

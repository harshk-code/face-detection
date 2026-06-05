package store

import (
	"context"
	"testing"
	"time"

	"face-detection-backend/internal/domain"

	"github.com/stretchr/testify/require"
)

func sampleEvent(eventID string) domain.AuthEvent {
	return domain.AuthEvent{
		ID:             "id-" + eventID,
		TenantID:       "Cars24",
		UserID:         "user-1",
		ClientID:       "client-1",
		EventID:        eventID,
		Result:         domain.ResultSuccess,
		FaceScore:      0.91,
		LivenessScore:  1,
		ChallengeTypes: []string{"BLINK"},
		LatencyMs:      120,
		CapturedAt:     time.Unix(1_780_000_000, 0).UTC(),
		ReceivedAt:     time.Unix(1_780_000_001, 0).UTC(),
		PurgeStatus:    domain.PurgePending,
	}
}

func TestFileStore_MarkEventsPurged(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()

	s, err := NewFileStore(dir)
	require.NoError(t, err)

	_, err = s.CreateAuthEvent(ctx, sampleEvent("evt-1"))
	require.NoError(t, err)
	_, err = s.CreateAuthEvent(ctx, sampleEvent("evt-2"))
	require.NoError(t, err)

	// Purge one known + one unknown id.
	purged, unknown, err := s.MarkEventsPurged(ctx, "client-1", []string{"evt-1", "evt-missing"})
	require.NoError(t, err)
	require.Equal(t, []string{"evt-1"}, purged)
	require.Equal(t, []string{"evt-missing"}, unknown)

	// evt-1 is PURGED, evt-2 is still PENDING (and not deleted).
	got1, err := s.GetEvent(ctx, "client-1", "evt-1")
	require.NoError(t, err)
	require.Equal(t, domain.PurgePurged, got1.PurgeStatus)

	got2, err := s.GetEvent(ctx, "client-1", "evt-2")
	require.NoError(t, err)
	require.Equal(t, domain.PurgePending, got2.PurgeStatus)
}

func TestFileStore_PurgeIsIdempotent(t *testing.T) {
	ctx := context.Background()
	s, err := NewFileStore(t.TempDir())
	require.NoError(t, err)
	_, err = s.CreateAuthEvent(ctx, sampleEvent("evt-1"))
	require.NoError(t, err)

	first, _, err := s.MarkEventsPurged(ctx, "client-1", []string{"evt-1"})
	require.NoError(t, err)
	require.Equal(t, []string{"evt-1"}, first)

	// Re-purging the same id is safe and still reports it purged.
	second, _, err := s.MarkEventsPurged(ctx, "client-1", []string{"evt-1"})
	require.NoError(t, err)
	require.Equal(t, []string{"evt-1"}, second)
}

func TestFileStore_PurgePersistsAcrossReopen(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()

	// Write + purge with one store instance.
	s1, err := NewFileStore(dir)
	require.NoError(t, err)
	_, err = s1.CreateAuthEvent(ctx, sampleEvent("evt-1"))
	require.NoError(t, err)
	_, _, err = s1.MarkEventsPurged(ctx, "client-1", []string{"evt-1"})
	require.NoError(t, err)

	// Re-open the SAME directory in a fresh store — the PURGED status must survive.
	s2, err := NewFileStore(dir)
	require.NoError(t, err)
	got, err := s2.GetEvent(ctx, "client-1", "evt-1")
	require.NoError(t, err)
	require.Equal(t, domain.PurgePurged, got.PurgeStatus)
}

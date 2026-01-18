package logging

import (
	"context"
	"sync"
	"testing"

	"github.com/stretchr/testify/assert"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"
)

// resetLogger resets the global logger instance for testing
func resetLogger() {
	logger = nil
	once = sync.Once{}
}

func TestGetLogger_Fallback(t *testing.T) {
	resetLogger()
	l := GetLogger()
	assert.NotNil(t, l, "GetLogger should return a fallback logger if not initialized")
}

func TestGetLogger_Singleton(t *testing.T) {
	resetLogger()
	err := Initialize(true)
	assert.NoError(t, err)

	l1 := GetLogger()
	l2 := GetLogger()

	assert.NotNil(t, l1)
	assert.NotNil(t, l2)
	assert.Equal(t, l1, l2, "GetLogger should return the same instance after initialization")
}

func TestWithContext(t *testing.T) {
	resetLogger()

	// Create an observer to capture logs
	core, logs := observer.New(zap.InfoLevel)
	testLogger := zap.New(core)

	// Inject test logger
	logger = testLogger

	// Default context (background)
	Info(context.Background(), "test1")
	assert.Equal(t, 1, logs.Len())
	assert.Equal(t, "test1", logs.All()[0].Message)

	// Context with values
	ctx := context.WithValue(context.Background(), RoomIDKey, "room-123")
	ctx = context.WithValue(ctx, UserIDKey, "user-456")

	Info(ctx, "test2")

	assert.Equal(t, 2, logs.Len())
	entry := logs.All()[1]
	assert.Equal(t, "test2", entry.Message)

	fields := entry.ContextMap()
	assert.Equal(t, "room-123", fields["room_id"])
	assert.Equal(t, "user-456", fields["user_id"])
}

func TestHelperMethods(t *testing.T) {
	resetLogger()

	core, logs := observer.New(zap.DebugLevel)
	testLogger := zap.New(core)

	logger = testLogger

	ctx := context.Background()

	Info(ctx, "info msg", zap.String("key", "val"))
	Warn(ctx, "warn msg")
	Error(ctx, "error msg")

	assert.Equal(t, 3, logs.Len())
	assert.Equal(t, zap.InfoLevel, logs.All()[0].Level)
	assert.Equal(t, zap.WarnLevel, logs.All()[1].Level)
	assert.Equal(t, zap.ErrorLevel, logs.All()[2].Level)
}

func TestInitialize(t *testing.T) {
	resetLogger()
	err := Initialize(true)
	assert.NoError(t, err)
	assert.NotNil(t, logger)

	// Should be idempotent
	l1 := logger
	err = Initialize(false)
	assert.NoError(t, err)
	assert.Equal(t, l1, logger)
}

func TestAppendContextFields(t *testing.T) {
	ctx := context.Background()
	ctx = context.WithValue(ctx, RoomIDKey, "R1")
	ctx = context.WithValue(ctx, UserIDKey, "U1")
	ctx = context.WithValue(ctx, CorrelationIDKey, "Req1")

	fields := appendContextFields(ctx, []zap.Field{})

	// Encoder to verify fields
	enc := zapcore.NewMapObjectEncoder()
	for _, f := range fields {
		f.AddTo(enc)
	}

	assert.Equal(t, "R1", enc.Fields["room_id"])
	assert.Equal(t, "U1", enc.Fields["user_id"])
	assert.Equal(t, "Req1", enc.Fields["correlation_id"])
	assert.Equal(t, "backend-go", enc.Fields["service"])
}

func TestRedactEmail(t *testing.T) {
	assert.Equal(t, "", RedactEmail(""))
	assert.Equal(t, "***", RedactEmail("plainstring"))
	assert.Equal(t, "***@example.com", RedactEmail("user@example.com"))
	assert.Equal(t, "***@sub.domain.com", RedactEmail("firstname.lastname@sub.domain.com"))
}

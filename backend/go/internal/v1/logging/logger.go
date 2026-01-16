package logging

import (
	"context"
	"sync"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	logger *zap.Logger
	once   sync.Once
)

type contextKey string

const (
	CorrelationIDKey contextKey = "correlation_id"
	UserIDKey        contextKey = "user_id"
	RoomIDKey        contextKey = "room_id"
)

// Initialize sets up the global logger based on the environment
func Initialize(development bool) error {
	var err error
	once.Do(func() {
		var config zap.Config
		if development {
			config = zap.NewDevelopmentConfig()
			config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		} else {
			config = zap.NewProductionConfig()
			config.EncoderConfig.TimeKey = "timestamp"
			config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
		}

		// Common configuration
		config.OutputPaths = []string{"stdout"}
		config.ErrorOutputPaths = []string{"stderr"}

		logger, err = config.Build(zap.AddCallerSkip(1))
	})
	return err
}

// GetLogger returns the global logger instance
func GetLogger() *zap.Logger {
	if logger == nil {
		// Fallback specific for tests or before init
		l, _ := zap.NewDevelopment()
		return l
	}
	return logger
}

// Info logs a message at InfoLevel
func Info(ctx context.Context, msg string, fields ...zap.Field) {
	GetLogger().Info(msg, appendContextFields(ctx, fields)...)
}

// Warn logs a message at WarnLevel
func Warn(ctx context.Context, msg string, fields ...zap.Field) {
	GetLogger().Warn(msg, appendContextFields(ctx, fields)...)
}

// Error logs a message at ErrorLevel
func Error(ctx context.Context, msg string, fields ...zap.Field) {
	GetLogger().Error(msg, appendContextFields(ctx, fields)...)
}

// Fatal logs a message at FatalLevel
func Fatal(ctx context.Context, msg string, fields ...zap.Field) {
	GetLogger().Fatal(msg, appendContextFields(ctx, fields)...)
}

// WithContext adds context fields to the logger
func appendContextFields(ctx context.Context, fields []zap.Field) []zap.Field {
	if ctx == nil {
		return fields
	}

	if cid, ok := ctx.Value(CorrelationIDKey).(string); ok {
		fields = append(fields, zap.String("correlation_id", cid))
	}
	if uid, ok := ctx.Value(UserIDKey).(string); ok {
		fields = append(fields, zap.String("user_id", uid))
	}
	if rid, ok := ctx.Value(RoomIDKey).(string); ok {
		fields = append(fields, zap.String("room_id", rid))
	}

	// Default service name
	fields = append(fields, zap.String("service", "backend-go"))

	return fields
}

// PII Redaction helpers

// RedactEmail masks the local part of an email address
func RedactEmail(email string) string {
	if len(email) == 0 {
		return ""
	}
	// Simple redaction logic
	atIndex := -1
	for i, c := range email {
		if c == '@' {
			atIndex = i
			break
		}
	}
	if atIndex > 0 {
		return "***" + email[atIndex:]
	}
	return "***"
}

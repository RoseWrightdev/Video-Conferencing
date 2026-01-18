// Package middleware contains Gin middleware for the application.
package middleware

import (
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// HeaderXCorrelationID is the header key for the correlation ID.
const HeaderXCorrelationID = "X-Correlation-ID"

// CorrelationID adds a correlation ID to the request context.
func CorrelationID() gin.HandlerFunc {
	return func(c *gin.Context) {
		correlationID := c.GetHeader(HeaderXCorrelationID)
		if correlationID == "" {
			correlationID = uuid.New().String()
		}

		// Set in header for response
		c.Header(HeaderXCorrelationID, correlationID)

		// Set in context for logger
		c.Set(string(logging.CorrelationIDKey), correlationID)

		// Pass to next handlers
		c.Next()
	}
}

package middleware

import (
	"github.com/RoseWrightdev/Video-Conferencing/backend/go/internal/v1/logging"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const HeaderXCorrelationID = "X-Correlation-ID"

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

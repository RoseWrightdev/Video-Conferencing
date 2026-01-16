package metrics

import (
	"testing"

	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestMetricsRegistration(t *testing.T) {

	t.Run("RedisOperationsTotal", func(t *testing.T) {
		RedisOperationsTotal.WithLabelValues("get", "success").Inc()
		// If we got here without panic, good.
		// We can also use testutil to check value if we strictly need to.
		val := testutil.ToFloat64(RedisOperationsTotal.WithLabelValues("get", "success"))
		if val < 1 {
			t.Errorf("Expected RedisOperationsTotal to be at least 1, got %v", val)
		}
	})

	t.Run("RedisOperationDuration", func(t *testing.T) {
		RedisOperationDuration.WithLabelValues("get").Observe(0.1)
		// verifying histogram is complex, but no-panic is the main goal here for registration
	})
}

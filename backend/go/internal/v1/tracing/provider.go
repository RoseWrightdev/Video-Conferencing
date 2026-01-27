package tracing

import (
	"context"
	"crypto/tls"
	"fmt"
	"os"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.17.0"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials"
)

// InitTracer initializes the OpenTelemetry tracer provider
func InitTracer(ctx context.Context, serviceName string, collectorAddr string) (*sdktrace.TracerProvider, error) {
	// Configure TLS for gRPC collector connection
	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS12,
	}

	// Allow insecure skip verify for development if explicitly enabled
	if os.Getenv("OTEL_INSECURE_SKIP_VERIFY") == "true" {
		tlsConfig.InsecureSkipVerify = true
	}

	// Create gRPC client for collector with TLS
	creds := credentials.NewTLS(tlsConfig)
	conn, err := grpc.NewClient(collectorAddr, grpc.WithTransportCredentials(creds))
	if err != nil {
		return nil, fmt.Errorf("failed to create gRPC client to collector: %w", err)
	}

	// Create OTLP exporter
	traceExporter, err := otlptracegrpc.New(ctx, otlptracegrpc.WithGRPCConn(conn))
	if err != nil {
		return nil, fmt.Errorf("failed to create trace exporter: %w", err)
	}

	// Define resource attributes
	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			"",
			semconv.ServiceName(serviceName),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	// Create TracerProvider
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(traceExporter),
		sdktrace.WithResource(res),
	)

	// Set global TracerProvider
	otel.SetTracerProvider(tp)

	// Set global Propagator (W3C TraceContext is standard)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	return tp, nil
}

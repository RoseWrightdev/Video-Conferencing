FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy project files
COPY pyproject.toml uv.lock ./
COPY main.py transcriber.py ./
COPY proto/ proto/
COPY tests/ tests/
COPY models/ models/

# Install dependencies
RUN uv sync --frozen

# Expose ports
EXPOSE 50051
EXPOSE 8000

# Create a non-root user
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Run the service
CMD ["uv", "run", "opentelemetry-instrument", "--traces_exporter", "otlp", "--metrics_exporter", "none", "--service_name", "stream-processor", "--exporter_otlp_endpoint", "http://otel-collector:4317", "python", "main.py"]

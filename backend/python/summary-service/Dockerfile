FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    cmake \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy project files
COPY pyproject.toml uv.lock ./
COPY main.py ./
COPY proto/ proto/

# Install dependencies
RUN uv sync --frozen

# Expose ports
EXPOSE 50052
EXPOSE 8001

# Run the service
CMD ["uv", "run", "opentelemetry-instrument", "--traces_exporter", "otlp", "--metrics_exporter", "none", "--service_name", "summary-service", "--exporter_otlp_endpoint", "http://otel-collector:4317", "python", "main.py"]

# Summary Service Dockerfile
# Base: Python 3.12 Slim
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy Service Files
COPY backend/python/summary-service/pyproject.toml backend/python/summary-service/uv.lock ./
COPY backend/python/summary-service/main.py ./
COPY backend/python/summary-service/proto ./proto

# Sync dependencies
RUN uv sync --frozen

# Create directory for models
RUN mkdir -p models

# Expose gRPC port
EXPOSE 50052
# Expose HTTP port
EXPOSE 8001

# Run the service
CMD ["uv", "run", "python", "main.py"]

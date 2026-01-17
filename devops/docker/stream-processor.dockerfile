# Stream Processor Dockerfile
# Base: Python 3.12 Slim
FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
# libgomp1 is often needed for audio/numerical libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv from the official image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy Service Files from Project Root context
# Structure:
# backend/python/stream-processor/
#   pyproject.toml, uv.lock, main.py, transcriber.py, proto/
COPY backend/python/stream-processor/pyproject.toml backend/python/stream-processor/uv.lock ./
COPY backend/python/stream-processor/main.py backend/python/stream-processor/transcriber.py ./
COPY backend/python/stream-processor/proto ./proto

# Sync dependencies
# We use --frozen to ensure we use the exact versions in uv.lock
RUN uv sync --frozen

# Expose gRPC port
EXPOSE 50051
# Expose HTTP port
EXPOSE 8000

# Run the service
CMD ["uv", "run", "python", "main.py"]

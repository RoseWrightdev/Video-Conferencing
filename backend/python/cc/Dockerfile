FROM python:3.12-slim

WORKDIR /app

# Install system dependencies (e.g. for audio processing if needed, though we use pure python/numpy for now)
# libgomp1 is often needed for OMP in some ML libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

# Copy project files
COPY pyproject.toml uv.lock ./
COPY main.py transcriber.py ./
COPY cc_pb2.py cc_pb2_grpc.py ./

# Install dependencies
RUN uv sync --frozen

# Expose ports
EXPOSE 50051
EXPOSE 8000

# Run the service
CMD ["uv", "run", "python", "main.py"]

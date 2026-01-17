#!/bin/bash
set -e

# Load .env file
if [ -f .env ]; then
    export $(cat .env | xargs)
else
    echo "❌ Error: .env file missing. Please create one with:"
    echo "JWT_SECRET=..."
    echo "REDIS_PASSWORD=..."
    echo "PUBLIC_IP=..."
    exit 1
fi

echo "🚀 Starting Deployment to meet.rosewright.dev..."

# 1. Update Images
echo "📥 Pulling latest images..."
docker compose -f docker-compose.prod.yaml pull

# 2. Restart Services
echo "🔄 Restarting containers..."
docker compose -f docker-compose.prod.yaml up -d --remove-orphans

# 3. Cleanup
echo "🧹 Cleaning up old images..."
docker image prune -a -f --filter "until=24h"

echo "✅ Deployment Complete!"
echo "   Frontend: https://meet.rosewright.dev"
echo "   Backend:  https://api.meet.rosewright.dev"

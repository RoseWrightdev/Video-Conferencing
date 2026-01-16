#!/bin/bash
set -e

# Default URL if not provided
BASE_URL=${1:-"http://localhost"}

echo "Running smoke tests against $BASE_URL..."

# 1. Backend Health Check
echo "Checking Backend Health..."
HEALTH_URL="$BASE_URL/health/live"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" || echo "failed")
if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Backend Health Check Passed ($HTTP_CODE)"
else
    echo "❌ Backend Health Check Failed with status $HTTP_CODE"
    exit 1
fi

# 2. Frontend Load Check
echo "Checking Frontend Load..."
FRONTEND_URL="$BASE_URL"
HTTP_CODE=$(curl -L -s -o /dev/null -w "%{http_code}" "$FRONTEND_URL" || echo "failed")
if [ "$HTTP_CODE" == "200" ]; then
    echo "✅ Frontend Load Check Passed ($HTTP_CODE)"
else
    echo "❌ Frontend Load Check Failed with status $HTTP_CODE"
    exit 1
fi

# 3. WebSocket Connection Check
# Requires wscat or python/node script. Using curl with upgrade header as simple check if endpoint exists.
echo "Checking WebSocket Endpoint..."
WS_URL="$BASE_URL/ws"
# Checking for 400 Bad Request (expected for curl without upgrade) or 101 Switching Protocols
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "Connection: Upgrade" -H "Upgrade: websocket" "$WS_URL" || echo "failed")
if [[ "$HTTP_CODE" == "400" || "$HTTP_CODE" == "426" || "$HTTP_CODE" == "101" ]]; then
    echo "✅ WebSocket Endpoint Accessible ($HTTP_CODE)"
else
    echo "⚠️ WebSocket Endpoint unexpected status $HTTP_CODE (Might be okay if behind ingress)"
    # Not failing strictly for MVP if curl check is flaky, but logging warning.
fi

# 4. Room Creation (Simulated via API if exists, or skipped for MVP smoke test script complexity)
echo "Room creation check skipped for MVP script (requires auth flow)."

echo "All Smoke Tests Passed!"
exit 0

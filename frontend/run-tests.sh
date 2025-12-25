#!/bin/bash

# Frontend Test Runner Script
# Runs all unit tests and displays a summary

set -e

echo "================================"
echo "Running Frontend Unit Tests"
echo "================================"
echo ""

# Navigate to frontend directory
cd "$(dirname "$0")"

# Run tests
echo "📦 Installing dependencies (if needed)..."
npm install --silent

echo ""
echo "🧪 Running unit tests..."
echo ""

# Run vitest with the unit project
npx vitest run --project=unit --reporter=verbose

echo ""
echo "✅ Test run complete!"
echo ""
echo "For coverage report, run:"
echo "  npx vitest run --project=unit --coverage"
echo ""
echo "For watch mode, run:"
echo "  npm run test:unit"

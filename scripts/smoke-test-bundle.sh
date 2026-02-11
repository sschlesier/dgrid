#!/usr/bin/env bash
# Smoke test: bundle the backend and verify it starts and responds to /health
set -euo pipefail

echo "Smoke testing CJS bundle..."

# Bundle (includes frontend build)
pnpm bundle

# Start the server in background
node dist/sea/server.cjs --no-open &
PID=$!

cleanup() {
  kill "$PID" 2>/dev/null || true
  wait "$PID" 2>/dev/null || true
}
trap cleanup EXIT

# Wait for server to be ready (up to 10 seconds)
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3001/health >/dev/null 2>&1; then
    echo "Bundle smoke test passed (health check OK)"
    exit 0
  fi
  sleep 0.5
done

echo "Bundle smoke test FAILED: server did not respond to /health within 10s"
exit 1

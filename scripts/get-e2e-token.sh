#!/bin/bash
#
# Get E2E Test Token from Clerk
#
# This script creates a session for the E2E test user and returns a valid JWT token.
# The token can be used for authenticated E2E tests.
#
# Required environment variables:
#   CLERK_SECRET_KEY    - Clerk Backend API secret key
#   E2E_TEST_USER_ID    - Clerk user ID for the test user
#
# Optional environment variables:
#   CLERK_API_URL       - Clerk API URL (default: https://api.clerk.com)
#
# Usage:
#   export CLERK_SECRET_KEY="sk_test_xxx"
#   export E2E_TEST_USER_ID="user_xxx"
#   ./scripts/get-e2e-token.sh
#
# Output:
#   Prints the JWT token to stdout (for use in CI/CD)
#

set -e

# Configuration
CLERK_SECRET_KEY="${CLERK_SECRET_KEY:-}"
E2E_TEST_USER_ID="${E2E_TEST_USER_ID:-}"
CLERK_API_URL="${CLERK_API_URL:-https://api.clerk.com}"

# Validation
if [ -z "$CLERK_SECRET_KEY" ]; then
  echo "ERROR: CLERK_SECRET_KEY is required" >&2
  exit 1
fi

if [ -z "$E2E_TEST_USER_ID" ]; then
  echo "ERROR: E2E_TEST_USER_ID is required" >&2
  exit 1
fi

# Step 1: Create a new session for the test user
SESSION_RESPONSE=$(curl -s -X POST "${CLERK_API_URL}/v1/sessions" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"user_id\": \"${E2E_TEST_USER_ID}\"}")

# Check for errors
if echo "$SESSION_RESPONSE" | grep -q '"errors"'; then
  echo "ERROR: Failed to create session" >&2
  echo "$SESSION_RESPONSE" >&2
  exit 1
fi

# Extract session ID
SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo "ERROR: Could not extract session ID from response" >&2
  echo "$SESSION_RESPONSE" >&2
  exit 1
fi

# Step 2: Create a session token
TOKEN_RESPONSE=$(curl -s -X POST "${CLERK_API_URL}/v1/sessions/${SESSION_ID}/tokens" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}" \
  -H "Content-Type: application/json")

# Check for errors
if echo "$TOKEN_RESPONSE" | grep -q '"errors"'; then
  echo "ERROR: Failed to create token" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# Extract JWT
JWT=$(echo "$TOKEN_RESPONSE" | grep -o '"jwt":"[^"]*"' | cut -d'"' -f4)

if [ -z "$JWT" ]; then
  echo "ERROR: Could not extract JWT from response" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# Output the token
echo "$JWT"

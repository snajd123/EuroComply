#!/bin/bash
#
# Get E2E Test Token from Clerk
#
# This script creates a session token for the E2E test user using Clerk.
# The token can be used for authenticated E2E tests.
#
# Required environment variables:
#   CLERK_SECRET_KEY       - Clerk Secret Key (sk_test_* or sk_live_*)
#   E2E_CLERK_USER_ID      - Clerk user ID for the test user (user_*)
#
# Usage:
#   export CLERK_SECRET_KEY="sk_test_xxx"
#   export E2E_CLERK_USER_ID="user_xxx"
#   ./scripts/get-e2e-token.sh
#
# Output:
#   Prints the JWT token to stdout (for use in CI/CD)
#

set -e

# Configuration
CLERK_SECRET_KEY="${CLERK_SECRET_KEY:-}"
E2E_CLERK_USER_ID="${E2E_CLERK_USER_ID:-}"

# Validation
if [ -z "$CLERK_SECRET_KEY" ]; then
  echo "ERROR: CLERK_SECRET_KEY is required" >&2
  exit 1
fi

if [ -z "$E2E_CLERK_USER_ID" ]; then
  echo "ERROR: E2E_CLERK_USER_ID is required" >&2
  exit 1
fi

# Get token via Clerk Backend API - create a session token
# Using the sessions endpoint to create a token for the user
TOKEN_RESPONSE=$(curl -s -X POST "https://api.clerk.com/v1/sessions" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"user_id": "'"${E2E_CLERK_USER_ID}"'"}')

# Check for errors
if echo "$TOKEN_RESPONSE" | grep -q '"errors"'; then
  echo "ERROR: Failed to create session" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# Extract session ID
SESSION_ID=$(echo "$TOKEN_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo "ERROR: Could not extract session ID from response" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# Get session token
TOKEN_RESPONSE=$(curl -s -X POST "https://api.clerk.com/v1/sessions/${SESSION_ID}/tokens" \
  -H "Authorization: Bearer ${CLERK_SECRET_KEY}" \
  -H "Content-Type: application/json")

# Extract JWT token
TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"jwt":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not extract token from response" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# Output the token
echo "$TOKEN"

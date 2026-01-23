#!/bin/bash
#
# Get E2E Test Token from ZITADEL
#
# This script creates a session token for the E2E test user using ZITADEL.
# The token can be used for authenticated E2E tests.
#
# Required environment variables:
#   ZITADEL_PAT            - ZITADEL Personal Access Token (service account)
#   ZITADEL_INSTANCE_URL   - ZITADEL instance URL (e.g., https://your-instance.zitadel.cloud)
#   E2E_ZITADEL_USER_ID    - ZITADEL user ID for the test user
#
# Usage:
#   export ZITADEL_PAT="your_pat_token"
#   export ZITADEL_INSTANCE_URL="https://your-instance.zitadel.cloud"
#   export E2E_ZITADEL_USER_ID="user_xxx"
#   ./scripts/get-e2e-token.sh
#
# Output:
#   Prints the JWT token to stdout (for use in CI/CD)
#

set -e

# Configuration
ZITADEL_PAT="${ZITADEL_PAT:-}"
ZITADEL_INSTANCE_URL="${ZITADEL_INSTANCE_URL:-}"
E2E_ZITADEL_USER_ID="${E2E_ZITADEL_USER_ID:-}"

# Validation
if [ -z "$ZITADEL_PAT" ]; then
  echo "ERROR: ZITADEL_PAT is required" >&2
  exit 1
fi

if [ -z "$ZITADEL_INSTANCE_URL" ]; then
  echo "ERROR: ZITADEL_INSTANCE_URL is required" >&2
  exit 1
fi

if [ -z "$E2E_ZITADEL_USER_ID" ]; then
  echo "ERROR: E2E_ZITADEL_USER_ID is required" >&2
  exit 1
fi

# Get token via ZITADEL management API - create impersonation token
# Note: This requires the service account to have impersonation permissions
TOKEN_RESPONSE=$(curl -s -X POST "${ZITADEL_INSTANCE_URL}/management/v1/users/${E2E_ZITADEL_USER_ID}/pat" \
  -H "Authorization: Bearer ${ZITADEL_PAT}" \
  -H "Content-Type: application/json" \
  -d '{"expirationDate": "'"$(date -d '+1 hour' -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -v+1H -u +%Y-%m-%dT%H:%M:%SZ)"'"}')

# Check for errors
if echo "$TOKEN_RESPONSE" | grep -q '"code"'; then
  echo "ERROR: Failed to create token" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# Extract token
TOKEN=$(echo "$TOKEN_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo "ERROR: Could not extract token from response" >&2
  echo "$TOKEN_RESPONSE" >&2
  exit 1
fi

# Output the token
echo "$TOKEN"

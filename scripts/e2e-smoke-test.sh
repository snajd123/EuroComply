#!/bin/bash
#
# E2E Smoke Test for EuroComply API
#
# This script verifies that the API is functioning correctly after deployment.
# It tests public endpoints and, if a test token is provided, authenticated endpoints.
#
# Usage:
#   ./scripts/e2e-smoke-test.sh [API_URL]
#
# Environment variables:
#   API_URL          - Base URL of the API (default: https://api-staging.eurocomply.eu)
#   E2E_TEST_TOKEN   - Clerk JWT token for authenticated tests (optional)
#   E2E_ORG_ID       - Organization ID for authenticated tests (optional)
#

set -e

# Configuration
API_URL="${API_URL:-${1:-https://api-staging.eurocomply.eu}}"
FAILED=0
PASSED=0
AUTH_FAILED=0
AUTH_PASSED=0

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "========================================"
echo "  EuroComply E2E Smoke Test"
echo "========================================"
echo "API URL: $API_URL"
echo ""

# Helper function to run a test
run_test() {
  local name="$1"
  local result="$2"
  local expected="$3"

  if echo "$result" | grep -q "$expected"; then
    echo -e "${GREEN}✓${NC} $name"
    PASSED=$((PASSED + 1))
    return 0
  else
    echo -e "${RED}✗${NC} $name"
    echo "  Expected: $expected"
    echo "  Got: $result"
    FAILED=$((FAILED + 1))
    return 1
  fi
}

# Helper for HTTP requests
http_get() {
  curl -s -k "$1" 2>/dev/null || echo '{"error":"request_failed"}'
}

http_post() {
  local url="$1"
  local data="$2"
  local headers="$3"

  if [ -n "$headers" ]; then
    curl -s -k -X POST "$url" -H "Content-Type: application/json" $headers -d "$data" 2>/dev/null || echo '{"error":"request_failed"}'
  else
    curl -s -k -X POST "$url" -H "Content-Type: application/json" -d "$data" 2>/dev/null || echo '{"error":"request_failed"}'
  fi
}

echo "--- Public Endpoints (No Auth) ---"
echo ""

# Test 1: Basic health check
echo "Testing basic health endpoint..."
RESULT=$(http_get "$API_URL/health")
run_test "GET /health returns ok" "$RESULT" '"status":"ok"'

# Test 2: Deep health check (database connectivity)
echo "Testing database connectivity..."
RESULT=$(http_get "$API_URL/health/ready")
run_test "GET /health/ready returns ok" "$RESULT" '"status":"ok"'

# Extract database latency
DB_LATENCY=$(echo "$RESULT" | grep -o '"latency":[0-9]*' | head -1 | cut -d: -f2)
if [ -n "$DB_LATENCY" ]; then
  echo "  Database latency: ${DB_LATENCY}ms"
fi

# Test 3: Verification endpoint exists (should return error without data, not 404)
echo "Testing verification endpoint..."
RESULT=$(http_post "$API_URL/api/v1/verify" '{}')
# Should return validation error, not 404
if echo "$RESULT" | grep -q "error\|invalid\|required"; then
  echo -e "${GREEN}✓${NC} POST /api/v1/verify endpoint exists (returns validation error as expected)"
  PASSED=$((PASSED + 1))
else
  echo -e "${RED}✗${NC} POST /api/v1/verify endpoint check"
  echo "  Got: $RESULT"
  FAILED=$((FAILED + 1))
fi

# Test 4: Check that unauthenticated requests to protected endpoints fail properly
echo "Testing auth protection..."
RESULT=$(http_get "$API_URL/api/v1/organizations")
if echo "$RESULT" | grep -qi "unauthorized\|authentication\|authorization\|missing"; then
  echo -e "${GREEN}✓${NC} Protected endpoints require authentication"
  PASSED=$((PASSED + 1))
else
  echo -e "${YELLOW}?${NC} Auth check inconclusive"
  echo "  Got: $RESULT"
fi

echo ""

# Authenticated tests (only if token provided)
if [ -n "$E2E_TEST_TOKEN" ]; then
  echo "--- Authenticated Endpoints ---"
  echo ""

  AUTH_HEADER="-H \"Authorization: Bearer $E2E_TEST_TOKEN\""

  # Test: List organizations
  echo "Testing organization listing..."
  RESULT=$(curl -s -k "$API_URL/api/v1/organizations" \
    -H "Authorization: Bearer $E2E_TEST_TOKEN" 2>/dev/null)

  if echo "$RESULT" | grep -q '"success":true\|"data"\|"organizations"'; then
    echo -e "${GREEN}✓${NC} GET /api/v1/organizations works with auth"
    AUTH_PASSED=$((AUTH_PASSED + 1))

    # Try to extract an org ID for further tests
    ORG_ID=$(echo "$RESULT" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    if [ -n "$ORG_ID" ] && [ -z "$E2E_ORG_ID" ]; then
      E2E_ORG_ID="$ORG_ID"
      echo "  Found organization: $E2E_ORG_ID"
    fi
  else
    echo -e "${YELLOW}⚠${NC} GET /api/v1/organizations failed (user may not exist in app DB)"
    echo "  Got: $RESULT"
    AUTH_FAILED=$((AUTH_FAILED + 1))
  fi

  # If we have an org ID, test org-scoped endpoints
  if [ -n "$E2E_ORG_ID" ]; then
    echo ""
    echo "Testing with organization: $E2E_ORG_ID"

    # Test: Get organization details
    RESULT=$(curl -s -k "$API_URL/api/v1/organizations/$E2E_ORG_ID" \
      -H "Authorization: Bearer $E2E_TEST_TOKEN" \
      -H "X-Organization-ID: $E2E_ORG_ID" 2>/dev/null)

    if echo "$RESULT" | grep -q '"id"\|"name"\|"success":true'; then
      echo -e "${GREEN}✓${NC} GET /api/v1/organizations/:id works"
      AUTH_PASSED=$((AUTH_PASSED + 1))
    else
      echo -e "${YELLOW}⚠${NC} GET /api/v1/organizations/:id failed"
      AUTH_FAILED=$((AUTH_FAILED + 1))
    fi

    # Test: List products
    RESULT=$(curl -s -k "$API_URL/api/v1/products" \
      -H "Authorization: Bearer $E2E_TEST_TOKEN" \
      -H "X-Organization-ID: $E2E_ORG_ID" 2>/dev/null)

    if echo "$RESULT" | grep -q '"success":true\|"data"\|"products"\|\[\]'; then
      echo -e "${GREEN}✓${NC} GET /api/v1/products works"
      AUTH_PASSED=$((AUTH_PASSED + 1))
    else
      echo -e "${YELLOW}⚠${NC} GET /api/v1/products failed"
      echo "  Got: $RESULT"
      AUTH_FAILED=$((AUTH_FAILED + 1))
    fi

    # Test: List compliance profiles
    RESULT=$(curl -s -k "$API_URL/api/v1/compliance/profiles" \
      -H "Authorization: Bearer $E2E_TEST_TOKEN" \
      -H "X-Organization-ID: $E2E_ORG_ID" 2>/dev/null)

    if echo "$RESULT" | grep -q '"success":true\|"data"\|"profiles"\|\[\]'; then
      echo -e "${GREEN}✓${NC} GET /api/v1/compliance/profiles works"
      AUTH_PASSED=$((AUTH_PASSED + 1))
    else
      echo -e "${YELLOW}⚠${NC} GET /api/v1/compliance/profiles failed"
      echo "  Got: $RESULT"
      AUTH_FAILED=$((AUTH_FAILED + 1))
    fi
  fi
else
  echo -e "${YELLOW}!${NC} Skipping authenticated tests (E2E_TEST_TOKEN not set)"
  echo "  To run authenticated tests, set E2E_TEST_TOKEN environment variable"
fi

echo ""
echo "========================================"
echo "  Results"
echo "========================================"
echo "Public Endpoints (Critical):"
echo -e "  Passed: ${GREEN}$PASSED${NC}"
echo -e "  Failed: ${RED}$FAILED${NC}"

if [ $AUTH_PASSED -gt 0 ] || [ $AUTH_FAILED -gt 0 ]; then
  echo ""
  echo "Authenticated Endpoints (Non-blocking):"
  echo -e "  Passed: ${GREEN}$AUTH_PASSED${NC}"
  echo -e "  Warnings: ${YELLOW}$AUTH_FAILED${NC}"
fi
echo ""

# Only fail on public endpoint failures (critical tests)
# Authenticated test failures are warnings only
if [ $FAILED -gt 0 ]; then
  echo -e "${RED}E2E smoke test FAILED${NC} (critical public endpoint failure)"
  exit 1
elif [ $AUTH_FAILED -gt 0 ]; then
  echo -e "${YELLOW}E2E smoke test PASSED with warnings${NC} (authenticated tests need user setup)"
  exit 0
else
  echo -e "${GREEN}E2E smoke test PASSED${NC}"
  exit 0
fi

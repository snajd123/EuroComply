# Staging Deployment Verification Checklist

**Date:** 2026-01-19
**Environment:** AWS European Sovereign Cloud (eusc-de-east-1)
**API URL:** https://api-staging.eurocomply.eu

---

## 1. GitHub Actions Status

Check workflow runs at: https://github.com/snajd123/EuroComply/actions

- [ ] **Terraform workflow** completed successfully
- [ ] **CI workflow** passed
- [ ] **Deploy Staging workflow** completed successfully

---

## 2. Infrastructure Verification

### Via AWS Console (console.aws.eu)

- [ ] **VPC**: `eurocomply-staging-vpc` exists with correct CIDR
- [ ] **Security Groups**: Verify egress rules are restricted
  - RDS: Only HTTPS (443) egress
  - ElastiCache: No egress rules (stateful)
- [ ] **RDS**: PostgreSQL instance running with custom parameter group
  - Check: `eurocomply-staging-postgres-params` parameter group attached
  - Verify: `log_connections=1`, `rds.force_ssl=1`
- [ ] **ElastiCache**: Redis cluster running with AUTH enabled
  - Check: `eurocomply-staging-redis-params` parameter group attached
  - Verify: Transit encryption enabled
- [ ] **ECS**: Cluster has running tasks
  - Check: `eurocomply-staging-cluster` has healthy tasks
- [ ] **ALB**: Load balancer is healthy
  - Check: Target group shows healthy targets

---

## 3. API Health Checks

### Basic Health
```bash
# Health endpoint
curl -s https://api-staging.eurocomply.eu/health | jq .

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "...",
#   "version": "..."
# }
```

### Database Connectivity
```bash
# If you have a DB health endpoint
curl -s https://api-staging.eurocomply.eu/health/db | jq .
```

### Redis Connectivity
```bash
# If you have a Redis health endpoint
curl -s https://api-staging.eurocomply.eu/health/redis | jq .
```

---

## 4. Functional Tests

### Authentication
```bash
# Test auth endpoint (should return 401 without token)
curl -s -o /dev/null -w "%{http_code}" https://api-staging.eurocomply.eu/api/v1/me
# Expected: 401

# Test with valid token (if you have one)
curl -s -H "Authorization: Bearer $TOKEN" \
  -H "X-Organization-ID: $ORG_ID" \
  https://api-staging.eurocomply.eu/api/v1/me | jq .
```

### Rate Limiting
```bash
# Verification endpoint (public, rate limited)
for i in {1..5}; do
  curl -s -o /dev/null -w "Request $i: %{http_code}\n" \
    https://api-staging.eurocomply.eu/api/v1/verify/test-id
done
# Should see 404s (not found), but NOT 429s (rate limited) for 5 requests
```

### Body Size Limit
```bash
# Test 1MB body limit (should fail with 413)
dd if=/dev/zero bs=1100000 count=1 2>/dev/null | \
  curl -s -o /dev/null -w "%{http_code}" \
    -X POST -H "Content-Type: application/json" \
    -d @- https://api-staging.eurocomply.eu/api/v1/products
# Expected: 413 (Payload Too Large)
```

---

## 5. CloudWatch Logs

Check logs at: https://console.aws.eu/cloudwatch/home?region=eusc-de-east-1#logsV2:log-groups

- [ ] `/ecs/eurocomply-staging` log group exists
- [ ] Recent logs show application startup
- [ ] No error patterns in logs

---

## 6. Security Verification

### SSL/TLS
```bash
# Check TLS version and cipher
curl -v https://api-staging.eurocomply.eu/health 2>&1 | grep -E "(SSL|TLS|cipher)"
# Should show TLS 1.3 or TLS 1.2
```

### Security Headers
```bash
curl -s -I https://api-staging.eurocomply.eu/health | grep -iE "(strict|x-frame|x-content|x-xss)"
# Should show security headers from Hono secureHeaders middleware
```

### CORS
```bash
curl -s -I -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  https://api-staging.eurocomply.eu/api/v1/health
# Should show Access-Control-Allow-Origin header
```

---

## 7. Database Parameter Group Verification

Via AWS Console or CLI:
```bash
aws rds describe-db-parameters \
  --db-parameter-group-name eurocomply-staging-postgres-params \
  --query "Parameters[?ParameterName=='log_connections' || ParameterName=='rds.force_ssl']"
```

Expected:
- `log_connections = 1`
- `log_disconnections = 1`
- `log_statement = ddl`
- `rds.force_ssl = 1`

---

## 8. Rollback Plan

If issues are found:

1. **Quick rollback** - Revert ECS to previous task definition:
   ```bash
   aws ecs update-service \
     --cluster eurocomply-staging-cluster \
     --service eurocomply-staging-api \
     --task-definition eurocomply-staging-api:PREVIOUS_VERSION
   ```

2. **Infrastructure rollback** - Revert terraform:
   ```bash
   git revert HEAD  # Revert Phase 5 commit
   git push         # Triggers terraform apply with previous config
   ```

---

## Sign-off

- [ ] All checks passed
- [ ] Verified by: _______________
- [ ] Date: _______________

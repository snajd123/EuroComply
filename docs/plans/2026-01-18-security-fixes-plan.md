# Security & Code Quality Fixes Plan

**Date:** 2026-01-18
**Approach:** Security-first, marathon session
**Environment:** Staging deployed
**Strategy:** Fix, test, deploy after each phase

---

## Phase 1: Critical Security Fixes (7 fixes) ✅ COMPLETED

### SQL Injection
- [x] 1.1 `infrastructure/lambda/rds-iam-setup/index.py` - Parameterize `GRANT rds_iam TO` query
- [x] 1.2 `packages/db/src/client.ts` & `tenant.ts` - Strict schema name validation with allowlist

### IAM Policy Restrictions
- [x] 1.3 `infrastructure/terraform/bootstrap/main.tf` - Replace `*` wildcards with specific resource ARNs
- [x] 1.4 `infrastructure/terraform/environments/staging/main.tf` - Scope ECS policy to specific cluster/service

### Authentication Gaps
- [x] 1.5 `infrastructure/terraform/modules/elasticache/main.tf` - Enable Redis AUTH token
- [x] 1.6 `infrastructure/terraform/bootstrap/main.tf` - Fix GitHub OIDC thumbprint, restrict to `snajd123/*`

### Data Loss Prevention
- [x] 1.7 `infrastructure/terraform/modules/waltid/main.tf` - Add EFS volume for persistent data

**Deploy:** Terraform plan + apply to staging

---

## Phase 2: High Priority Security & Stability (10 fixes) ✅ COMPLETED

### Type Safety
- [x] 2.1 `apps/api/src/routes/compliance.ts` - Replace `status as any` with Zod validation
- [x] 2.2 `apps/api/src/routes/operations-events.ts` - Proper enum validation for query params
- [x] 2.3 Multiple routes - Validate `AuthorityLevel` before casting

### Rate Limiting
- [x] 2.4 `apps/api/src/middleware/` - Add rate limiting for public verification endpoints

### Mock Signatures
- [ ] 2.5 `apps/api/src/services/signing.service.ts` - Complete walt.id integration (DEFERRED - requires test refactor)

### Input Validation
- [x] 2.6 `apps/api/src/routes/products.ts` - GTIN checksum validation (mod 10)
- [x] 2.7 `packages/shared/src/operations-events.ts` - Unit enum validation (already existed)

### Infrastructure Hardening
- [x] 2.8 `infrastructure/terraform/modules/waltid/main.tf` - Pin image version
- [x] 2.9 `infrastructure/terraform/environments/staging/main.tf` - Use `data.aws_caller_identity`
- [x] 2.10 `infrastructure/terraform/modules/vpc/main.tf` - Add VPC Flow Logs

**Deploy:** Full test suite + API/infra to staging

---

## Phase 3: Database & Package Fixes (10 fixes) ✅ COMPLETED

### Database Package
- [x] 3.1 `packages/db/src/index.ts` - Keep lazy Proxy for compat, added validation
- [ ] 3.2 `packages/db/src/client.ts` - Fix cache key design (deferred)
- [x] 3.3 `packages/db/src/tenant.ts` - Transaction wrapper, existence check
- [x] 3.4 `packages/db/src/validation.ts` - Add URL masking utilities
- [ ] 3.5 `packages/db/` - Add test coverage (deferred)

### Shared Package
- [ ] 3.6 `packages/shared/src/product.ts` - `PRODUCT_WORKSPACES` still in use (deferred)
- [x] 3.7 `packages/shared/src/forensic.ts` - Email validation already exists
- [ ] 3.8 `packages/shared/src/status-list-bitstring.ts` - Document 131K limit (deferred)

### Walt-id Package
- [x] 3.9 `packages/walt-id/src/client.ts` - Add retry logic with exponential backoff
- [x] 3.10 `packages/walt-id/src/client.ts` - HTTPS validation warning

**Deploy:** Package tests + rebuild dependent apps

---

## Phase 4: API Application Fixes (9 fixes) ✅ COMPLETED

### Incomplete Features
- [ ] 4.1 `apps/api/src/services/verification.service.ts` - Complete RFC3161 validation (deferred)
- [ ] 4.2 `apps/api/src/services/timestamp.service.ts` - Full timestamp verification (deferred)

### Request Safety
- [x] 4.3 `apps/api/src/index.ts` - Request body size limits (1MB)
- [x] 4.4 `apps/api/src/middleware/auth.ts` - Log `optionalAuthMiddleware` failures

### Error Handling
- [ ] 4.5 `apps/api/src/middleware/error-handler.ts` - Standardize error messages (deferred)
- [ ] 4.6 `apps/api/src/routes/` - Audit error response consistency (deferred)

### Pagination
- [ ] 4.7 `apps/api/src/routes/compliance.ts` - Use PAGINATION constants (deferred)
- [ ] 4.8 All list routes - Enforce pagination (deferred)

### Health Check
- [x] 4.9 `infrastructure/terraform/modules/alb/main.tf` - Matcher `200` → `200-299`

**Deploy:** API tests + deploy to staging

---

## Phase 5: Infrastructure Hardening (10 fixes) ✅ DEPLOYED (5 complete, 5 deferred)

### Security Groups
- [x] 5.1 `infrastructure/terraform/modules/security-groups/main.tf` - Restrict egress rules (RDS: HTTPS only, ElastiCache: no egress)
- [ ] 5.2 Document HTTP→HTTPS redirect requirement (deferred - ALB already auto-redirects with cert)

### Database & Cache
- [x] 5.3 `infrastructure/terraform/modules/rds/main.tf` - Custom parameter group (`log_connections`, `rds.force_ssl`, etc.)
- [ ] 5.4 `infrastructure/terraform/modules/rds/main.tf` - Increase storage multiplier (deferred - 2x already configured)
- [x] 5.5 `infrastructure/terraform/modules/elasticache/main.tf` - Custom parameter group (`maxmemory-policy`, `timeout`, etc.)

### ECR & Images
- [x] 5.6 `infrastructure/terraform/modules/ecr/main.tf` - KMS encryption option added
- [ ] 5.7 `infrastructure/terraform/modules/ecr/main.tf` - Simplify lifecycle rules (deferred - rules working)

### ECS & Containers
- [ ] 5.8 `infrastructure/terraform/modules/ecs/main.tf` - wget → curl health check (deferred - wget works)
- [x] 5.9 `infrastructure/terraform/modules/ecs/main.tf` - Scope RDS IAM policy to specific resource

### Lambda
- [ ] 5.10 `infrastructure/terraform/modules/rds/main.tf` - Document pip compatibility (deferred)

**Deployed:** 2026-01-19 via GitHub Actions Terraform workflow

---

## Phase 6: Final Cleanup & Documentation (9 fixes)

### DPP Worker
- [ ] 6.1 `apps/dpp-worker/src/url-parser.ts` - Character class validation
- [ ] 6.2 Edge caching headers optimization

### Code Cleanup
- [ ] 6.3 Remove outdated TODO/comment markers
- [ ] 6.4 Create Forensic Guard validation utilities
- [ ] 6.5 Audit JSDoc comments

### Testing
- [ ] 6.6 `packages/walt-id/src/client.test.ts` - Error case tests
- [ ] 6.7 E2E test scaffolding

### Documentation
- [ ] 6.8 Document multi-tenant security model
- [ ] 6.9 Document DID key rotation strategy

**Deploy:** Full test suite + final staging verification

---

## Totals

| Phase | Fixes |
|-------|-------|
| Phase 1 | 7 |
| Phase 2 | 10 |
| Phase 3 | 10 |
| Phase 4 | 9 |
| Phase 5 | 10 |
| Phase 6 | 9 |
| **Total** | **55** |

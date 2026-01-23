# Clerk to ZITADEL Migration Design

**Status:** Draft
**Created:** 2026-01-23
**Decision:** Replace Clerk with ZITADEL Cloud (EU) for authentication

---

## 1. Context & Decision

### Why Migrate

- **Data sovereignty:** Clerk is US-based; ZITADEL is Swiss-based with EU hosting
- **Political/legal concerns:** Reduce dependency on US cloud providers for EU-focused compliance platform
- **Feature parity:** ZITADEL supports all required features (organizations, multi-tenancy, per-org SSO)

### Decision

**Clean cutover to ZITADEL Cloud (EU region)** - no abstraction layer, no Clerk fallback.

- No production users exist - clean migration possible
- Remove all Clerk code and dependencies on completion
- Delete Clerk account after successful migration

---

## 2. Concept Mapping

| EuroComply Concept | Clerk | ZITADEL |
|-------------------|-------|---------|
| Tenant | Organization | Organization |
| User identity | `clerk_user_id` | `zitadel_user_id` |
| Org identity | `org_abc123` | Organization ID |
| Tenant metadata in JWT | `org_metadata` (custom claim) | Custom claims via Actions |
| Org lifecycle events | Webhooks (Svix) | Actions v2 (webhooks) |
| Per-org SSO | Enterprise feature | Built-in per organization |
| Custom login domains | Not used | Deferred to future phase |

---

## 3. JWT Token Structure

ZITADEL uses standard OIDC tokens. Custom claims added via ZITADEL Actions:

```json
{
  "sub": "user_123",
  "urn:zitadel:iam:org:id": "org_456",
  "urn:eurocomply:schema_name": "tenant_org_456",
  "urn:eurocomply:tier": "starter",
  "urn:eurocomply:cell_id": "cell_1"
}
```

Tenant middleware extracts `urn:eurocomply:schema_name` for schema routing.

---

## 4. Organization Lifecycle

### Webhook Flow (via ZITADEL Actions v2)

```
ZITADEL Event (org.created)
        |
        v
    Action Target
        |
        v
POST https://api.eurocomply.eu/webhooks/zitadel
        |
        v
    Handler provisions tenant schema
```

### Event Mapping

| ZITADEL Event | Handler | Result |
|---------------|---------|--------|
| `org.created` | `handleOrganizationCreated` | Create Organization record, provision schema |
| `org.removed` | `handleOrganizationDeleted` | Drop schema, delete record |

### Resilience Strategy

ZITADEL Actions v2 does not retry failed webhooks. Mitigations:

1. **Idempotent handlers** - Safe to retry manually
2. **Retry endpoint** - `POST /api/v1/admin/organizations/:id/provision`
3. **Reconciliation job** - Hourly comparison of ZITADEL orgs vs database, provisions any missing

---

## 5. Files to Change

### Code Files

| File | Action |
|------|--------|
| `apps/api/package.json` | Replace `@clerk/backend` with ZITADEL SDK |
| `apps/api/src/utils/jwt.ts` | Rewrite for ZITADEL OIDC verification |
| `apps/api/src/middleware/tenant.ts` | Update claim extraction |
| `apps/api/src/webhooks/clerk.ts` | Rewrite → `zitadel.ts` |
| `apps/api/src/middleware/webhook.ts` | ZITADEL signature verification |
| `apps/api/src/routes/webhooks.ts` | Adapt routes |
| `packages/database/src/entities/Organization.ts` | Rename `clerkOrgId` → `zitadelOrgId` |
| `.env.example` | Update env vars |

### Test Files (~5 files)

- `apps/api/src/webhooks/clerk.test.ts` → `zitadel.test.ts`
- `apps/api/src/utils/jwt.test.ts`
- `apps/api/src/middleware/tenant.test.ts`
- `apps/api/src/middleware/webhook.test.ts`
- `apps/api/src/routes/webhooks.test.ts`

### Documentation (11 files)

| File | Effort |
|------|--------|
| `docs/plans/01-architecture.md` | Heavy rewrite |
| `docs/plans/02-data-model.md` | Moderate |
| `docs/plans/03-security.md` | Heavy rewrite |
| `docs/API_TESTING.md` | Heavy rewrite |
| `docs/TESTING.md` | Rewrite |
| `docs/plans/10-integrations.md` | Minor |
| `docs/plans/11-infrastructure.md` | Minor |
| `docs/plans/00-business-model.md` | Minor |
| `README.md` | Minor |

### Scripts/Config

| File | Action |
|------|--------|
| `apps/api/scripts/test-clerk-webhook.ts` | Delete or rewrite |
| `scripts/e2e-smoke-test.sh` | Update |
| `scripts/get-e2e-token.sh` | Update |
| `.github/workflows/ci.yml` | Update env vars |
| `infrastructure/terraform/*/variables.tf` | Update secret names |

### Files to Delete

| File | Reason |
|------|--------|
| `implementationplans/2026-01-21-phase1-foundation.md` | Clerk-specific, historical |
| `implementationplans/2026-01-22-phase2-tenant-provisioning.md` | Clerk-specific, historical |

---

## 6. Implementation Phases

### Phase 1: ZITADEL Setup & Core Integration (Week 1)

- [ ] Create ZITADEL Cloud account (EU region)
- [ ] Create project and OIDC application
- [ ] Configure Actions v2 target for webhooks
- [ ] Create Action for custom claims injection
- [ ] Replace `@clerk/backend` with ZITADEL SDK
- [ ] Rewrite `jwt.ts` for OIDC verification
- [ ] Rewrite webhook handler (`clerk.ts` → `zitadel.ts`)
- [ ] Update tenant middleware for new token structure

### Phase 2: Entity & Test Updates (Week 2)

- [ ] Rename `clerkOrgId` → `zitadelOrgId` (entity + migration)
- [ ] Update all test mocks for new token/event structure
- [ ] E2E test with real ZITADEL (ngrok + webhook delivery)
- [ ] Update env vars (`.env.example`, CI secrets)
- [ ] Implement reconciliation job

### Phase 3: Documentation & Cleanup (Week 3)

- [ ] Update `docs/plans/01-architecture.md`
- [ ] Update `docs/plans/03-security.md`
- [ ] Update `docs/API_TESTING.md`
- [ ] Update `docs/TESTING.md`
- [ ] Update remaining docs (minor references)
- [ ] Delete old Clerk implementation plans
- [ ] Final grep for any remaining "clerk" references
- [ ] Delete Clerk account

---

## 7. Testing Strategy

### Test Environments

| Environment | ZITADEL Setup |
|-------------|---------------|
| **Local** | ngrok + ZITADEL Cloud dev project |
| **CI** | ZITADEL Cloud dev project + test org creation via API |
| **Staging** | Dedicated ZITADEL project |
| **Production** | Dedicated ZITADEL project |

### Test Types

| Type | Approach |
|------|----------|
| Unit tests | Mock ZITADEL SDK responses |
| Integration tests | ZITADEL test/dev environment |
| E2E tests | Real ZITADEL Cloud, real webhook delivery via ngrok |

---

## 8. Error Handling

| Scenario | Handling |
|----------|----------|
| Webhook signature invalid | 401 Unauthorized |
| Org already exists | Idempotent success |
| Schema provisioning fails | Mark FAILED, allow retry via admin endpoint |
| Token verification fails | 401 + null tenant context |
| ZITADEL metadata update fails | Best-effort, log warning |
| Webhook not delivered | Reconciliation job catches within 1 hour |

---

## 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| ZITADEL Cloud outage | Low | High | Accept - same risk as any managed auth |
| JWT claim structure issues | Medium | Medium | Prototype token flow first |
| Actions v2 beta stability | Medium | Low | Core stable; retry gap covered by reconciliation |
| Migration takes longer | Medium | Low | No users, no deadline |
| Missing feature later | Low | Medium | Open-source - can self-host/extend |

---

## 10. Go/No-Go Criteria

Before deploying to production:

- [ ] E2E flow works: login → JWT has tenant claims → API accepts token
- [ ] Webhook flow works: create org → schema provisioned → org READY
- [ ] Reconciliation job tested
- [ ] All tests passing
- [ ] Documentation updated
- [ ] Clerk references removed (grep confirms zero matches)

---

## 11. Deferred Features

| Feature | Reason | When |
|---------|--------|------|
| Custom login domains per org | Not needed for launch | Post-launch, customer request |
| Per-org SSO configuration UI | Not needed for launch | When enterprise customers onboard |

---

## Related Documents

- [Architecture](./01-architecture.md) - Will be updated
- [Security](./03-security.md) - Will be updated
- [ZITADEL Organizations Docs](https://zitadel.com/docs/guides/manage/console/organizations)
- [ZITADEL Actions v2](https://zitadel.com/docs/concepts/features/actions_v2)
- [ZITADEL B2B Scenarios](https://zitadel.com/docs/guides/solution-scenarios/b2b)

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-23 | Initial design |

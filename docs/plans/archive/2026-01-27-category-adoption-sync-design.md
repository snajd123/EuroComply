# Category Adoption Sync Design

**Status:** Implemented (Phases 1-3)
**Created:** 2026-01-27
**Implemented:** 2026-01-27
**Author:** Brainstorm Session

---

## 1. Overview

This design implements the missing functionality for category adoption:
1. **Auto-create TenantCategory on adoption** - Instant ROI for tenants
2. **Link mode management** - LIVE/FROZEN/DETACHED transitions
3. **Sync logic** - Propagate system category updates to tenants

### Related Documents
- [Taxonomy Engine Design](./2026-01-23-taxonomy-engine-design.md) - Parent design document

---

## 2. Current State

**Entities exist but are underutilized:**
- `Category` (public schema) - Has `version` field (defaults to 1)
- `TenantCategory` - Has `systemCategoryId`, `linkMode`, `frozenAtVersion`
- `CategoryAdoption` - Has `mode`, `adoptedVersion`, `frozenAtVersion`, `updateAvailable`

**Current adoption flow (incomplete):**
```
POST /adoption/:categoryId
  → CategoryAdoption created (mode=LIVE)
  → Does NOT create TenantCategory
  → Does NOT record adoptedVersion
```

---

## 3. Design Decisions

### 3.1 Tenant-Local Path Strategy: Hybrid Auto-Prefix

When adopting a system category, the tenant-local path uses a `system.` prefix:

| System Category | System Path | Tenant Local Path |
|-----------------|-------------|-------------------|
| Electronics | `electronics` | `system.electronics` |
| Laptops | `electronics.laptops` | `system.laptops` |
| T-Shirts | `apparel.tops.tshirts` | `system.t_shirts` |

**Benefits:**
- **Namespace isolation**: Eliminates collisions with tenant's custom categories
- **Visual distinction**: UI can show "Platform Managed" vs "Internal" categories
- **Flat hierarchy**: All adopted categories are ROOT (depth=0) in tenant schema

### 3.2 Bulk Adoption: Selective Only

- Adopting a branch does NOT auto-adopt children
- Keeps tenant data clean and intentional
- Future: "Sync Children" button if needed

### 3.3 Detachment History

When a tenant detaches (DETACHED mode):
- Keep the `CategoryAdoption` record (marked DETACHED)
- Provides audit trail of where category originated
- `TenantCategory.systemCategoryId` cleared (becomes custom category)

---

## 4. Link Mode Transitions

### 4.1 Allowed Transitions

| From | To | Allowed | Behavior |
|------|----|---------|----------|
| LIVE | FROZEN | ✓ | Capture `frozenAtVersion` = system's current version |
| LIVE | DETACHED | ✓ | Clear `systemCategoryId` on TenantCategory, keep adoption record |
| FROZEN | LIVE | ✓ | Clear `frozenAtVersion`, sync TenantCategory to latest |
| FROZEN | DETACHED | ✓ | Clear `systemCategoryId` on TenantCategory, keep adoption record |
| DETACHED | * | ✗ | Not allowed - detachment is permanent |

### 4.2 Mode Behaviors

| Mode | System Updates | Notifications | Use Case |
|------|----------------|---------------|----------|
| **LIVE** | Auto-applied to TenantCategory | N/A | "Keep me current with regulations" |
| **FROZEN** | Ignored (snapshot at version) | `updateAvailable = true` | "I want control over when to update" |
| **DETACHED** | Ignored permanently | None | "I've diverged, don't notify me" |

---

## 5. Adoption Flow (Enhanced)

### 5.1 POST /adoption/:categoryId

```
1. Validate system category exists in public.category
2. Check not already adopted (409 if exists)
3. Create CategoryAdoption:
   - systemCategoryId = categoryId
   - mode = LIVE
   - adoptedAt = now()
   - adoptedVersion = systemCategory.version
4. Create TenantCategory:
   - name = systemCategory.name
   - description = systemCategory.description
   - path = "system." + slugify(systemCategory.name)
   - targetType = systemCategory.targetType
   - type = systemCategory.type
   - depth = 0 (ROOT in tenant hierarchy)
   - systemCategoryId = categoryId
   - linkMode = LIVE
5. Link CategoryAdoption.localCategory → TenantCategory
6. Return success with both records
```

### 5.2 Slugify Function

```typescript
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')  // Replace non-alphanumeric with underscore
    .replace(/^_|_$/g, '')         // Trim leading/trailing underscores
    .substring(0, 50);             // Limit length for LTREE compatibility
}
```

---

## 6. Sync Logic

### 6.1 Trigger: System Category Update

When platform admin updates a system category:

```typescript
// In admin category update handler
systemCategory.version += 1;
await em.flush();

// Emit event for async processing
await eventBus.emit('system-category.updated', {
  categoryId: systemCategory.id,
  version: systemCategory.version,
  changes: { name, description }
});
```

### 6.2 Async Worker: Process Tenant Updates

```typescript
// Background worker for system-category.updated event
async function processCategoryUpdate(event: SystemCategoryUpdatedEvent) {
  const { categoryId, version, changes } = event;

  // Get all organizations with adoptions of this category
  const adoptions = await findAdoptionsAcrossAllTenants(categoryId);

  for (const { orgId, schema } of adoptions) {
    await processAdoptionForTenant(schema, categoryId, version, changes);
  }
}

async function processAdoptionForTenant(
  schema: string,
  categoryId: string,
  version: number,
  changes: CategoryChanges
) {
  const em = orm.em.fork({ schema });

  await em.transactional(async (txEm) => {
    await txEm.execute(`SET search_path TO "${schema}", public`);

    const adoption = await txEm.findOne(CategoryAdoption, {
      systemCategoryId: categoryId
    });

    if (!adoption) return;

    if (adoption.mode === LinkMode.LIVE) {
      // Auto-update TenantCategory
      const tenantCat = await txEm.findOne(TenantCategory, {
        systemCategoryId: categoryId
      });
      if (tenantCat) {
        tenantCat.name = changes.name ?? tenantCat.name;
        tenantCat.description = changes.description ?? tenantCat.description;
      }
      adoption.adoptedVersion = version;
    } else if (adoption.mode === LinkMode.FROZEN) {
      // Flag for manual review
      adoption.updateAvailable = true;
    }
    // DETACHED: Do nothing

    await txEm.flush();
  });
}
```

### 6.3 Cross-Tenant Query for Adoptions

```sql
-- Find all tenants who adopted a specific system category
-- This requires querying across tenant schemas
SELECT
  o.id as org_id,
  o.schema_name as schema
FROM public.organizations o
WHERE EXISTS (
  SELECT 1
  FROM information_schema.tables t
  WHERE t.table_schema = o.schema_name
  AND t.table_name = 'category_adoption'
);

-- Then for each schema, query the adoption
-- (Done in application code with proper SET search_path)
```

---

## 7. API Endpoints

### 7.1 POST /categories/adoption/:categoryId

**Purpose:** Adopt a system category (creates TenantCategory)

**Request:** None (categoryId in path)

**Response (201):**
```json
{
  "data": {
    "adoption": {
      "id": "uuid",
      "systemCategoryId": "uuid",
      "mode": "LIVE",
      "adoptedAt": "2026-01-27T10:00:00Z",
      "adoptedVersion": 1
    },
    "tenantCategory": {
      "id": "uuid",
      "name": "T-Shirts",
      "path": "system.t_shirts",
      "targetType": "PRODUCT",
      "systemCategoryId": "uuid",
      "linkMode": "LIVE"
    }
  }
}
```

### 7.2 PATCH /categories/adoption/:categoryId

**Purpose:** Change link mode

**Request:**
```json
{
  "mode": "FROZEN" | "LIVE" | "DETACHED"
}
```

**Response (200):**
```json
{
  "data": {
    "id": "uuid",
    "systemCategoryId": "uuid",
    "mode": "FROZEN",
    "frozenAtVersion": 3,
    "updateAvailable": false
  }
}
```

**Errors:**
- 400: Invalid transition (e.g., DETACHED → LIVE)
- 404: Adoption not found

### 7.3 POST /categories/adoption/:categoryId/sync

**Purpose:** Manual sync for FROZEN mode (or force sync for LIVE)

**Query Parameters:**
- `dryRun=true`: Preview changes without committing

**Response (200):**
```json
{
  "data": {
    "synced": true,
    "dryRun": false,
    "previousVersion": 2,
    "currentVersion": 3,
    "changes": {
      "name": { "from": "T-Shirts", "to": "T-Shirts & Tops" },
      "description": { "from": null, "to": "Combined category" }
    }
  }
}
```

**Dry Run Response (200):**
```json
{
  "data": {
    "synced": false,
    "dryRun": true,
    "previousVersion": 2,
    "currentVersion": 3,
    "changes": {
      "name": { "from": "T-Shirts", "to": "T-Shirts & Tops" }
    }
  }
}
```

### 7.4 DELETE /categories/adoption/:categoryId

**Purpose:** Remove adoption (existing endpoint - no changes)

---

## 8. Database Changes

### 8.1 No Schema Changes Required

All necessary fields already exist:
- `CategoryAdoption.adoptedVersion` - exists
- `CategoryAdoption.frozenAtVersion` - exists
- `CategoryAdoption.updateAvailable` - exists
- `CategoryAdoption.localCategory` - exists (FK to TenantCategory)
- `TenantCategory.systemCategoryId` - exists
- `TenantCategory.linkMode` - exists
- `TenantCategory.frozenAtVersion` - exists
- `Category.version` - exists

### 8.2 Index Recommendation

```sql
-- For efficient cross-tenant sync queries
CREATE INDEX idx_category_adoption_system_id
ON category_adoption(system_category_id);
```

---

## 9. Implementation Tasks

### Phase 1: Enhanced Adoption (Auto-Create TenantCategory)
1. Update `POST /adoption/:categoryId` to create TenantCategory
2. Implement `slugify()` function with `system.` prefix
3. Record `adoptedVersion` on adoption
4. Link `CategoryAdoption.localCategory` to new TenantCategory
5. Add tests for adoption flow

### Phase 2: Link Mode Management
1. Create `PATCH /adoption/:categoryId` endpoint
2. Implement mode transition validation
3. Handle DETACHED: clear `systemCategoryId` on TenantCategory
4. Handle FROZEN: capture `frozenAtVersion`
5. Handle FROZEN → LIVE: sync to latest
6. Add tests for all transitions

### Phase 3: Manual Sync Endpoint
1. Create `POST /adoption/:categoryId/sync` endpoint
2. Implement dry run mode
3. Calculate and return diff
4. Apply changes when not dry run
5. Add tests

### Phase 4: Async Sync Worker
1. Create event handler for `system-category.updated`
2. Implement cross-tenant adoption query
3. Implement per-tenant atomic sync
4. Add integration tests
5. Add to Postman collection

---

## 10. Testing Strategy

### Unit Tests
- `slugify()` function edge cases
- Mode transition validation
- Diff calculation

### Integration Tests
- Full adoption flow (CategoryAdoption + TenantCategory created)
- Mode changes with correct side effects
- Sync endpoint (dry run and commit)
- Cross-schema queries

### E2E Tests (Postman)
- Adopt → Change Mode → Sync flow
- Concurrent adoptions from multiple tenants

---

## Implementation Notes

**Completed:** 2026-01-27

**Commits:**
- `feat(database): add slugify utility for tenant category paths`
- `feat(api): auto-create TenantCategory on category adoption`
- `feat(api): add PATCH endpoint for category adoption link mode changes`
- `feat(api): add POST /sync endpoint for manual category sync`
- `docs(postman): add link mode and sync endpoints to tenant-api collection`

**Deferred:**
- Phase 4: Async worker for propagating system category updates (requires event bus infrastructure)

---

## Document Control

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-01-27 | Initial design from brainstorm session |
| 1.1 | 2026-01-27 | Marked as implemented (Phases 1-3) |

# User Management Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** USER_MANAGEMENT.md + clarification session

---

## 1. Overview

EuroComply implements workspace-based access control with cryptographic chain of custody. Every product change is attributed to a specific user and signed with their DID.

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **Workspace isolation** | Users have separate authority per workspace |
| **Cryptographic attribution** | Every change signed with user's DID |
| **Reviewer accountability** | IN_REVIEW claim system prevents duplicate reviews |
| **Checkout locking** | Prevents concurrent edits within workspace |

---

## 2. User Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER TYPES                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INTERNAL USERS                                                             │
│  ─────────────                                                               │
│  • Full organization members                                                │
│  • Auth: Clerk (email/password or SSO)                                      │
│  • DID: Managed via walt.id Custodian                                       │
│  • Access: Based on workspace authority                                     │
│                                                                              │
│  GUEST PARTNERS                                                             │
│  ──────────────                                                              │
│  • External collaborators with scoped access                                │
│  • Auth: Magic link via Clerk                                               │
│  • DID: Managed via walt.id Custodian                                       │
│  • Access: Filtered by product tags/families                                │
│  • Lifecycle: PENDING → ACTIVE → EXPIRED (simplified from 5 states)        │
│                                                                              │
│  TRANSACTIONAL PARTNERS                                                     │
│  ─────────────────────                                                       │
│  • One-time access for specific task                                        │
│  • Auth: Single-use magic link                                              │
│  • DID: Generated on access, retained for verification                      │
│  • Access: Specific products only                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Type Comparison

| Aspect | Internal | Guest Partner | Transactional |
|--------|----------|---------------|---------------|
| **Auth** | Clerk (email/SSO) | Magic link | Magic link |
| **Duration** | Permanent | Up to 365 days | Single session |
| **DID** | walt.id managed | walt.id managed | walt.id (retained) |
| **Workspace access** | Per authority | Filtered | Single workspace |
| **Can invite others** | If Admin | No | No |

---

## 3. Authority Levels

Four authority levels per workspace:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHORITY HIERARCHY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MANAGER                                                                    │
│  │ • Self-sign product versions (direct release)                           │
│  │ • Approve changes from Contributors                                     │
│  │ • Issue DPPs (Compliance workspace only)                                │
│  │ • Full workspace control                                                │
│  │                                                                          │
│  EDITOR                                                                     │
│  │ • Self-sign product versions (direct release)                           │
│  │ • Approve changes from Contributors                                     │
│  │ • Cannot issue DPPs                                                      │
│  │                                                                          │
│  CONTRIBUTOR                                                                │
│  │ • Edit products and save drafts                                         │
│  │ • Submit for review (requires approval)                                 │
│  │ • Cannot self-approve                                                   │
│  │                                                                          │
│  VIEWER                                                                     │
│    • Read-only access                                                       │
│    • Cannot edit or save                                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Authority Matrix

**Design & Marketing Workspaces:**

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View data | ✓ | ✓ | ✓ | ✓ |
| Edit (draft) | - | ✓ | ✓ | ✓ |
| Submit for review | - | ✓ | - | - |
| Claim for review | - | - | ✓ | ✓ |
| Approve/Reject | - | - | ✓ | ✓ |
| Direct release | - | - | ✓ | ✓ |

**Operations Workspace:**

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View data | ✓ | ✓ | ✓ | ✓ |
| Create batch (PENDING) | - | ✓ | ✓ | ✓ |
| Edit PENDING | - | ✓ (own) | ✓ | ✓ |
| Commit (lock) | - | - | ✓ | ✓ |
| Update status | - | - | ✓ | ✓ |

**Compliance Workspace:**

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View DPPs | ✓ | ✓ | ✓ | ✓ |
| Request attestations | - | - | ✓ | ✓ |
| Issue DPPs | - | - | - | ✓ |
| Revoke DPPs | - | - | - | ✓ |

---

## 4. Workspace Access Model

Users have **separate authority per workspace**:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Example: Maria Garcia                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   DESIGN    │  │ OPERATIONS  │  │  MARKETING  │  │ COMPLIANCE  │        │
│  │   ------    │  │   ------    │  │   ------    │  │   ------    │        │
│  │  No Access  │  │  No Access  │  │   EDITOR    │  │   VIEWER    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  Maria can:                                                                 │
│  • Self-publish marketing content                                          │
│  • View DPPs (not issue them)                                              │
│  • NOT access Design or Operations                                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Admin Access

Admin access is **separate from workspace authority**:

| Access Type | Controls |
|-------------|----------|
| **Workspace** | What user can do in each workspace |
| **Admin** | User management, billing, API keys, org settings |

A user can be VIEWER in all workspaces but still be an Admin.

### Role Templates

Pre-defined templates for common roles:

| Template | Design | Operations | Marketing | Compliance | Admin |
|----------|:------:|:----------:|:---------:|:----------:|:-----:|
| **Full Admin** | MANAGER | MANAGER | MANAGER | MANAGER | ✓ |
| **Product Designer** | EDITOR | VIEWER | - | - | - |
| **Operations Manager** | VIEWER | MANAGER | - | - | - |
| **Marketing Manager** | - | - | MANAGER | VIEWER | - |
| **Compliance Officer** | VIEWER | VIEWER | VIEWER | MANAGER | - |
| **External Contributor** | - | - | CONTRIBUTOR | - | - |

---

## 5. Authentication (Clerk)

### Integration with EuroComply

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CLERK INTEGRATION                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  USER LOGIN                                                                 │
│  ──────────                                                                  │
│  1. User visits app.eurocomply.eu                                           │
│  2. Clerk SDK redirects to hosted login                                     │
│  3. User authenticates (email/password, SSO, magic link)                    │
│  4. Clerk issues JWT with clerk_user_id                                     │
│  5. EuroComply looks up internal User by clerk_user_id                      │
│  6. Session established with workspace access loaded                        │
│                                                                              │
│  FIRST-TIME USER                                                            │
│  ───────────────                                                             │
│  1. Admin invites user via EuroComply dashboard                             │
│  2. Clerk invitation email sent                                             │
│  3. User clicks link, creates Clerk account                                 │
│  4. EuroComply creates User record linked to clerk_user_id                  │
│  5. Workspace access applied per invitation config                          │
│                                                                              │
│  GUEST PARTNER                                                              │
│  ─────────────                                                               │
│  1. Admin creates guest invitation                                          │
│  2. Magic link sent (Clerk passwordless)                                    │
│  3. Guest clicks link, session starts                                       │
│  4. Access filtered by product tags/families                                │
│  5. Session expires per configured duration                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### SSO/SAML (Enterprise Tier)

| Step | Action |
|------|--------|
| 1 | Organization configures IdP in Clerk dashboard |
| 2 | Users from that org redirected to their IdP |
| 3 | SAML assertion validated by Clerk |
| 4 | User provisioned/matched in EuroComply |

---

## 6. Signing (walt.id)

### DID Generation and Storage

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SIGNING INFRASTRUCTURE                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  FIRST SIGNATURE                                                            │
│  ───────────────                                                             │
│  1. User attempts action requiring signature                                │
│  2. Check: Does user have DID?                                              │
│     └── No: Generate Ed25519 keypair via walt.id                            │
│     └── Derive did:key from public key                                      │
│     └── Store in User: walt_id_key_id, did                                  │
│  3. Sign payload using walt.id Custodian API                                │
│  4. Return signed result                                                    │
│                                                                              │
│  SUBSEQUENT SIGNATURES                                                      │
│  ─────────────────────                                                       │
│  1. Look up user's walt_id_key_id                                           │
│  2. Sign via walt.id Custodian API                                          │
│  3. Return signed result                                                    │
│                                                                              │
│  KEY ROTATION                                                               │
│  ────────────                                                                │
│  1. User or Admin requests rotation                                         │
│  2. Generate new keypair                                                    │
│  3. Record in UserDIDHistory: old DID validTo = now()                       │
│  4. Update User.did to new DID                                              │
│  5. Historical signatures verified against UserDIDHistory                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Wallet Abstraction

Future-proof for EUDI wallet integration:

```typescript
interface WalletProvider {
  getDid(): Promise<string>;
  sign(payload: SignablePayload): Promise<SignedResult>;
  storeCredential(vc: VerifiableCredential): Promise<void>;
  getCredentials(filter?: CredentialFilter): Promise<VerifiableCredential[]>;
}

// Factory creates appropriate provider
const wallet = await WalletFactory.getProvider(user.walletType);
// Same code works for MANAGED, EUDI, or EXTERNAL wallet
```

| Wallet Type | Status | Use Case |
|-------------|--------|----------|
| **MANAGED** | Current | Default, server-side signing via walt.id |
| **EUDI** | Future | EU Digital Identity Wallet integration |
| **EXTERNAL** | Future | Self-sovereign, user-controlled keys |

---

## 7. Version Control Workflow

### Contributor Workflow (Requires Approval)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CONTRIBUTOR WORKFLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Contributor clicks "Edit" → DRAFT created                               │
│                                                                              │
│  2. Contributor makes changes                                               │
│                                                                              │
│  3. Contributor clicks "Submit for Review"                                  │
│     └── Status: DRAFT → PENDING_REVIEW                                      │
│     └── Notification sent to EDITOR/MANAGER users                           │
│                                                                              │
│  4. Reviewer claims review                                                  │
│     └── Status: PENDING_REVIEW → IN_REVIEW                                  │
│     └── claimedById = reviewer's ID                                         │
│     └── Other reviewers see "Being reviewed by X"                           │
│                                                                              │
│  5a. Reviewer approves                                                      │
│      └── Status: IN_REVIEW → RELEASED                                       │
│      └── Signed with reviewer's DID                                         │
│                                                                              │
│  5b. Reviewer rejects                                                       │
│      └── Status: IN_REVIEW → REJECTED                                       │
│      └── Author can revise and resubmit                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Editor/Manager Workflow (Direct Release)

```
1. Editor clicks "Edit" → DRAFT created
2. Editor makes changes
3. Editor clicks "Release"
   └── Status: DRAFT → RELEASED
   └── Signed with editor's DID
```

### Checkout Locking

| Rule | Implementation |
|------|----------------|
| **Per-workspace** | Design and Marketing locks are independent |
| **Timeout** | 72 hours (configurable per org) |
| **Warning** | Email at 48 hours before expiry |
| **Draft preserved** | Timeout releases lock, keeps draft |
| **Admin override** | Can force-release if user unavailable |

---

## 8. Operations Workflow (Four-Eyes)

Operations uses PENDING → COMMITTED workflow:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BATCH CREATION WORKFLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CONTRIBUTOR creates batch:                                                 │
│  1. Select product + design version                                         │
│  2. Enter quantity, material lots, production line                          │
│  3. Status: PENDING (editable)                                              │
│  4. Must wait for EDITOR/MANAGER to commit                                  │
│                                                                              │
│  EDITOR/MANAGER creates batch:                                              │
│  1. Same as above, creates PENDING                                          │
│  2. Can immediately commit OR let auto-commit handle it                     │
│                                                                              │
│  COMMIT (by EDITOR/MANAGER):                                                │
│  1. Validates product is ACTIVE (not archived)                              │
│  2. Validates design version is RELEASED                                    │
│  3. Validates material lot availability                                     │
│  4. Deducts inventory (transactional)                                       │
│  5. Status: PENDING → COMMITTED                                             │
│  6. Record becomes IMMUTABLE                                                │
│                                                                              │
│  After COMMITTED:                                                           │
│  • Only status can change (PLANNED → IN_PRODUCTION → COMPLETED)            │
│  • Corrections create new records, not edits                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Product Archiving

Archiving happens at the **product level**, not version level:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PRODUCT ARCHIVING                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product States:                                                            │
│  • ACTIVE   - Normal product, can create batches/DPPs                       │
│  • ARCHIVED - Discontinued (soft delete)                                    │
│                                                                              │
│  When product is ARCHIVED:                                                  │
│  • All versions remain (for audit/history)                                  │
│  • Cannot create new batches referencing it                                 │
│  • Cannot issue new DPPs                                                    │
│  • Existing DPPs remain valid                                               │
│  • Can be restored to ACTIVE if needed                                      │
│                                                                              │
│  VERSION STATES (unchanged by archiving):                                   │
│  • DRAFT, PENDING_REVIEW, IN_REVIEW, REJECTED, RELEASED                    │
│  • Once RELEASED, a version stays RELEASED forever                          │
│  • No automatic archiving of versions                                       │
│                                                                              │
│  WHO CAN ARCHIVE:                                                           │
│  • MANAGER in any workspace with access to the product                     │
│  • Admin users                                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. Data Model

### Core Tables

```sql
-- User with Clerk + walt.id integration
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    -- Clerk integration
    clerk_user_id VARCHAR(255) UNIQUE,

    -- walt.id signing
    walt_id_key_id VARCHAR(255),
    did VARCHAR(255),

    -- Profile
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    user_type VARCHAR(30) NOT NULL DEFAULT 'INTERNAL',
    -- INTERNAL, GUEST_PARTNER, TRANSACTIONAL_PARTNER

    -- Admin access (separate from workspace)
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,

    -- Guest restrictions
    allowed_product_tags TEXT[],
    allowed_family_ids UUID[],

    -- Metadata
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(email, organization_id)
);

-- Workspace access per user
CREATE TABLE workspace_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    workspace VARCHAR(20) NOT NULL,
    -- DESIGN, OPERATIONS, MARKETING, COMPLIANCE
    authority VARCHAR(20) NOT NULL,
    -- VIEWER, CONTRIBUTOR, EDITOR, MANAGER

    UNIQUE(user_id, workspace)
);

-- DID history for key rotation
CREATE TABLE user_did_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    did VARCHAR(255) NOT NULL,
    walt_id_key_id VARCHAR(255),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_to TIMESTAMPTZ,
    rotation_reason VARCHAR(50),

    INDEX idx_user_did_history_user (user_id),
    INDEX idx_user_did_history_did (did)
);

-- Guest partner tracking (simplified lifecycle)
CREATE TABLE guest_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    organization_id UUID NOT NULL REFERENCES organizations(id),

    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    -- PENDING, ACTIVE, EXPIRED (simplified from 5 states)

    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    first_login_at TIMESTAMPTZ,

    INDEX idx_guest_invitations_status (status)
);
```

### Version Tables (From Architecture Design)

See `2026-01-15-architecture-design.md` Section 8 for full schema including:
- `design_versions` with claim system (claimedById, claimedAt)
- `marketing_versions` with basedOnDesignVersionId
- `batches` with PENDING → COMMITTED workflow

---

## 11. Security

### Access Control Enforcement

```typescript
// Middleware checks on every request
async function checkAccess(
  userId: string,
  workspace: Workspace,
  requiredAuthority: Authority
): Promise<boolean> {
  const access = await prisma.workspaceAccess.findUnique({
    where: { userId_workspace: { userId, workspace } }
  });

  if (!access) return false;

  const levels = { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, MANAGER: 4 };
  return levels[access.authority] >= levels[requiredAuthority];
}
```

### Privilege Escalation Detection

Any elevation to MANAGER triggers:
1. Justification required (min 10 chars)
2. Audit log entry
3. Email notification to ALL other admins

This prevents collusion (two admins elevating each other).

### Guest Product Filtering

```typescript
// All queries for guest users are filtered
async function getProducts(userId: string): Promise<Product[]> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (user.userType === 'GUEST_PARTNER') {
    return prisma.product.findMany({
      where: {
        OR: [
          { tags: { hasSome: user.allowedProductTags } },
          { familyId: { in: user.allowedFamilyIds } }
        ]
      }
    });
  }

  return prisma.product.findMany();
}
```

---

## 12. Simplifications from Original Design

| Original Feature | Simplification | Rationale |
|------------------|----------------|-----------|
| 5-state guest lifecycle | 3 states (PENDING → ACTIVE → EXPIRED) | Fewer states to manage |
| Weekly admin review emails | Dashboard "Admin Activity" section | Avoid email infrastructure |
| Cool-off period for self-grants | Audit + notify only | Simpler, audit trail sufficient |
| reportsTo hierarchy routing | Any EDITOR/MANAGER can approve | Start simple, add hierarchy later |
| Auto-commit timer (1hr) | Require explicit commit | Four-eyes principle is the point |

---

## 13. Cross-Workspace Notifications

When upstream workspaces update, downstream workspaces are notified:

| Event | Notified Workspace | Message |
|-------|-------------------|---------|
| Design version released | Marketing | "Design updated - review your content" |
| Design version released | Operations | "New Design available for next batch" |
| Design version released | Compliance | "Review DPP for re-issuance" |
| Marketing version released | Compliance | "Review DPP for re-issuance" |

---

## 14. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture Design](./2026-01-15-architecture-design.md) | System architecture, version states |
| [EUDI Wallet Integration](./2026-01-15-eudi-wallet-integration-design.md) | Adding DPPs to EUDI wallets |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft from USER_MANAGEMENT.md review |
| 0.2 | 2026-01-15 | Simplified version states (no ACTIVE/ARCHIVED on versions), added product-level archiving |

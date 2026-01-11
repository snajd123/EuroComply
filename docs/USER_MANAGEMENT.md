# User Management, Roles & Workflow

## Overview

EuroComply implements a comprehensive user management system with role-based access control, version-controlled product editing, and cryptographic chain of custody. Every product change is attributed to a specific user and signed with their personal DID.

---

## 1. User Ecosystem

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           USER ECOSYSTEM                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ INTERNAL USERS                                                          ││
│  │ Full organization members with dashboard access                         ││
│  │                                                                          ││
│  │ • Identity: Managed DID (walt.id Custodian)                             ││
│  │ • Access: Full dashboard based on authority/scope                       ││
│  │ • Examples: Founders, employees, product managers                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ GUEST PARTNERS                                                          ││
│  │ External collaborators with scoped dashboard access                     ││
│  │                                                                          ││
│  │ • Identity: Managed DID (walt.id Custodian)                             ││
│  │ • Access: Filtered by product tags/families                             ││
│  │ • Examples: Agencies, freelancers, seasonal contractors                 ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ TRANSACTIONAL PARTNERS                                                  ││
│  │ One-time or limited access via magic link                               ││
│  │                                                                          ││
│  │ • Identity: Ephemeral did:key (generated per session)                   ││
│  │ • Access: Single product or specific task                               ││
│  │ • Examples: One-time data entry, quick review requests                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### User Type Comparison

| Aspect | Internal User | Guest Partner | Transactional Partner |
|--------|---------------|---------------|----------------------|
| **Authentication** | Email + Password | Magic Link | Magic Link |
| **Link Expiry** | N/A | Configurable (default: never) | Configurable (default: never) |
| **DID Storage** | walt.id Custodian | walt.id Custodian | Ephemeral (session only) |
| **Workspace Access** | Per-workspace authority | Limited workspaces + product filters | Single workspace, specific products |
| **Product Access** | Based on workspace | Filtered by tags/families | Specific products only |
| **Dashboard** | Full (accessible workspaces) | Scoped | Minimal (task-focused) |
| **Can Invite Others** | If Admin | No | No |

---

## 2. Authority Levels

Authority determines what actions a user can perform **within a workspace**. Users have a separate authority level for each workspace they can access. There are four levels:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHORITY HIERARCHY                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MANAGER ──────────────────────────────────────────────────────────────────  │
│  │ • Self-sign product versions (changes go live immediately)              │
│  │ • Approve changes from Contributors                                      │
│  │ • Issue DPPs (final sign-off)                                           │
│  │ • Invite and manage users                                                │
│  │ • Best for: Founders, team leads, product owners                        │
│  │                                                                          │
│  EDITOR ───────────────────────────────────────────────────────────────────  │
│  │ • Self-sign product versions (changes go live immediately)              │
│  │ • Approve changes from Contributors (within their scope)                │
│  │ • Cannot issue DPPs                                                      │
│  │ • Best for: Trusted employees, senior product managers                  │
│  │                                                                          │
│  CONTRIBUTOR ──────────────────────────────────────────────────────────────  │
│  │ • Edit products and save drafts                                         │
│  │ • Submit for review (requires approval to go live)                      │
│  │ • Cannot self-approve                                                    │
│  │ • Best for: Interns, agencies, external data entry                      │
│  │                                                                          │
│  VIEWER ───────────────────────────────────────────────────────────────────  │
│    • Read-only access                                                       │
│    • Cannot edit or save                                                    │
│    • Best for: Sales team, support staff, auditors                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Authority Matrix (Per Workspace)

These permissions apply **within each workspace** the user has access to:

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View workspace data | ✓ | ✓ | ✓ | ✓ |
| Edit data (draft) | - | ✓ | ✓ | ✓ |
| Self-sign changes | - | - | ✓ | ✓ |
| Approve others' changes | - | - | ✓ | ✓ |
| Issue DPPs (Compliance only) | - | - | - | ✓ |
| View audit log | ✓ | ✓ | ✓ | ✓ |

**Admin-only actions** (separate from workspace authority):

| Action | Requires |
|--------|----------|
| Invite users | Admin access |
| Manage billing | Admin access |
| API key management | Admin access |
| Organization settings | Admin access |

---

## 3. Workspace Access

Users are granted access to specific workspaces with an authority level per workspace. This replaces the old "scope" model with workspace-based access control.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          WORKSPACE ACCESS MODEL                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Each user has access to SPECIFIC workspaces (not all by default)           │
│  Each workspace access includes an AUTHORITY LEVEL                          │
│                                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   DESIGN    │  │ OPERATIONS  │  │  MARKETING  │  │ COMPLIANCE  │        │
│  │    (PLM)    │  │ (ERP-lite)  │  │    (PIM)    │  │    (DPP)    │        │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤  ├─────────────┤        │
│  │             │  │             │  │             │  │             │        │
│  │ • Registry  │  │ • Registry  │  │ • PIM       │  │ • DPP       │        │
│  │ • Materials │  │ • EPCIS     │  │ • DAM-Media │  │   Issuance  │        │
│  │ • DAM-Tech  │  │ • Inventory │  │ • Syndicate │  │ • Attest    │        │
│  │ • BOMs      │  │ • Suppliers │  │ • Channels  │  │ • Certs     │        │
│  │             │  │             │  │             │  │             │        │
│  │ WRITES TO   │  │ WRITES TO   │  │ WRITES TO   │  │ READS FROM  │        │
│  │ THE HUB     │  │ THE HUB     │  │ THE HUB     │  │ THE HUB     │        │
│  │             │  │             │  │             │  │             │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                              │
│  Example User: Maria Garcia                                                 │
│  ├── Design:     No access                                                  │
│  ├── Operations: No access                                                  │
│  ├── Marketing:  EDITOR (can self-publish content)                          │
│  └── Compliance: VIEWER (can view DPPs, not issue)                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workspace vs Admin Access

In addition to workspace access, users may have **Admin** privileges for organization-level settings:

| Access Type | Controls |
|-------------|----------|
| **Workspace Access** | Which workspaces user can see and work in |
| **Admin Access** | User management, billing, API keys, integrations, org settings |

Admin access is a separate boolean flag, not a workspace. A user can be an EDITOR in Marketing with no Admin access, or a VIEWER in all workspaces with full Admin access.

### Default Access on User Creation

When an admin invites a new user, they explicitly configure:
1. **Role template** (quick setup) - or -
2. **Custom workspace access** (per-workspace authority)

There is no automatic workspace assignment. The admin decides what access each user needs based on their job function.

**First user (founder):** Gets all workspaces as MANAGER + Admin access automatically.

**All other users:** Admin selects access during invitation using:
- Role templates (Marketing Manager, Compliance Officer, etc.)
- Custom per-workspace configuration

### Workspace Access Examples

| User Role | Design | Operations | Marketing | Compliance | Admin |
|-----------|:------:|:----------:|:---------:|:----------:|:-----:|
| **Founder** | MANAGER | MANAGER | MANAGER | MANAGER | ✓ |
| **Product Designer** | EDITOR | VIEWER | - | - | - |
| **Operations Lead** | VIEWER | MANAGER | - | - | - |
| **Marketing Manager** | - | - | MANAGER | VIEWER | - |
| **Compliance Officer** | VIEWER | VIEWER | VIEWER | MANAGER | - |
| **External Agency** | - | - | CONTRIBUTOR | - | - |
| **IT Admin** | VIEWER | VIEWER | VIEWER | VIEWER | ✓ |

### Cross-Workspace Visibility

- Users only see workspaces they have access to in the workspace switcher
- Users with no access to a workspace cannot see or access it at all
- VIEWER access allows reading data but not editing
- The Golden Record in The Hub aggregates data from all workspaces the user contributes to

### Role Templates

To simplify user management, organizations can use pre-defined role templates when inviting users:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ROLE TEMPLATES                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRODUCT DESIGNER                                                           │
│  ─────────────────                                                          │
│  Design: EDITOR │ Operations: VIEWER │ Marketing: - │ Compliance: -         │
│  Use case: Engineers, PLM specialists working on BOMs and materials         │
│                                                                              │
│  OPERATIONS MANAGER                                                         │
│  ──────────────────                                                         │
│  Design: VIEWER │ Operations: MANAGER │ Marketing: - │ Compliance: -        │
│  Use case: Supply chain leads, inventory managers, logistics                │
│                                                                              │
│  MARKETING MANAGER                                                          │
│  ─────────────────                                                          │
│  Design: - │ Operations: - │ Marketing: MANAGER │ Compliance: VIEWER        │
│  Use case: Brand managers, content leads, e-commerce managers               │
│                                                                              │
│  COMPLIANCE OFFICER                                                         │
│  ──────────────────                                                         │
│  Design: VIEWER │ Operations: VIEWER │ Marketing: VIEWER │ Compliance: MGR  │
│  Use case: Sustainability leads, regulatory compliance, DPP issuance        │
│                                                                              │
│  EXTERNAL CONTRIBUTOR                                                       │
│  ────────────────────                                                       │
│  Design: - │ Operations: - │ Marketing: CONTRIBUTOR │ Compliance: -         │
│  Use case: Agencies, freelancers, seasonal content creators                 │
│  Note: Usually combined with product tag/family restrictions                │
│                                                                              │
│  FULL ADMIN                                                                 │
│  ──────────                                                                 │
│  Design: MANAGER │ Operations: MANAGER │ Marketing: MANAGER │ Compliance: MGR│
│  Admin: ✓                                                                   │
│  Use case: Founders, co-founders, C-level executives                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

Templates can be customized after selection. Organizations can also create custom role templates.

---

## 4. Version Control Workflow

Product editing follows a git-style version control model:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       VERSION CONTROL WORKFLOW                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Organic Cotton T-Shirt (TSH-001)                                  │
│                                                                              │
│  v3 (LIVE) ◄── Current published version                                    │
│  │  Approved: 2026-01-10 by Sarah Chen (EDITOR)                             │
│  │  Signed: did:key:z6MkSarah...                                            │
│  │  Changes: Updated fiber composition, added GOTS cert                     │
│  │                                                                           │
│  v2                                                                          │
│  │  Approved: 2026-01-05 by John Smith (MANAGER)                            │
│  │  Signed: did:key:z6MkJohn...                                             │
│  │  Changes: Price update, new images                                       │
│  │                                                                           │
│  v1                                                                          │
│     Created: 2026-01-01 by Admin                                            │
│     Signed: did:key:z6MkAdmin...                                            │
│     Initial product creation                                                │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ DRAFT (v4-draft) ◄── Working copy                                       ││
│  │ Checked out by: Maria Garcia (CONTRIBUTOR)                              ││
│  │ Since: 2026-01-10 14:30                                                 ││
│  │ Changes: 3 fields modified                                              ││
│  │ Status: PENDING_REVIEW                                                  ││
│  │ [View Diff] [Approve] [Reject]                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Version States

| State | Description |
|-------|-------------|
| DRAFT | Being edited by a user |
| PENDING_REVIEW | Submitted by CONTRIBUTOR, awaiting approval |
| APPROVED | Live version (current) |
| REJECTED | Reviewer rejected, author can revise |
| SUPERSEDED | Was live, replaced by newer version |

### Workflow by Authority

**EDITOR / MANAGER (Sign-on-Save):**
```
1. User clicks "Edit Product"
2. System creates DRAFT version (copy of current)
3. User makes multiple changes to draft
4. User clicks "Publish"
5. System auto-signs with user's DID
6. Version incremented, becomes LIVE
```

**CONTRIBUTOR (Sign-on-Approval):**
```
1. User clicks "Edit Product"
2. System creates DRAFT version
3. User makes changes
4. User clicks "Submit for Review"
5. Status → PENDING_REVIEW
6. Routed to approver (EDITOR/MANAGER with matching scope)
7. Approver reviews diff
8. Approver approves → Signs with their DID → Version becomes LIVE
   OR
   Approver rejects → Author notified, can revise
```

### Checkout Locking

When a user checks out a product for editing:

- Product shows "Being edited by [User]" indicator
- Other users can view but not edit (prevents conflicts)
- Checkout expires after 24 hours of inactivity (configurable)
- User can explicitly release the checkout

---

## 5. Data Model

### User Model

```prisma
enum Authority {
  VIEWER
  CONTRIBUTOR
  EDITOR
  MANAGER
}

enum Workspace {
  DESIGN       // PLM: Registry, Materials, DAM-Tech
  OPERATIONS   // ERP-lite: Registry, EPCIS, Inventory
  MARKETING    // PIM: PIM, DAM-Media, Syndication
  COMPLIANCE   // DPP: Compliance, Attestation
}

enum UserType {
  INTERNAL
  GUEST_PARTNER
  TRANSACTIONAL_PARTNER
}

model User {
  id              String       @id @default(cuid())
  email           String
  passwordHash    String?      // null for magic-link users

  // Organization membership
  organizationId  String
  organization    Organization @relation(fields: [organizationId], references: [id])

  // User type
  userType        UserType     @default(INTERNAL)

  // Workspace access (replaces old authority + scopes)
  workspaceAccess WorkspaceAccess[]

  // Admin access (separate from workspace authority)
  isAdmin         Boolean      @default(false)

  // Default workspace (shown on login)
  defaultWorkspace Workspace?

  // Hierarchy (for approval routing)
  reportsToId     String?
  reportsTo       User?        @relation("Hierarchy", fields: [reportsToId], references: [id])
  directReports   User[]       @relation("Hierarchy")

  // Guest/Partner restrictions (applies within allowed workspaces)
  allowedProductTags   String[]    // Filter: only see products with these tags
  allowedFamilyIds     String[]    // Filter: only see products in these families

  // Identity (DID for signing)
  did             String?      // did:key for signing versions
  didKeyId        String?      // Reference in walt.id Custodian

  // Metadata
  name            String
  invitedAt       DateTime?
  invitedById     String?
  lastLoginAt     DateTime?
  isActive        Boolean      @default(true)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  // Relations
  versionsCreated     ProductVersion[]  @relation("VersionCreator")
  versionsReviewed    ProductVersion[]  @relation("VersionReviewer")
  magicLinks          MagicLink[]

  @@unique([email, organizationId])
  @@index([organizationId])
  @@index([userType])
}

// Workspace access per user (replaces old Scope model)
model WorkspaceAccess {
  id              String       @id @default(cuid())

  userId          String
  user            User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  workspace       Workspace    // DESIGN, OPERATIONS, MARKETING, COMPLIANCE
  authority       Authority    // VIEWER, CONTRIBUTOR, EDITOR, MANAGER

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@unique([userId, workspace])  // One authority level per workspace per user
  @@index([userId])
  @@index([workspace])
}

// Pre-defined role templates for easy user setup
model RoleTemplate {
  id              String       @id @default(cuid())

  organizationId  String?      // null = system template, otherwise org-specific
  organization    Organization? @relation(fields: [organizationId], references: [id])

  name            String       // "Marketing Manager", "Compliance Officer", etc.
  description     String?

  // Template access configuration (JSON for flexibility)
  // Format: { "DESIGN": "VIEWER", "MARKETING": "MANAGER", ... }
  workspaceAuthorities Json

  isAdmin         Boolean      @default(false)
  isDefault       Boolean      @default(false)  // Show in quick-select

  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@unique([organizationId, name])
}
```

### ProductVersion Model

```prisma
enum VersionStatus {
  DRAFT
  PENDING_REVIEW
  APPROVED
  REJECTED
  SUPERSEDED
}

model ProductVersion {
  id              String        @id @default(cuid())
  productId       String
  product         Product       @relation(fields: [productId], references: [id])

  version         Int           // 1, 2, 3...
  status          VersionStatus @default(DRAFT)

  // Snapshot of ALL product data at this version
  commercialData  Json          // { name, price, description, images... }
  complianceData  Json          // { materials, certifications, carbonFootprint... }

  // Diff from previous version (for easy review)
  changesSummary  String[]      // ["price: €49 → €59", "added GOTS certification"]
  dataDiff        Json?         // Detailed JSON diff

  // Authorship
  createdById     String
  createdBy       User          @relation("VersionCreator", fields: [createdById], references: [id])
  createdAt       DateTime      @default(now())

  // Review (for CONTRIBUTOR workflow)
  reviewedById    String?
  reviewedBy      User?         @relation("VersionReviewer", fields: [reviewedById], references: [id])
  reviewedAt      DateTime?
  reviewNotes     String?

  // Cryptographic signature (upon approval/publish)
  signedById      String?       // User who signed
  signerDid       String?       // Their DID at time of signing
  signature       String?       // JWS of the version snapshot
  signedAt        DateTime?

  @@unique([productId, version])
  @@index([productId, status])
  @@index([createdById])
}
```

### Product Model Extensions

```prisma
model Product {
  // ... existing fields ...

  // Version control
  currentVersionId    String?           // Points to APPROVED version (LIVE)
  currentVersion      ProductVersion?   @relation("CurrentVersion", fields: [currentVersionId], references: [id])
  draftVersionId      String?           // Points to DRAFT version (if checked out)
  draftVersion        ProductVersion?   @relation("DraftVersion", fields: [draftVersionId], references: [id])

  // Checkout lock
  checkedOutById      String?           // User who has the draft
  checkedOutBy        User?             @relation("CheckedOut", fields: [checkedOutById], references: [id])
  checkedOutAt        DateTime?

  versions            ProductVersion[]
}
```

### MagicLink Model

```prisma
model MagicLink {
  id              String    @id @default(cuid())
  token           String    @unique @default(cuid())

  userId          String
  user            User      @relation(fields: [userId], references: [id])

  // Expiry (null = never expires)
  expiresAt       DateTime?

  // Usage tracking
  usedAt          DateTime?
  revokedAt       DateTime?

  createdAt       DateTime  @default(now())

  @@index([token])
  @@index([userId])
}

model MagicLinkSettings {
  id                  String       @id @default(cuid())
  organizationId      String       @unique
  organization        Organization @relation(fields: [organizationId], references: [id])

  // Defaults for new magic links
  defaultExpiryDays   Int?         // null = never expires (default)
  maxExpiryDays       Int?         // null = no limit
  allowCustomExpiry   Boolean      @default(true)
}
```

### AuditLog Model

```prisma
model AuditLog {
  id              String    @id @default(cuid())
  organizationId  String

  // Who
  userId          String?
  userEmail       String?   // Captured at time of action
  userName        String?

  // What
  action          String    // "product.version.created", "user.invited", etc.
  resourceType    String    // "Product", "User", "Passport"
  resourceId      String?

  // Details
  metadata        Json?     // Additional context
  ipAddress       String?
  userAgent       String?

  createdAt       DateTime  @default(now())

  @@index([organizationId, createdAt])
  @@index([resourceType, resourceId])
  @@index([userId])
}
```

---

## 6. User DID & Chain of Custody

Each user has their own did:key for signing product versions. This creates a cryptographic chain of custody.

### DID Hierarchy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DID HIERARCHY                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ORGANIZATION DID (did:key:zOrg...)                                         │
│  └── Purpose: Issue DPPs (external, public-facing)                          │
│  └── Stored: walt.id Custodian (org-level key)                              │
│  └── Signs: DigitalProductPassport VCs                                      │
│                                                                              │
│  USER DIDs (did:key:zUser...)                                               │
│  └── Purpose: Sign product versions (internal chain of custody)             │
│  └── Stored: walt.id Custodian (per-user keys)                              │
│  └── Signs: ProductVersion snapshots on approval/publish                    │
│                                                                              │
│  FLOW:                                                                       │
│  User edits product → Submits version → Approver signs with their DID →     │
│  Version becomes live → When DPP issued, Org DID signs the DPP              │
│  (which references the signed version history)                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### What Gets Signed

| Entity | Signed By | DID Type | When |
|--------|-----------|----------|------|
| ProductVersion | User (Editor/Manager) | User DID | On publish/approve |
| DigitalProductPassport | Organization | Org DID | On DPP issuance |
| Attestation | Third-party Contributor | Contributor DID | On attestation submit |

### User DID Lifecycle

```
1. User is invited to organization
   └── No DID yet (created on first signing action)

2. User publishes their first product version
   └── System generates did:key via walt.id Custodian
   └── DID stored on User record
   └── Version signed with new DID

3. User continues working
   └── Same DID used for all future signatures

4. User leaves organization
   └── User deactivated, DID remains for audit trail
   └── Historical signatures remain valid

5. Data export
   └── User DIDs included in export package
   └── Full chain of custody preserved
```

### Signature Verification

```typescript
// Verify a product version signature
async function verifyVersionSignature(version: ProductVersion): Promise<boolean> {
  if (!version.signature || !version.signerDid) {
    return false; // Unsigned
  }

  // Reconstruct the signed payload
  const payload = {
    productId: version.productId,
    version: version.version,
    commercialData: version.commercialData,
    complianceData: version.complianceData,
    signedAt: version.signedAt,
  };

  // Verify using did:key (self-contained, no network call needed)
  return await verifyJws(version.signature, version.signerDid, payload);
}
```

---

## 7. Wallet Architecture

Keys and credentials are managed through a **Wallet** abstraction. This enables future integration with EU Digital Identity Wallets (for users) and EU Organizational Wallets (for legal entities) without changing application code.

### Global Coverage

MANAGED wallets are the default and work for **all users and organizations worldwide**:

| Location | Organization Wallet | User Wallet Options |
|----------|--------------------|--------------------|
| **EU** | MANAGED (default) or EU Org Wallet | MANAGED (default) or EUDI |
| **China** | MANAGED | MANAGED |
| **USA** | MANAGED | MANAGED |
| **Anywhere else** | MANAGED | MANAGED |

EUDI and EU Organizational Wallets are **optional enhancements** for EU-based entities that want stronger identity verification. Non-EU users have full functionality with MANAGED wallets.

### Wallet Types

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           WALLET ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  MANAGED WALLET (Default)                                                   │
│  ─────────────────────────────────────────────────────────────              │
│  • Keys stored in walt.id Custodian                                         │
│  • Signing happens server-side (automatic)                                  │
│  • User doesn't need external tools                                         │
│  • Best for: Most users, quick onboarding                                   │
│                                                                              │
│  EUDI WALLET (Future)                                                       │
│  ─────────────────────────────────────────────────────────────              │
│  • User's EU Digital Identity Wallet                                        │
│  • Signing requires user confirmation (on phone)                            │
│  • Government-verified identity                                             │
│  • Best for: Higher trust requirements, regulated entities                  │
│                                                                              │
│  EXTERNAL WALLET (Future)                                                   │
│  ─────────────────────────────────────────────────────────────              │
│  • Third-party wallets (WalletConnect, etc.)                                │
│  • User controls their own keys                                             │
│  • Full self-sovereignty                                                    │
│  • Best for: Advanced users, specific compliance needs                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Wallet Provider Interface

All wallet types implement the same interface:

```typescript
interface WalletProvider {
  // Identity
  getDid(): Promise<string>;

  // Signing (the core operation)
  sign(payload: SignablePayload): Promise<SignedResult>;

  // Credential management
  storeCredential(vc: VerifiableCredential): Promise<void>;
  getCredentials(filter?: CredentialFilter): Promise<VerifiableCredential[]>;
}

// Factory creates the appropriate provider based on wallet type
const wallet = await WalletFactory.getProvider(user.wallet);
const signed = await wallet.sign(versionData);
// Same code works regardless of MANAGED, EUDI, or EXTERNAL wallet
```

### Signing Flow Comparison

```
MANAGED WALLET (Today)                    EUDI WALLET (Future)
──────────────────────                    ────────────────────
1. User clicks "Publish"                  1. User clicks "Publish"
2. wallet.sign(data)                      2. wallet.sign(data)
3. Server signs via walt.id               3. Request sent to user's phone
4. Signed result returned                 4. User confirms with biometrics
5. Done (instant)                         5. Signed result returned
                                          6. Done (few seconds)
```

### Data Model

```prisma
enum WalletType {
  MANAGED         // We hold keys (walt.id)
  EUDI            // EU Digital Identity Wallet
  EXTERNAL        // Other external wallet
}

model UserWallet {
  id              String      @id @default(cuid())
  userId          String      @unique
  user            User        @relation(fields: [userId], references: [id])

  type            WalletType  @default(MANAGED)

  // ─── MANAGED wallet fields ───
  did             String?     // did:key generated by us
  keyId           String?     // Reference in walt.id Custodian

  // ─── EUDI wallet fields ───
  eudiDid         String?     // did:ebsi or similar
  eudiSubject     String?     // EUDI subject identifier
  connectionState Json?       // OAuth tokens, connection metadata

  // ─── Common fields ───
  activeDid       String?     // Which DID to use for signing
  connectedAt     DateTime?
  lastUsedAt      DateTime?

  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

model OrganizationWallet {
  id              String       @id @default(cuid())
  organizationId  String       @unique
  organization    Organization @relation(fields: [organizationId], references: [id])

  type            OrgWalletType @default(MANAGED)

  // ─── MANAGED wallet fields ───
  did             String?      // did:key generated by us
  keyId           String?      // Reference in walt.id Custodian

  // ─── EU_ORG_WALLET fields (future) ───
  euOrgDid        String?      // did:ebsi or similar for legal entities
  euOrgSubject    String?      // EU organizational identity subject
  connectionState Json?        // OAuth tokens, connection metadata

  // ─── Common fields ───
  activeDid       String?      // Which DID to use for signing DPPs
  leiCode         String?      // ISO 17442 Legal Entity Identifier
  vatNumber       String?      // For EU VAT verification

  connectedAt     DateTime?
  lastUsedAt      DateTime?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

enum OrgWalletType {
  MANAGED         // We hold keys (walt.id) - works globally
  EU_ORG_WALLET   // EU Organizational Identity Wallet (eIDAS 2.0)
}
```

### EUDI Wallet Connection Flow

When EUDI Wallet becomes available, users can connect it:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WALLET SETTINGS                                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Current Wallet: Managed Wallet                                             │
│  DID: did:key:z6MkSarah...                                                  │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  🇪🇺 Connect EU Digital Identity Wallet                                      │
│                                                                              │
│  Use your government-issued digital identity to sign product changes.       │
│  This provides stronger trust guarantees for compliance.                    │
│                                                                              │
│  Benefits:                                                                   │
│  • Government-verified identity                                             │
│  • Listed in EU Trusted Issuers Registry                                    │
│  • Stronger legal standing for compliance                                   │
│                                                                              │
│  [Connect EUDI Wallet]                                                       │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  How it works:                                                              │
│  1. Click "Connect EUDI Wallet"                                             │
│  2. Scan QR code with your EUDI Wallet app                                  │
│  3. Approve connection request                                              │
│  4. Future signatures will use your EUDI identity                           │
│                                                                              │
│  Your managed wallet remains as backup.                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### EU Organizational Wallet (Legal Entities)

For EU-based organizations, connecting an EU Organizational Wallet provides government-verified legal entity identity:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ORGANIZATION WALLET SETTINGS                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Current Wallet: Managed Wallet                                             │
│  Organization DID: did:key:z6MkOrg...                                       │
│  LEI: Not configured                                                        │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  🇪🇺 Connect EU Organizational Wallet                                        │
│                                                                              │
│  Link your organization's EU Digital Identity to sign DPPs with            │
│  government-verified legal entity credentials.                             │
│                                                                              │
│  Benefits:                                                                   │
│  • Verified legal entity identity (eIDAS 2.0)                               │
│  • Listed in EU Trusted Issuers Registry                                    │
│  • DPPs carry stronger regulatory weight                                    │
│  • Automatic LEI linking                                                    │
│                                                                              │
│  [Connect EU Org Wallet]                                                     │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Alternative: Add LEI manually                                              │
│  Legal Entity Identifier: [                                    ]            │
│  (20-character ISO 17442 code)                                              │
│                                                                              │
│  [Save LEI]                                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Note:** EU Organizational Wallets are still being standardized under eIDAS 2.0. When available, connecting will be similar to EUDI Wallet flow but for legal entities.

### Trust Levels in History View

Product history displays the trust level of each signature:

```
Product History:

v3 ─────────────────────────────────────────────
│ Signed by: Anna Schmidt (MANAGER)
│ DID: did:ebsi:zAnna...
│ Trust: 🇪🇺 Government-verified (EUDI)
│ ✓ Signature Valid

v2 ─────────────────────────────────────────────
│ Signed by: Wang Wei (EDITOR)
│ DID: did:key:zWangWei...
│ Trust: Platform-managed
│ ✓ Signature Valid

DPP Issued ─────────────────────────────────────
│ Signed by: Organization (Acme GmbH)
│ DID: did:ebsi:zAcmeGmbH...
│ Trust: 🇪🇺 EU Organizational Wallet
│ LEI: 5493001KJTIIGC8Y1R12
│ ✓ Signature Valid
```

### Why This Architecture

| Benefit | Description |
|---------|-------------|
| **Global by default** | MANAGED wallets work for users and organizations worldwide |
| **Future-proof** | EU wallet integration requires no application code changes |
| **User choice** | EU users can optionally connect EUDI for stronger identity |
| **Org choice** | EU organizations can optionally connect EU Org Wallet |
| **Gradual migration** | Adopt EU wallets at your own pace |
| **Compliance ready** | Stronger identity verification when regulations require it |
| **Fallback support** | Managed wallet always available as backup |

---

## 8. Approval Routing

When a CONTRIBUTOR submits a version for review, it needs to be routed to an appropriate approver **within the same workspace**.

### Routing Logic

```typescript
async function routeForApproval(
  version: ProductVersion,
  requester: User,
  workspace: Workspace
): Promise<void> {
  // Approval is routed within the workspace where the change was made

  // 1. Try direct manager first (if they have EDITOR/MANAGER in this workspace)
  if (requester.reportsToId) {
    const manager = await getUser(requester.reportsToId);
    if (canApproveInWorkspace(manager, workspace)) {
      await assignToUser(version, manager.id);
      return;
    }
  }

  // 2. Find any EDITOR/MANAGER with access to this workspace
  const approvers = await findUsersWithWorkspaceAccess({
    organizationId: requester.organizationId,
    workspace: workspace,
    authority: { in: ['EDITOR', 'MANAGER'] },
    isActive: true,
  });

  if (approvers.length === 0) {
    throw new Error(`No approvers available for ${workspace} workspace`);
  }

  // 3. Assign to workspace (any matching approver can pick it up)
  await assignToWorkspace(version, workspace);
  await notifyApprovers(approvers, version);
}

function canApproveInWorkspace(user: User, workspace: Workspace): boolean {
  const access = user.workspaceAccess.find(wa => wa.workspace === workspace);
  if (!access) return false;
  return access.authority === 'EDITOR' || access.authority === 'MANAGER';
}
```

### Approval Inbox

Approvers see pending versions in their inbox, filtered by the workspaces they have EDITOR/MANAGER access to:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  APPROVAL INBOX                                              3 pending      │
│  Filter: [All Workspaces ▼]                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [DESIGN] Organic Cotton T-Shirt (TSH-001)                               ││
│  │ Submitted by: Maria Garcia • 2 hours ago                                ││
│  │ Changes: materials.fiberComposition, BOM updates                        ││
│  │ [View Diff] [Approve] [Reject]                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [MARKETING] Denim Jacket (JKT-042)                                      ││
│  │ Submitted by: External Agency • 5 hours ago                             ││
│  │ Changes: price, description, images                                     ││
│  │ [View Diff] [Approve] [Reject]                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [OPERATIONS] Winter Coat (WC-099)                                       ││
│  │ Submitted by: John Intern • 1 day ago                                   ││
│  │ Changes: supplier info, inventory levels                                ││
│  │ [View Diff] [Approve] [Reject]                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Note:** Users only see approvals for workspaces where they have EDITOR or MANAGER authority.

---

## 9. UI Components

### Team Settings Page

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TEAM MEMBERS                                           [+ Invite User]     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Sarah Chen                              sarah@company.com               ││
│  │ Full Admin (all workspaces)                                   [Admin]   ││
│  │ Design: MGR │ Operations: MGR │ Marketing: MGR │ Compliance: MGR        ││
│  │ Internal User • Last active: 2 hours ago                                ││
│  │ [Edit] [Deactivate]                                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ John Smith                              john@company.com                ││
│  │ Marketing Manager                                                       ││
│  │ Design: - │ Operations: - │ Marketing: MGR │ Compliance: VIEW           ││
│  │ Internal User • Last active: 1 day ago                                  ││
│  │ [Edit] [Deactivate]                                                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Maria Garcia                            maria@agency.com                ││
│  │ External Contributor                                                    ││
│  │ Design: - │ Operations: - │ Marketing: CONTRIB │ Compliance: -          ││
│  │ Guest Partner • Products: summer-2026, t-shirts                         ││
│  │ [Edit] [Revoke Access]                                                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Invite User Modal

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INVITE USER                                                         [X]   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Email:        [partner@supplier.com                              ]        │
│  Name:         [Maria Garcia                                      ]        │
│                                                                              │
│  User Type:    (•) Internal User                                           │
│                ( ) Guest Partner                                            │
│                                                                              │
│  ─── Quick Setup: Role Template ─────────────────────────────────────────   │
│                                                                              │
│  [ Marketing Manager                                      ▼]               │
│                                                                              │
│  ─── Or Configure Workspace Access ──────────────────────────────────────   │
│                                                                              │
│  │ Workspace    │ Authority                                                │
│  ├──────────────┼───────────────────────────────────────────────────────   │
│  │ Design       │ [ No Access ▼]                                           │
│  │ Operations   │ [ No Access ▼]                                           │
│  │ Marketing    │ [ MANAGER   ▼]  ← edit from template                     │
│  │ Compliance   │ [ VIEWER    ▼]                                           │
│                                                                              │
│  [ ] Grant Admin access (user management, billing, API keys)               │
│                                                                              │
│  ─── Guest Partner Options (if selected) ─────────────────────────────────  │
│                                                                              │
│  Restrict to Products Tagged:                                               │
│  [summer-2026] [t-shirts] [+ Add Tag]                                      │
│                                                                              │
│  Restrict to Product Families:                                              │
│  [ Apparel > T-Shirts                                     ▼]               │
│                                                                              │
│  ─── Magic Link Options ──────────────────────────────────────────────────  │
│                                                                              │
│  Link Expiry:  (•) Never expires                                           │
│                ( ) Expires after [    ] days                                │
│                                                                              │
│                                              [Cancel]  [Send Invitation]   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Product History Tab

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PRODUCT: Organic Cotton T-Shirt (TSH-001)                                  │
│  ─────────────────────────────────────────────────────────────────────────  │
│  [Details] [Images] [Compliance] [HISTORY] [DPP]                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  VERSION HISTORY                                                            │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  v3 (CURRENT) ─────────────────────────────────────── 2026-01-10 14:32     │
│  │ Published by: Sarah Chen (EDITOR)                                        │
│  │ Signed: did:key:z6MkSarah... ✓ Valid                                    │
│  │                                                                          │
│  │ Changes:                                                                 │
│  │ • materials.fiberComposition: 90% Cotton → 95% Organic Cotton           │
│  │ • certifications: Added GOTS (CU-123456)                                │
│  │                                                                          │
│  │ [View Full Snapshot] [Revert to This Version]                           │
│  │                                                                          │
│  v2 ───────────────────────────────────────────────── 2026-01-05 09:15     │
│  │ Approved by: John Smith (MANAGER)                                        │
│  │ Submitted by: Maria Garcia (CONTRIBUTOR)                                 │
│  │ Signed: did:key:z6MkJohn... ✓ Valid                                     │
│  │                                                                          │
│  │ Changes:                                                                 │
│  │ • price: €45.00 → €49.00                                                │
│  │ • images: Added 2 new gallery images                                    │
│  │                                                                          │
│  │ [View Full Snapshot] [Revert to This Version]                           │
│  │                                                                          │
│  v1 ───────────────────────────────────────────────── 2026-01-01 10:00     │
│    Created by: Admin                                                        │
│    Signed: did:key:z6MkAdmin... ✓ Valid                                    │
│    Initial product creation                                                 │
│                                                                              │
│    [View Full Snapshot]                                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 10. API Endpoints

### User Management

```
POST   /api/v1/users                    # Invite user (MANAGER only)
GET    /api/v1/users                    # List org users
GET    /api/v1/users/:id                # Get user details
PATCH  /api/v1/users/:id                # Update user role/scopes
DELETE /api/v1/users/:id                # Deactivate user
POST   /api/v1/users/:id/resend-invite  # Resend magic link
```

### Magic Links

```
POST   /api/v1/magic-links              # Create magic link
GET    /api/v1/magic-links/:token       # Validate and authenticate
DELETE /api/v1/magic-links/:id          # Revoke magic link
```

### Version Control

```
POST   /api/v1/products/:id/checkout    # Start editing (create draft)
DELETE /api/v1/products/:id/checkout    # Release checkout
GET    /api/v1/products/:id/draft       # Get current draft
PATCH  /api/v1/products/:id/draft       # Update draft
POST   /api/v1/products/:id/publish     # Publish (EDITOR/MANAGER)
POST   /api/v1/products/:id/submit      # Submit for review (CONTRIBUTOR)
```

### Approvals

```
GET    /api/v1/approvals                # List pending approvals
GET    /api/v1/approvals/:versionId     # Get approval details + diff
POST   /api/v1/approvals/:versionId/approve  # Approve version
POST   /api/v1/approvals/:versionId/reject   # Reject version
```

### Version History

```
GET    /api/v1/products/:id/versions           # List all versions
GET    /api/v1/products/:id/versions/:version  # Get specific version
POST   /api/v1/products/:id/versions/:version/revert  # Revert to version
```

---

## 11. Implementation Checklist

### Phase 1.1: Core User Model

| Task | Status |
|------|--------|
| Extend Prisma schema with User model | Planned |
| Add Authority and Scope enums | Planned |
| Implement user invitation API | Planned |
| Build magic link generation and validation | Planned |
| Create authority/scope validation middleware | Planned |
| Team settings UI (list, invite, edit, deactivate) | Planned |

### Phase 1.2: Version Control

| Task | Status |
|------|--------|
| Add ProductVersion model to schema | Planned |
| Extend Product model with version control fields | Planned |
| Implement checkout/checkin workflow | Planned |
| Build diff generation between versions | Planned |
| Create publish endpoint (EDITOR/MANAGER) | Planned |
| Create submit-for-review endpoint (CONTRIBUTOR) | Planned |
| Product history tab UI | Planned |

### Phase 1.3: Approval Workflow

| Task | Status |
|------|--------|
| Implement approval routing logic | Planned |
| Build approval inbox API | Planned |
| Create approve/reject endpoints | Planned |
| Approval inbox UI | Planned |
| Email notifications for pending approvals | Planned |

### Phase 1.4: User DID & Signing

| Task | Status |
|------|--------|
| Integrate user DID generation via walt.id | Planned |
| Auto-generate DID on first signing action | Planned |
| Implement version signing on publish/approve | Planned |
| Signature verification in history view | Planned |
| Include user DIDs in data export | Planned |

---

## 12. Security Considerations

| Area | Implementation |
|------|----------------|
| **Workspace enforcement** | Middleware checks workspace access + authority before any operation |
| **Authority per workspace** | Users can only perform actions matching their authority in that workspace |
| **Admin separation** | Admin access is separate from workspace authority |
| **Guest restrictions** | Product queries filtered by allowedProductTags/allowedFamilyIds within allowed workspaces |
| **Magic link security** | Cryptographically random tokens, optional expiry |
| **DID ownership** | Users cannot access other users' private keys |
| **Audit completeness** | Every action logged with user context and workspace |
| **Checkout locking** | Prevents concurrent edits, auto-expires after inactivity |

---

## 13. Related Documentation

| Document | Description |
|----------|-------------|
| [GOLDEN_RECORD.md](./GOLDEN_RECORD.md) | How workspaces contribute to The Hub |
| [SELF_SERVICE_ONBOARDING.md](./SELF_SERVICE_ONBOARDING.md) | Onboarding flow and default workspace assignment |
| [VERIFIABLE_CREDENTIALS.md](./VERIFIABLE_CREDENTIALS.md) | DID hierarchy and VC signing |
| [MULTI_PARTY_ATTESTATION.md](./MULTI_PARTY_ATTESTATION.md) | Third-party contributor workflow |
| [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) | Data export including user DIDs |
| [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) | Full implementation roadmap |

---

*Last Updated: January 11, 2026*

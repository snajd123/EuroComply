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
| **Link Expiry** | N/A | Configurable (default: 30 days) | Configurable (default: 7 days) |
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

**Design & Marketing Workspaces (Versioned):**

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View workspace data | ✓ | ✓ | ✓ | ✓ |
| Edit data (draft) | - | ✓ | ✓ | ✓ |
| Self-sign/release versions | - | - | ✓ | ✓ |
| Approve others' versions | - | - | ✓ | ✓ |
| View audit log | ✓ | ✓ | ✓ | ✓ |

**Operations Workspace (Four-Eyes Principle):**

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View workspace data | ✓ | ✓ | ✓ | ✓ |
| Create batch/order (PENDING) | - | ✓ | ✓ | ✓ |
| Edit PENDING records | - | ✓ (own) | ✓ | ✓ |
| Commit (lock) records | - | - | ✓ | ✓ |
| Update status (after commit) | - | - | ✓ | ✓ |
| View audit log | ✓ | ✓ | ✓ | ✓ |

**Compliance Workspace:**

| Action | VIEWER | CONTRIBUTOR | EDITOR | MANAGER |
|--------|:------:|:-----------:|:------:|:-------:|
| View DPPs and compliance data | ✓ | ✓ | ✓ | ✓ |
| Issue DPPs | - | - | - | ✓ |
| Revoke DPPs | - | - | - | ✓ |
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
- The Hub aggregates workspace data from all workspaces the user contributes to

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

Version control varies by workspace type. Design and Marketing maintain formal versions, while Operations creates immutable transaction records.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    WORKSPACE-BASED VERSION CONTROL                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Organic Cotton T-Shirt (TSH-001)                                  │
│                                                                              │
│  DESIGN WORKSPACE (Versioned)                                               │
│  ═══════════════════════════════════════════════════════════════════════    │
│  v3 (RELEASED) ◄── Current version for new batches/orders                  │
│  │  Released: Jan 15 by Engineer A (EDITOR)                                 │
│  │  Materials: 95% organic cotton, 5% elastane                              │
│  │  Signed: did:key:z6MkEngineerA...                                        │
│  │                                                                          │
│  v2 (ACTIVE) ◄── Referenced by Batch #12345, #12346                        │
│  │  Released: Jan 5 by Engineer B                                           │
│  │  Materials: 90% organic cotton, 10% elastane                             │
│  │  ⚠️ Cannot archive until active batches complete                         │
│  │                                                                          │
│  v1 (ARCHIVED)                                                              │
│     Released: Jan 1 by Admin                                                │
│     No active references                                                    │
│                                                                              │
│  MARKETING WORKSPACE (Versioned - Independent)                              │
│  ═══════════════════════════════════════════════════════════════════════    │
│  v4 (RELEASED) ◄── Current published content                               │
│  │  Released: Jan 16 by Content Lead (EDITOR)                               │
│  │  Description: "Made with 95% organic cotton..."                          │
│  │  Signed: did:key:z6MkContentLead...                                      │
│  │                                                                          │
│  v3 (SUPERSEDED)                                                            │
│     Released: Jan 6                                                         │
│     Description: "Made with 90% organic cotton..."                          │
│                                                                              │
│  OPERATIONS WORKSPACE (Immutable Records)                                   │
│  ═══════════════════════════════════════════════════════════════════════    │
│  Batch #12345 (LOCKED)                                                      │
│  │  Created: Jan 10 │ Design Reference: v2 (locked at creation)            │
│  │  Quantity: 5000 │ Status: IN_PRODUCTION                                  │
│  │                                                                          │
│  Batch #12350 (LOCKED)                                                      │
│     Created: Jan 16 │ Design Reference: v3 (locked at creation)            │
│     Quantity: 3000 │ Status: PLANNED                                        │
│                                                                              │
│  COMPLIANCE WORKSPACE (Immutable Snapshots)                                 │
│  ═══════════════════════════════════════════════════════════════════════    │
│  DPP v2 (ACTIVE)                                                            │
│  │  Issued: Jan 16 │ Snapshot: Design v3 + Marketing v4 + Ops state        │
│  │  Signed: did:key:z6MkOrg... │ Hash: 0x7f3a...                           │
│  │                                                                          │
│  DPP v1 (SUPERSEDED)                                                        │
│     Issued: Jan 6 │ Snapshot: Design v2 + Marketing v3 + Ops state         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Versioning by Workspace

| Workspace | Versioning Model | Key Characteristics |
|-----------|------------------|---------------------|
| **Design** | Formal versions (v1, v2, v3) | BOMs, specs locked when referenced by Operations |
| **Marketing** | Formal versions (v1, v2, v3) | Independent of Design; can view Design data while editing |
| **Operations** | Immutable records | Batches/orders lock Design version at creation |
| **Compliance** | Immutable snapshots | DPPs capture state from all workspaces at issuance |

### Design & Marketing Version States

| State | Description |
|-------|-------------|
| DRAFT | Being edited, not yet released |
| PENDING_REVIEW | Submitted by CONTRIBUTOR, awaiting approval |
| RELEASED | Current version, ready for use |
| ACTIVE | Has live references (batches, DPPs) - cannot modify |
| ARCHIVED | No active references, historical only |

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VERSION STATE LIFECYCLE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DRAFT ──────→ PENDING_REVIEW ──────→ RELEASED ◄─────── ACTIVE             │
│    │                │                     │    ─────────►  │                │
│    │           (CONTRIBUTOR               │   (refs added) │                │
│    │            workflow)                 │                │                │
│    │                                      ▼                ▼                │
│    ▼                ▼                  ARCHIVED ◄──── (refs cleared)       │
│  Being          Awaiting                  │                                 │
│  edited         approval              Historical                            │
│                                          only                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**State Transition Rules:**

| Transition | Trigger | Automatic? |
|------------|---------|------------|
| DRAFT → PENDING_REVIEW | CONTRIBUTOR submits for review | Manual |
| PENDING_REVIEW → RELEASED | EDITOR/MANAGER approves | Manual |
| DRAFT → RELEASED | EDITOR/MANAGER releases directly | Manual |
| RELEASED → ACTIVE | Operations creates batch referencing this version, OR Compliance issues DPP with this version | **Automatic** |
| ACTIVE → RELEASED | All referencing batches reach terminal state (COMPLETED, CANCELLED) AND all referencing DPPs superseded or revoked | **Automatic** (checked hourly) |
| RELEASED → ARCHIVED | Newer version released, no active references | **Automatic** |
| ACTIVE → ARCHIVED | References cleared + newer version exists | **Automatic** |

**ACTIVE State Details:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ACTIVE STATE BEHAVIOR                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  A version becomes ACTIVE when:                                             │
│  • Operations creates a Batch with designVersionId = this version           │
│  • Compliance issues a DPP with designVersionId = this version              │
│                                                                              │
│  While ACTIVE:                                                              │
│  • Version is IMMUTABLE (no edits allowed)                                  │
│  • Cannot be archived or deleted                                            │
│  • System tracks reference count:                                           │
│    - activeBatchCount: Batches in non-terminal state                        │
│    - activeDppCount: DPPs not superseded or revoked                         │
│                                                                              │
│  A version returns to RELEASED when:                                        │
│  • activeBatchCount = 0 AND activeDppCount = 0                              │
│  • Checked automatically by background job (hourly)                         │
│  • Can also be triggered manually by admin                                  │
│                                                                              │
│  Example:                                                                   │
│  ─────────                                                                  │
│  Design v3 (RELEASED)                                                       │
│      │                                                                      │
│      ├── Batch #100 created → v3 becomes ACTIVE                            │
│      │                                                                      │
│      ├── Batch #100 COMPLETED → check refs                                  │
│      │   └── activeBatchCount: 0, activeDppCount: 0                         │
│      │   └── v3 returns to RELEASED (or ARCHIVED if v4 exists)             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Reference Tracking Schema:**

```prisma
model DesignVersion {
  // ... existing fields ...

  // Reference tracking (updated by triggers/jobs)
  activeBatchCount    Int       @default(0)
  activeDppCount      Int       @default(0)
  lastReferenceCheck  DateTime?
}
```

**Rules Summary:**

| State | Can Edit? | Can Archive? | Can Reference? |
|-------|-----------|--------------|----------------|
| DRAFT | ✓ | ✓ (delete) | ✗ |
| PENDING_REVIEW | ✗ | ✓ (reject) | ✗ |
| RELEASED | ✗ (create new) | ✓ (if no refs) | ✓ |
| ACTIVE | ✗ | ✗ | ✓ (already has refs) |
| ARCHIVED | ✗ | N/A | ✗ |

### Design Workflow (Versioned)

**EDITOR / MANAGER (Sign-on-Save):**
```
1. User clicks "Edit" in Design workspace
2. System creates DRAFT (copy of current RELEASED)
3. User edits BOM, materials, specs
4. User clicks "Release"
5. System signs with user's DID
6. New version becomes RELEASED
7. Previous RELEASED → ARCHIVED (or ACTIVE if referenced)
```

**CONTRIBUTOR (Sign-on-Approval):**
```
1. User clicks "Edit" in Design workspace
2. System creates DRAFT
3. User makes changes
4. User clicks "Submit for Review"
5. Status → PENDING_REVIEW
6. Routed to Design EDITOR/MANAGER
7. Approver reviews diff
8. Approve → Signs, becomes RELEASED
   OR Reject → Author notified, can revise
```

### Marketing Workflow (Versioned, Independent)

Marketing follows the same workflow as Design, with one key feature:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  MARKETING EDITOR - Creating v5                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ⚠️ Design has updated since your draft was created (v3 → v4)              │
│  [View Design Changes] [Acknowledge & Continue]                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Product Description:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ Made with 95% organic cotton from GOTS-certified suppliers. Our         ││
│  │ lightweight 180gsm fabric provides all-day comfort...                   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  📋 Design Data (read-only reference)                   [Version: v4 ▼]    │
│  ─────────────────────────────────────────────────────────────────────────  │
│  │ Fiber Composition: 97% organic cotton, 3% elastane  ← CHANGED           │
│  │ Weight: 180 gsm                                                         │
│  │ Certifications: GOTS (CU-123456), OEKO-TEX Standard 100                │
│  │ Care Instructions: Machine wash cold, tumble dry low                    │
│  │                                                          [Copy Field]   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  Marketing can VIEW any Design version while editing.                       │
│  basedOnDesignVersionId tracks which Design version was current at draft.   │
│                                                                              │
│                                                   [Save Draft] [Release]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Design Sync Awareness:**

When creating a Marketing draft, the system records `basedOnDesignVersionId` (the current Design version). If Design releases a new version while Marketing is still in draft:

1. **Warning banner** appears showing Design has updated
2. **View Changes** shows diff between original and new Design version
3. **Acknowledge** dismisses warning but is logged in audit trail
4. **On Release**, `basedOnDesignVersionId` is updated to current Design version

This prevents Marketing from unknowingly publishing content that references outdated specs.

### Operations Workflow (PENDING → COMMITTED)

Operations uses a **draft-then-commit workflow** to prevent typos from being immediately locked:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CREATE NEW BATCH                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Organic Cotton T-Shirt (TSH-001)                                  │
│                                                                              │
│  Design Version: [v3 (Current) ▼]  ← Select which version to produce       │
│                                                                              │
│  Batch Details:                                                             │
│  ├── Quantity: [5000        ]                                               │
│  ├── Production Line: [Line A ▼]                                            │
│  └── Planned Start: [2026-01-20]                                            │
│                                                                              │
│  Material Lots (from Design v3 BOM):                                        │
│  ├── Organic Cotton: [cotton_lot_801 ▼]                                     │
│  └── Elastane: [elastane_lot_460 ▼]                                         │
│                                                                              │
│                                              [Cancel] [Create as Pending]   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**After creation (PENDING state):**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  BATCH #12350                                          Status: ⏳ PENDING    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Created by: Maria Garcia (CONTRIBUTOR) • 10 minutes ago                    │
│  Auto-commit in: 50 minutes                                                 │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  Design Reference: v3  │  Quantity: 5000  │  Line: A                        │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  ⚠️ This batch is still editable. Review details before committing.        │
│                                                                              │
│                              [Edit] [Delete] [Commit Now (Lock)]            │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│  After commit, record becomes IMMUTABLE:                                    │
│  • Design reference: locked                                                 │
│  • Material lots: locked                                                    │
│  • Only status transitions allowed                                          │
│  • Corrections create new records, not edits                                │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Four-Eyes Principle in Operations:**

| Authority | Can Create Batch | Can Commit Batch | Notes |
|-----------|------------------|------------------|-------|
| CONTRIBUTOR | ✓ (creates PENDING) | - | Must wait for EDITOR/MANAGER to commit |
| EDITOR | ✓ (creates PENDING) | ✓ | Can commit own batches |
| MANAGER | ✓ (creates PENDING) | ✓ | Can commit any batch |

**Commit Rules:**
- **CONTRIBUTORs** create PENDING batches that require EDITOR/MANAGER approval to commit
- **EDITORs/MANAGERs** can self-commit or let auto-commit handle it
- **Auto-commit**: Batches auto-commit after 1 hour (configurable) if no manual commit
- **Delete**: PENDING batches can be deleted before commit (logged in audit)

**⚠️ Commit-Time Validation (Stale Draft Protection):**

A dangerous race condition exists: Design may release a new version (e.g., safety fix) while a PENDING batch still references an old version. To prevent producing unsafe products:

```typescript
async function commitBatch(batchId: string, committerId: string): Promise<BatchRecord> {
  // Use transaction to ensure atomicity of validation + inventory + commit
  return await prisma.$transaction(async (tx) => {
    const batch = await tx.batchRecord.findUnique({
      where: { id: batchId },
      include: { designVersion: true }
    });

    if (batch.status !== 'PENDING') {
      throw new Error('Batch already committed');
    }

    // VALIDATION 1: Re-validate Design Version at commit time
    const designVersion = batch.designVersion;
    if (designVersion.status === 'ARCHIVED' || designVersion.status === 'REJECTED') {
      throw new CommitValidationError({
        code: 'STALE_DESIGN_VERSION',
        message: `Design v${designVersion.version} is no longer valid (status: ${designVersion.status})`,
        currentDesignVersion: await getCurrentDesignVersion(batch.productId),
        suggestion: 'Update batch to reference current Design version before committing'
      });
    }

    // VALIDATION 2: Reserve inventory (prevent double-spend)
    // Material lots are claimed during PENDING but only deducted at COMMIT
    for (const material of batch.materialLots as MaterialLotAllocation[]) {
      const lot = await tx.materialLot.findUnique({
        where: { id: material.lotId }
      });

      if (!lot) {
        throw new CommitValidationError({
          code: 'MATERIAL_LOT_NOT_FOUND',
          message: `Material lot ${material.lotId} no longer exists`
        });
      }

      if (lot.availableQuantity < material.quantity) {
        throw new CommitValidationError({
          code: 'INSUFFICIENT_INVENTORY',
          message: `Material lot ${lot.lotNumber} has insufficient quantity`,
          details: {
            lotNumber: lot.lotNumber,
            requested: material.quantity,
            available: lot.availableQuantity
          }
        });
      }

      // Deduct inventory atomically within transaction
      await tx.materialLot.update({
        where: { id: material.lotId },
        data: { availableQuantity: { decrement: material.quantity } }
      });
    }

    // All validations passed - commit the batch
    return await tx.batchRecord.update({
      where: { id: batchId },
      data: {
        status: 'COMMITTED',
        committedById: committerId,
        committedAt: new Date(),
        signerDid: await getUserDid(committerId),
        signature: await signBatchRecord(batch),
        signedAt: new Date()
      }
    });
  });
}
```

**Race Condition Timeline:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  STALE DRAFT RACE CONDITION                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  10:00 AM  Operations creates PENDING batch referencing Design v2           │
│       │                                                                      │
│       ▼                                                                      │
│  10:15 AM  Design discovers v2 has safety issue                             │
│       │    → Emergency release of v3                                         │
│       │    → v2 marked ARCHIVED (do not use)                                │
│       │                                                                      │
│       ▼                                                                      │
│  11:00 AM  Operations clicks "Commit" on PENDING batch                      │
│       │                                                                      │
│       ├── WITHOUT validation: ❌ Batch commits with dangerous v2 reference  │
│       │                                                                      │
│       └── WITH validation:    ✅ Commit fails with STALE_DESIGN_VERSION     │
│                               → User must update to v3 first                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Inventory Double-Spend Prevention:**

Material lots are referenced in PENDING batches but inventory is only deducted at COMMIT. Without transactional validation, multiple batches can over-commit the same material:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  INVENTORY DOUBLE-SPEND (PREVENTED)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Material Lot: cotton_lot_801 (100kg available)                             │
│                                                                              │
│  WITHOUT transactional validation:                                           │
│  ───────────────────────────────────                                         │
│  10:00  User A creates PENDING batch #1 (50kg from lot_801)                 │
│  10:05  User B creates PENDING batch #2 (80kg from lot_801)                 │
│  10:10  User A commits batch #1 → Inventory: 100 - 50 = 50kg               │
│  10:15  User B commits batch #2 → Inventory: 50 - 80 = -30kg ❌            │
│                                                                              │
│  WITH transactional validation:                                              │
│  ─────────────────────────────────                                           │
│  10:00  User A creates PENDING batch #1 (50kg from lot_801)                 │
│  10:05  User B creates PENDING batch #2 (80kg from lot_801)                 │
│  10:10  User A commits batch #1 → Inventory: 100 - 50 = 50kg               │
│  10:15  User B tries to commit → INSUFFICIENT_INVENTORY error ✅            │
│         → Must update batch to use different lot or reduce quantity         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Immutable Record Types in Operations (After Commit):**

| Record Type | Editable Until | After Commit |
|-------------|----------------|--------------|
| Batch | PENDING → COMMITTED | Status only (PLANNED → IN_PRODUCTION → COMPLETED) |
| Material Order | PENDING → COMMITTED | Status only (ORDERED → SHIPPED → RECEIVED) |
| EPCIS Event | Never (immutable at capture) | Nothing (append-only by standard) |
| Quality Check | Never (immutable at capture) | Nothing (results are final) |

**Corrections (Not Edits):**
```
Original: Batch #12345, Quantity: 5000
Problem: 2 units damaged in QC

❌ WRONG: Edit quantity to 4998
✅ RIGHT: Create correction record

BatchCorrection {
  batchId: "batch_12345"
  field: "effectiveQuantity"
  originalValue: 5000
  correctedValue: 4998
  reason: "2 units failed final QC"
  evidence: "qc_report_12345.pdf"
  correctedBy: did:key:z6MkOpsLead...
  timestamp: 2026-01-10T16:00:00Z
}
```

### Compliance Workflow (DPP Snapshots)

Compliance creates **immutable DPP snapshots** that capture the workspace data state:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ISSUE DPP                                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Product: Organic Cotton T-Shirt (TSH-001)                                  │
│  Completeness: 100% ✓                                                       │
│                                                                              │
│  This DPP will snapshot:                                                    │
│  ├── Design: v3 (RELEASED Jan 15)                                           │
│  ├── Marketing: v4 (RELEASED Jan 16)                                        │
│  └── Operations: Current state (suppliers, latest batch info)              │
│                                                                              │
│  Previous DPP: v1 (issued Jan 6, based on Design v2 + Marketing v3)        │
│                                                                              │
│  Changes since last DPP:                                                    │
│  • Design: v2 → v3 (fiber composition updated)                              │
│  • Marketing: v3 → v4 (description updated)                                 │
│                                                                              │
│                                                         [Cancel] [Issue]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cross-Workspace Notifications

When upstream workspaces update, downstream workspaces are notified:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CROSS-WORKSPACE NOTIFICATIONS                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  When DESIGN releases v4:                                                   │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  → MARKETING sees:                                                          │
│    "ℹ️ Design updated to v4 for TSH-001"                                    │
│    "Materials changed: 95% → 97% organic cotton"                            │
│    [View Changes]                                                           │
│                                                                              │
│  → OPERATIONS sees:                                                         │
│    "ℹ️ New Design v4 available for TSH-001"                                 │
│    "Your active batches (#12345, #12346) remain on v2"                      │
│    [Use v4 for Next Batch]                                                  │
│                                                                              │
│  → COMPLIANCE sees:                                                         │
│    "⚠️ Design v4 released for TSH-001"                                      │
│    "Current DPP based on Design v3 - review for re-issuance"                │
│    [Review Changes] [Re-issue DPP]                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Workspace Checkout Locking

Checkout locks are **per-workspace** - workspaces don't block each other:

```
Product TSH-001:
├── Design: Being edited by Engineer A     → Other Design users blocked
├── Marketing: Available                   → Marketing can edit freely
├── Operations: N/A (no checkout needed)   → Create records anytime
└── Compliance: N/A (no checkout needed)   → Issue DPP anytime
```

- Checkout lock only affects users **in the same workspace**
- Checkout remains active until user explicitly checks in (releases the lock)
- Admin can force-release a checkout if needed (e.g., user unavailable)

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

  // Relations - Workspace Versions
  designVersionsCreated     DesignVersion[]     @relation("DesignVersionCreator")
  designVersionsReviewed    DesignVersion[]     @relation("DesignVersionReviewer")
  marketingVersionsCreated  MarketingVersion[]  @relation("MarketingVersionCreator")
  marketingVersionsReviewed MarketingVersion[]  @relation("MarketingVersionReviewer")

  // Relations - Operations Records
  batchesCreated            BatchRecord[]       @relation("BatchCreator")
  correctionsCreated        BatchCorrection[]   @relation("CorrectionCreator")
  ordersCreated             MaterialOrder[]     @relation("OrderCreator")

  // Relations - Compliance
  dppsIssued                DPPSnapshot[]       @relation("DPPIssuer")

  // Other relations
  magicLinks                MagicLink[]

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

### Workspace Version Models

Version control is per-workspace. Design and Marketing have formal versions, Operations has immutable records, and Compliance has DPP snapshots.

```prisma
// Shared version status for Design and Marketing
enum VersionStatus {
  DRAFT           // Being edited
  PENDING_REVIEW  // Awaiting approval (CONTRIBUTOR workflow) - not yet claimed
  IN_REVIEW       // Claimed by a specific approver - prevents duplicate reviews
  RELEASED        // Current version, ready for use
  ACTIVE          // Has live references (batches, DPPs) - cannot modify
  ARCHIVED        // No active references, historical only
  REJECTED        // Reviewer rejected, author can revise
}

// ═══════════════════════════════════════════════════════════════════════════
// DESIGN WORKSPACE - Formal Versioning
// ═══════════════════════════════════════════════════════════════════════════

model DesignVersion {
  id              String        @id @default(cuid())
  productId       String
  product         Product       @relation(fields: [productId], references: [id])

  version         Int           // 1, 2, 3...
  status          VersionStatus @default(DRAFT)

  // Design data snapshot
  designData      Json          // { materials, BOM, technicalSpecs, fiberComposition... }

  // Diff from previous version
  changesSummary  String[]      // ["fiberComposition: 90% → 95% cotton"]
  dataDiff        Json?

  // Authorship
  createdById     String
  createdBy       User          @relation("DesignVersionCreator", fields: [createdById], references: [id])
  createdAt       DateTime      @default(now())

  // Review (CONTRIBUTOR workflow with claim system)
  claimedById     String?       // Who claimed this for review (IN_REVIEW state)
  claimedBy       User?         @relation("DesignVersionClaimer", fields: [claimedById], references: [id])
  claimedAt       DateTime?     // When claimed

  reviewedById    String?       // Who approved/rejected
  reviewedBy      User?         @relation("DesignVersionReviewer", fields: [reviewedById], references: [id])
  reviewedAt      DateTime?
  reviewNotes     String?

  // Cryptographic signature
  signedById      String?
  signerDid       String?
  signature       String?
  signedAt        DateTime?

  // References (when ACTIVE, these prevent archiving)
  referencingBatches    BatchRecord[]     @relation("BatchDesignVersion")
  referencingDPPs       DPPSnapshot[]     @relation("DPPDesignVersion")
  referencingMarketing  MarketingVersion[] @relation("MarketingDesignReference")

  @@unique([productId, version])
  @@index([productId, status])
  @@index([createdById])
  @@index([claimedById])
}

// ═══════════════════════════════════════════════════════════════════════════
// MARKETING WORKSPACE - Formal Versioning (Independent)
// ═══════════════════════════════════════════════════════════════════════════

model MarketingVersion {
  id              String        @id @default(cuid())
  productId       String
  product         Product       @relation(fields: [productId], references: [id])

  version         Int           // 1, 2, 3...
  status          VersionStatus @default(DRAFT)

  // Marketing data snapshot
  marketingData   Json          // { name, description, images, price, categories... }

  // Soft link to Design version at time of writing (for sync awareness)
  // This records which Design version was current when Marketing was created/edited
  basedOnDesignVersionId  String?
  basedOnDesignVersion    DesignVersion? @relation("MarketingDesignReference", fields: [basedOnDesignVersionId], references: [id])

  // Diff from previous version
  changesSummary  String[]      // ["price: €49 → €59", "updated description"]
  dataDiff        Json?

  // Authorship
  createdById     String
  createdBy       User          @relation("MarketingVersionCreator", fields: [createdById], references: [id])
  createdAt       DateTime      @default(now())

  // Review (CONTRIBUTOR workflow with claim system)
  claimedById     String?       // Who claimed this for review (IN_REVIEW state)
  claimedBy       User?         @relation("MarketingVersionClaimer", fields: [claimedById], references: [id])
  claimedAt       DateTime?     // When claimed

  reviewedById    String?       // Who approved/rejected
  reviewedBy      User?         @relation("MarketingVersionReviewer", fields: [reviewedById], references: [id])
  reviewedAt      DateTime?
  reviewNotes     String?

  // Cryptographic signature
  signedById      String?
  signerDid       String?
  signature       String?
  signedAt        DateTime?

  // References (when ACTIVE, these prevent archiving)
  referencingDPPs       DPPSnapshot[]     @relation("DPPMarketingVersion")

  @@unique([productId, version])
  @@index([productId, status])
  @@index([createdById])
  @@index([claimedById])
}

// ═══════════════════════════════════════════════════════════════════════════
// OPERATIONS WORKSPACE - Immutable Records
// ═══════════════════════════════════════════════════════════════════════════

enum BatchStatus {
  PENDING         // Draft state - can be edited until committed
  COMMITTED       // Locked - no edits, ready for production
  PLANNED         // Committed + scheduled for production
  IN_PRODUCTION   // Currently being produced
  COMPLETED       // Production finished
  CANCELLED       // Cancelled (never produced)
}

model BatchRecord {
  id              String        @id @default(cuid())
  batchNumber     String        // Unique within organization, not globally
  productId       String
  product         Product       @relation(fields: [productId], references: [id])
  organizationId  String
  organization    Organization  @relation(fields: [organizationId], references: [id])

  // Design reference (locked after COMMITTED)
  designVersionId String
  designVersion   DesignVersion @relation("BatchDesignVersion", fields: [designVersionId], references: [id])

  // Batch details (editable while PENDING, locked after COMMITTED)
  quantity        Int
  materialLots    Json          // [{ materialId, lotNumber, quantity }]
  productionLine  String?
  plannedStart    DateTime?

  // Status with PENDING draft state
  status          BatchStatus   @default(PENDING)
  statusHistory   Json          // [{ status, timestamp, changedBy }]

  // Commit workflow (four-eyes principle)
  committedById   String?       // EDITOR/MANAGER who committed
  committedBy     User?         @relation("BatchCommitter", fields: [committedById], references: [id])
  committedAt     DateTime?     // When locked
  autoCommitAt    DateTime?     // Auto-commit deadline (default: 1 hour after creation)

  // Authorship
  createdById     String
  createdBy       User          @relation("BatchCreator", fields: [createdById], references: [id])
  createdAt       DateTime      @default(now())

  // Cryptographic signature at commit (not creation)
  signerDid       String?
  signature       String?
  signedAt        DateTime?

  // Linked records
  corrections     BatchCorrection[]
  epcisEvents     EPCISEvent[]

  @@unique([organizationId, batchNumber])  // Scoped uniqueness - prevents cross-tenant collision
  @@index([productId])
  @@index([organizationId])
  @@index([status])
}

model BatchCorrection {
  id              String        @id @default(cuid())
  batchId         String
  batch           BatchRecord   @relation(fields: [batchId], references: [id])

  field           String        // "effectiveQuantity", "status", etc.
  originalValue   Json
  correctedValue  Json
  reason          String
  evidence        String?       // File reference

  correctedById   String
  correctedBy     User          @relation("CorrectionCreator", fields: [correctedById], references: [id])
  correctedAt     DateTime      @default(now())

  signerDid       String?
  signature       String?

  @@index([batchId])
}

enum MaterialOrderStatus {
  ORDERED
  SHIPPED
  RECEIVED
  CANCELLED
}

model MaterialOrder {
  id              String              @id @default(cuid())
  orderNumber     String              // Unique within organization, not globally
  productId       String?             // Optional: may be for general stock
  product         Product?            @relation(fields: [productId], references: [id])
  organizationId  String
  organization    Organization        @relation(fields: [organizationId], references: [id])

  // Locked Design reference (if for specific product)
  designVersionId String?

  // Order details (immutable after creation)
  items           Json                // [{ materialId, quantity, unit, supplierId }]
  supplierId      String
  orderedAt       DateTime            @default(now())

  // Status (only field that can change)
  status          MaterialOrderStatus @default(ORDERED)
  statusHistory   Json                // [{ status, timestamp, changedBy }]

  createdById     String
  createdBy       User                @relation("OrderCreator", fields: [createdById], references: [id])
  createdAt       DateTime            @default(now())

  signerDid       String?
  signature       String?

  @@unique([organizationId, orderNumber])  // Scoped uniqueness - prevents cross-tenant collision
  @@index([productId])
  @@index([organizationId])
  @@index([supplierId])
}

// EPCIS events are fully immutable (GS1 standard)
model EPCISEvent {
  id              String        @id @default(cuid())
  eventId         String        @unique  // GS1 eventID
  eventType       String        // ObjectEvent, AggregationEvent, TransactionEvent, etc.
  eventTime       DateTime
  eventTimeZone   String

  batchId         String?
  batch           BatchRecord?  @relation(fields: [batchId], references: [id])
  productId       String?
  organizationId  String

  // Full EPCIS event data (immutable)
  eventData       Json

  // Capture info
  capturedAt      DateTime      @default(now())
  capturedById    String?

  @@index([batchId])
  @@index([productId])
  @@index([eventType])
}
```

**EPCIS Event Generation Rule (Preventing Ghost Data):**

GS1 EPCIS events represent *physical reality* - they track what actually happened to products. Creating EPCIS events for batches that were never produced violates the standard's integrity.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  EPCIS GHOST DATA PREVENTION                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ❌ WRONG: Generate EPCIS on batch creation (PENDING state)                 │
│                                                                              │
│     User creates batch → EPCIS ObjectEvent created                          │
│     User deletes batch → Cascade delete EPCIS event ← VIOLATES WRITE-ONCE   │
│                       → OR: Orphaned event for non-existent batch           │
│                                                                              │
│  ✅ CORRECT: Generate EPCIS only on COMMIT                                  │
│                                                                              │
│     User creates batch → PENDING (no EPCIS yet - digital scratchpad)        │
│     User edits batch   → Still PENDING (no EPCIS)                           │
│     User commits batch → COMMITTED + EPCIS ObjectEvent created              │
│                          ↳ Physical reality begins here                     │
│                                                                              │
│     User deletes PENDING batch → No EPCIS to worry about                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation Rule:**

```typescript
async function commitBatch(batchId: string, committerId: string): Promise<BatchRecord> {
  return await prisma.$transaction(async (tx) => {
    // ... existing commit validation ...

    // Update batch to COMMITTED
    const batch = await tx.batchRecord.update({
      where: { id: batchId },
      data: {
        status: 'COMMITTED',
        committedById: committerId,
        committedAt: new Date(),
        // ... signature, etc.
      }
    });

    // ONLY NOW create EPCIS event (physical reality begins)
    await tx.ePCISEvent.create({
      data: {
        eventId: generateGS1EventId(),
        eventType: 'ObjectEvent',
        eventTime: new Date(),
        eventTimeZone: batch.timezone,
        batchId: batch.id,
        productId: batch.productId,
        organizationId: batch.organizationId,
        eventData: {
          action: 'ADD',
          bizStep: 'urn:epcglobal:cbv:bizstep:commissioning',
          disposition: 'urn:epcglobal:cbv:disp:active',
          // ... EPCIS event details
        }
      }
    });

    return batch;
  });
}

// NEVER do this:
async function createBatch_WRONG(...) {
  const batch = await prisma.batchRecord.create({ ... });
  await prisma.ePCISEvent.create({ ... });  // ❌ Too early!
  return batch;
}
```

**Why This Matters:**

| Scenario | Without Rule | With Rule |
|----------|--------------|-----------|
| Batch created then deleted | Orphaned EPCIS or cascade delete (violates immutability) | No EPCIS exists - clean delete |
| Batch created, edited 5x, committed | 6 EPCIS events? Or overwrite? | 1 EPCIS event at commit |
| Audit trail | "ObjectCreated" for batches never produced | Only real physical events |

```prisma
// ═══════════════════════════════════════════════════════════════════════════
// COMPLIANCE WORKSPACE - Immutable DPP Snapshots
// ═══════════════════════════════════════════════════════════════════════════

enum DPPStatus {
  ACTIVE
  SUPERSEDED
  REVOKED
}

model DPPSnapshot {
  id              String        @id @default(cuid())
  productId       String
  product         Product       @relation(fields: [productId], references: [id])
  organizationId  String

  version         Int           // 1, 2, 3...
  status          DPPStatus     @default(ACTIVE)

  // Version references at time of issuance (immutable)
  designVersionId   String
  designVersion     DesignVersion   @relation("DPPDesignVersion", fields: [designVersionId], references: [id])
  marketingVersionId String
  marketingVersion  MarketingVersion @relation("DPPMarketingVersion", fields: [marketingVersionId], references: [id])

  // Full snapshot of workspace data at issuance
  snapshotData    Json          // Complete product data at issuance
  snapshotHash    String        // Hash of snapshotData for integrity

  // The actual DPP credential
  credentialId    String?       // Reference to issued VC
  credentialData  Json?         // The Verifiable Credential

  // Issuance
  issuedById      String
  issuedBy        User          @relation("DPPIssuer", fields: [issuedById], references: [id])
  issuedAt        DateTime      @default(now())

  // Organization signature
  signerDid       String        // Organization DID
  signature       String        // JWS of the DPP

  // Superseded info
  supersededById  String?       // DPPSnapshot that replaced this one
  supersededAt    DateTime?

  @@unique([productId, version])
  @@index([productId, status])
  @@index([organizationId])
}
```

### Product Model Extensions

```prisma
model Product {
  // ... existing fields ...

  // ═══════════════════════════════════════════════════════════════════════
  // DESIGN VERSION CONTROL
  // ═══════════════════════════════════════════════════════════════════════
  currentDesignVersionId  String?
  currentDesignVersion    DesignVersion?    @relation("CurrentDesignVersion", fields: [currentDesignVersionId], references: [id])
  draftDesignVersionId    String?
  draftDesignVersion      DesignVersion?    @relation("DraftDesignVersion", fields: [draftDesignVersionId], references: [id])
  designVersions          DesignVersion[]

  // Design checkout lock
  designCheckedOutById    String?
  designCheckedOutBy      User?             @relation("DesignCheckout", fields: [designCheckedOutById], references: [id])
  designCheckedOutAt      DateTime?

  // ═══════════════════════════════════════════════════════════════════════
  // MARKETING VERSION CONTROL
  // ═══════════════════════════════════════════════════════════════════════
  currentMarketingVersionId  String?
  currentMarketingVersion    MarketingVersion? @relation("CurrentMarketingVersion", fields: [currentMarketingVersionId], references: [id])
  draftMarketingVersionId    String?
  draftMarketingVersion      MarketingVersion? @relation("DraftMarketingVersion", fields: [draftMarketingVersionId], references: [id])
  marketingVersions          MarketingVersion[]

  // Marketing checkout lock
  marketingCheckedOutById    String?
  marketingCheckedOutBy      User?             @relation("MarketingCheckout", fields: [marketingCheckedOutById], references: [id])
  marketingCheckedOutAt      DateTime?

  // ═══════════════════════════════════════════════════════════════════════
  // OPERATIONS (Immutable Records - no checkout needed)
  // ═══════════════════════════════════════════════════════════════════════
  batches         BatchRecord[]
  materialOrders  MaterialOrder[]

  // ═══════════════════════════════════════════════════════════════════════
  // COMPLIANCE (DPP Snapshots)
  // ═══════════════════════════════════════════════════════════════════════
  dppSnapshots    DPPSnapshot[]
  currentDPPId    String?
  currentDPP      DPPSnapshot?      @relation("CurrentDPP", fields: [currentDPPId], references: [id])
}
```

### MagicLink Model

```prisma
model MagicLink {
  id              String    @id @default(cuid())

  // SECURITY: Store hash, not plaintext token
  // Generate: token = crypto.randomBytes(32).toString('hex')
  // Store:    tokenHash = SHA256(token)
  // Lookup:   findUnique({ where: { tokenHash: SHA256(providedToken) } })
  tokenHash       String    @unique  // SHA256 hash of the actual token

  userId          String
  user            User      @relation(fields: [userId], references: [id])

  // Expiry (null = never expires)
  expiresAt       DateTime?

  // Usage tracking
  usedAt          DateTime?
  revokedAt       DateTime?

  createdAt       DateTime  @default(now())

  @@index([tokenHash])
  @@index([userId])
}
```

**Magic Link Token Security:**

```typescript
import crypto from 'crypto';

// Generate a magic link (returns the UNHASHED token to send to user)
async function createMagicLink(userId: string, expiresAt?: Date): Promise<string> {
  // Generate cryptographically secure random token
  const token = crypto.randomBytes(32).toString('hex');

  // Hash before storing (like passwords)
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  await prisma.magicLink.create({
    data: {
      tokenHash,  // Store ONLY the hash
      userId,
      expiresAt,
    }
  });

  // Return unhashed token (sent to user via email, never stored)
  return token;
}

// Verify a magic link (user provides unhashed token from email)
async function verifyMagicLink(providedToken: string): Promise<MagicLink | null> {
  // Hash the provided token to look it up
  const tokenHash = crypto.createHash('sha256').update(providedToken).digest('hex');

  const magicLink = await prisma.magicLink.findUnique({
    where: { tokenHash },
    include: { user: true }
  });

  if (!magicLink) return null;
  if (magicLink.usedAt) return null;  // Already used
  if (magicLink.revokedAt) return null;  // Revoked
  if (magicLink.expiresAt && magicLink.expiresAt < new Date()) return null;  // Expired

  // Mark as used
  await prisma.magicLink.update({
    where: { id: magicLink.id },
    data: { usedAt: new Date() }
  });

  return magicLink;
}
```

**Why Hash Magic Link Tokens?**

| Attack | Plaintext Tokens | Hashed Tokens |
|--------|------------------|---------------|
| Database breach | Attacker gets all valid tokens, can impersonate any user | Attacker gets hashes, cannot derive original tokens |
| SQL injection | Same as above | Same protection |
| Backup exposure | Tokens in backups are exploitable | Hashes in backups are useless without original |
| Log exposure | Tokens might appear in query logs | Only hashes appear (useless) |

```prisma
model MagicLinkSettings {
  id                  String       @id @default(cuid())
  organizationId      String       @unique
  organization        Organization @relation(fields: [organizationId], references: [id])

  // Defaults for new magic links (secure defaults)
  defaultGuestExpiryDays         Int      @default(30)   // Guest Partners: 30 days
  defaultTransactionalExpiryDays Int      @default(7)    // Transactional: 7 days
  maxExpiryDays                  Int?                     // null = no limit (admin can set longer)
  allowNeverExpires              Boolean  @default(false) // Require explicit opt-in for no expiry
  allowCustomExpiry              Boolean  @default(true)
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

### UserDIDHistory Model

Tracks DID changes over time to enable historical signature verification when users rotate keys.

```prisma
model UserDIDHistory {
  id              String    @id @default(cuid())
  userId          String
  user            User      @relation(fields: [userId], references: [id])
  organizationId  String

  // The DID that was active
  did             String
  keyId           String?   // Reference in walt.id Custodian

  // Validity period
  validFrom       DateTime  @default(now())  // When this DID became active
  validTo         DateTime?                   // When replaced (null = current)

  // Rotation metadata
  rotationReason  String?   // "key_compromise", "routine", "user_request"
  rotatedById     String?   // Who initiated the rotation
  rotatedAt       DateTime?

  createdAt       DateTime  @default(now())

  @@index([userId])
  @@index([did])
  @@index([organizationId, validFrom])
}
```

**DID Rotation Workflow:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DID ROTATION (Key Rotation)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. User or Admin requests key rotation                                      │
│     └── Reasons: suspected compromise, routine policy, user request         │
│                                                                              │
│  2. System generates new did:key via walt.id                                │
│                                                                              │
│  3. UserDIDHistory entry created:                                           │
│     └── Old DID: validTo = now()                                            │
│     └── New DID: validFrom = now(), validTo = null                          │
│                                                                              │
│  4. User.did updated to new DID                                             │
│                                                                              │
│  5. Historical signatures remain valid:                                     │
│     └── Verify against UserDIDHistory using signature timestamp             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Signature Verification with DID History:**

```typescript
async function verifyHistoricalSignature(
  signature: string,
  signerDid: string,
  signedAt: DateTime,
  userId: string
): Promise<VerificationResult> {
  // Find the DID that was valid at the time of signing
  const didRecord = await prisma.userDIDHistory.findFirst({
    where: {
      userId,
      did: signerDid,
      validFrom: { lte: signedAt },
      OR: [
        { validTo: null },           // Still current
        { validTo: { gte: signedAt }} // Was valid at signing time
      ]
    }
  });

  if (!didRecord) {
    return { valid: false, reason: 'DID not found in history for signing time' };
  }

  // Verify the signature using the historical DID
  return await verifyJws(signature, signerDid);
}
```

### TransactionalSignatureLog Model (Non-Repudiation for Ephemeral DIDs)

Transactional Partners use **ephemeral did:key** generated per session. These keys are deleted after the session, creating a legal audit gap: we have a valid signature but cannot trace it back to a person.

**The Problem:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TRANSACTIONAL IDENTITY BLACK HOLE                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Year 1: Lab technician signs toxicity test via Magic Link                  │
│          → Ephemeral did:key:z6Mk... generated for session                  │
│          → Signs "PASS" attestation                                         │
│          → Session ends, key deleted from wallet                            │
│                                                                              │
│  Year 3: Product causes lawsuit, need to prove who signed                   │
│          → Have signature: ✓                                                │
│          → Have DID in signature: ✓                                         │
│          → Can verify signature is valid: ✓                                 │
│          → Can prove WHICH PERSON held that key: ❌                         │
│                                                                              │
│  Without TransactionalSignatureLog, the signature is legally orphaned.      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**The Solution:**

```prisma
model TransactionalSignatureLog {
  id                String    @id @default(cuid())

  // The ephemeral DID used for signing (stored permanently even after key deletion)
  ephemeralDid      String
  ephemeralKeyId    String?   // Reference to key (may be deleted from wallet)

  // Link to the magic link session that created this DID
  magicLinkId       String
  magicLink         MagicLink @relation(fields: [magicLinkId], references: [id])

  // Identity snapshot at time of signing (PERMANENT, non-purgeable)
  signerEmail       String
  signerName        String?
  signerCompany     String?
  signerIpAddress   String
  signerUserAgent   String

  // What was signed
  signedResourceType  String    // "Attestation", "TestResult", "MaterialCertification"
  signedResourceId    String
  signaturePayload    String    // Hash of what was signed
  signature           String    // The actual signature

  // Timestamp
  signedAt          DateTime  @default(now())

  // Legal retention (NEVER auto-purge)
  retentionYears    Int       @default(10)  // ESPR requires 10+ years
  isPurgeable       Boolean   @default(false)  // System flag: false = never auto-delete

  @@index([ephemeralDid])
  @@index([signerEmail])
  @@index([signedResourceType, signedResourceId])
  @@index([magicLinkId])
}
```

**Enforcement Rules:**

1. **Mandatory Logging**: When a Transactional User performs ANY signing action, the system MUST create a TransactionalSignatureLog entry BEFORE the signature is issued
2. **Non-Purgeable**: These records are exempt from data retention cleanup jobs (`isPurgeable: false`)
3. **Identity Snapshot**: Email, IP, User-Agent captured at signing time (not just user ID reference)
4. **Magic Link Association**: Links back to the specific session that granted access

**Verification with Ephemeral DIDs:**

```typescript
async function verifyTransactionalSignature(
  signature: string,
  ephemeralDid: string,
  signedAt: DateTime,
  resourceId: string
): Promise<TransactionalVerificationResult> {
  // 1. Verify signature is cryptographically valid
  const cryptoValid = await verifyJws(signature, ephemeralDid);
  if (!cryptoValid) {
    return { valid: false, reason: 'Invalid signature' };
  }

  // 2. Find the identity behind this ephemeral DID
  const sigLog = await prisma.transactionalSignatureLog.findFirst({
    where: {
      ephemeralDid,
      signedResourceId: resourceId,
      signedAt: { gte: subMinutes(signedAt, 1), lte: addMinutes(signedAt, 1) }
    },
    include: { magicLink: true }
  });

  if (!sigLog) {
    return {
      valid: true,  // Signature is valid
      identityKnown: false,  // But we don't know who
      reason: 'No TransactionalSignatureLog found for this DID'
    };
  }

  // 3. Return full audit trail
  return {
    valid: true,
    identityKnown: true,
    signer: {
      email: sigLog.signerEmail,
      name: sigLog.signerName,
      company: sigLog.signerCompany,
      ip: sigLog.signerIpAddress,
      sessionId: sigLog.magicLinkId
    },
    signedAt: sigLog.signedAt
  };
}
```

**GDPR Article 17 vs. Non-Repudiation:**

The `isPurgeable: false` flag creates a tension with GDPR's Right to Erasure. A user could request deletion of their data, but we legally need the signature audit trail.

**Resolution: Pseudonymization (not Deletion)**

When a GDPR deletion request is received for a signer's email:

```typescript
async function handleGdprDeletionRequest(
  email: string,
  gdprRequestId: string
): Promise<void> {
  const placeholder = `REDACTED_GDPR_REQ_${gdprRequestId}`;

  // Pseudonymize PII fields while preserving the audit trail
  await prisma.transactionalSignatureLog.updateMany({
    where: { signerEmail: email },
    data: {
      signerEmail: placeholder,
      signerName: placeholder,
      signerCompany: placeholder,
      signerIpAddress: 'REDACTED',
      signerUserAgent: 'REDACTED',
      // PRESERVE: ephemeralDid, signature, signaturePayload, signedAt
      // These are cryptographic evidence, not PII
    }
  });

  // Log the pseudonymization for compliance
  await auditLog.create({
    action: 'gdpr.pseudonymization',
    resourceType: 'TransactionalSignatureLog',
    details: {
      originalEmail: '[REDACTED]',  // Don't log the actual email
      gdprRequestId,
      recordsAffected: await prisma.transactionalSignatureLog.count({
        where: { signerEmail: placeholder }
      })
    }
  });
}
```

**Why Pseudonymization Works:**

| Requirement | Deletion | Pseudonymization |
|-------------|----------|------------------|
| GDPR Article 17 (Right to Erasure) | ✅ Compliant | ✅ Compliant (Recital 26: pseudonymous data not "personal data") |
| ESPR 10-year retention | ❌ Violated | ✅ Record preserved |
| Non-repudiation | ❌ Lost forever | ✅ Signature + DID still valid |
| Audit trail | ❌ Broken | ✅ Intact (we know WHEN and WHAT, just not WHO) |

**Key Legal Basis:**
- GDPR Recital 26: Data rendered anonymous is no longer "personal data"
- ESPR Article 9: Requires 10-year data retention for DPPs
- Pseudonymization satisfies both: user identity is erased, but the cryptographic record proving "someone authorized signed this" remains

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

When a CONTRIBUTOR submits a version for review, it needs to be routed to an appropriate approver **within the same workspace**. To prevent the "bystander effect" (multiple approvers notified, none act), we use a **claim system**.

### Claim-Based Approval Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  APPROVAL STATE MACHINE                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PENDING_REVIEW ──────────────────────────────────────────────────────────  │
│  │ • Visible to all eligible approvers in workspace                         │
│  │ • Multiple people notified                                               │
│  │ • First to claim "wins"                                                  │
│  │                                                                          │
│  │  [Claim for Review]                                                      │
│  │         │                                                                │
│  ▼         ▼                                                                │
│  IN_REVIEW ───────────────────────────────────────────────────────────────  │
│  │ • Claimed by specific approver                                           │
│  │ • Other approvers see "Being reviewed by Sarah Chen"                     │
│  │ • Claim expires after configurable period (default: 24h, org-settable)  │
│  │                                                                          │
│  │  [Approve] [Reject] [Release Claim]                                      │
│  │      │         │          │                                              │
│  ▼      ▼         ▼          ▼                                              │
│  RELEASED     REJECTED    PENDING_REVIEW                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Routing Logic

```typescript
async function routeForApproval(
  version: ProductVersion,
  requester: User,
  workspace: Workspace
): Promise<void> {
  // Set to PENDING_REVIEW - visible to all eligible approvers

  // 1. Find all EDITOR/MANAGER users with access to this workspace
  const approvers = await findUsersWithWorkspaceAccess({
    organizationId: requester.organizationId,
    workspace: workspace,
    authority: { in: ['EDITOR', 'MANAGER'] },
    isActive: true,
  });

  if (approvers.length === 0) {
    throw new Error(`No approvers available for ${workspace} workspace`);
  }

  // 2. Update version status
  await prisma.designVersion.update({
    where: { id: version.id },
    data: { status: 'PENDING_REVIEW' }
  });

  // 3. Notify all eligible approvers
  await notifyApprovers(approvers, version);
}

async function claimForReview(
  versionId: string,
  claimerId: User
): Promise<void> {
  // Atomic claim - prevents race conditions
  const result = await prisma.designVersion.updateMany({
    where: {
      id: versionId,
      status: 'PENDING_REVIEW',  // Only claim if still pending
      claimedById: null          // Not already claimed
    },
    data: {
      status: 'IN_REVIEW',
      claimedById: claimerId,
      claimedAt: new Date()
    }
  });

  if (result.count === 0) {
    throw new Error('Version already claimed or not pending review');
  }

  // Notify author that review has started
  await notifyAuthor(versionId, 'Review started by ' + claimer.name);
}

async function releaseClaimExpired(): Promise<void> {
  // SCALABLE: Single database query instead of iterating organizations
  // Uses raw SQL with JOIN to respect per-org claimExpiryHours settings
  // Scales O(1) with number of organizations, not O(n)

  await prisma.$executeRaw`
    UPDATE "DesignVersion" dv
    SET status = 'PENDING_REVIEW',
        "claimedById" = NULL,
        "claimedAt" = NULL
    FROM "Product" p
    JOIN "Organization" o ON p."organizationId" = o.id
    WHERE dv."productId" = p.id
      AND dv.status = 'IN_REVIEW'
      AND dv."claimedAt" < NOW() - INTERVAL '1 hour' * COALESCE(
        (o.settings->>'claimExpiryHours')::int,
        24  -- default
      )
  `;

  await prisma.$executeRaw`
    UPDATE "MarketingVersion" mv
    SET status = 'PENDING_REVIEW',
        "claimedById" = NULL,
        "claimedAt" = NULL
    FROM "Product" p
    JOIN "Organization" o ON p."organizationId" = o.id
    WHERE mv."productId" = p.id
      AND mv.status = 'IN_REVIEW'
      AND mv."claimedAt" < NOW() - INTERVAL '1 hour' * COALESCE(
        (o.settings->>'claimExpiryHours')::int,
        24  -- default
      )
  `;
}

// SCALABILITY NOTE:
// The original implementation looped through organizations:
//   for (const org of organizations) { ... }  // O(n) - crashes at scale
//
// The new implementation uses database-level JOINs:
//   Single query with JOIN to Organization  // O(1) - scales to millions
//
// At 5,000 organizations:
//   OLD: 5,000 queries, memory for 5,000 org objects, potential timeouts
//   NEW: 2 queries total, constant memory, sub-second execution
```

### Approval Inbox

Approvers see pending versions in their inbox, filtered by the workspaces they have EDITOR/MANAGER access to:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  APPROVAL INBOX                                              3 items        │
│  Filter: [All Workspaces ▼]                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [DESIGN] Organic Cotton T-Shirt (TSH-001)          ⏳ PENDING REVIEW    ││
│  │ Submitted by: Maria Garcia (CONTRIBUTOR) • 2 hours ago                  ││
│  │ Changes: materials.fiberComposition (90% → 95%), BOM updates            ││
│  │ [View Diff] [Claim for Review]                                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [MARKETING] Denim Jacket (JKT-042)                 🔒 IN REVIEW         ││
│  │ Submitted by: External Agency (CONTRIBUTOR) • 5 hours ago               ││
│  │ Being reviewed by: John Smith (claimed 1 hour ago)                      ││
│  │ [View Diff] (Cannot claim - already being reviewed)                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │ [MARKETING] Summer Collection Banner               🔒 IN REVIEW (YOURS) ││
│  │ Submitted by: Maria Garcia (CONTRIBUTOR) • 3 hours ago                  ││
│  │ You claimed this for review                                             ││
│  │ [View Diff] [Approve] [Reject] [Release Claim]                          ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Claim System Benefits:**
- **Prevents bystander effect**: Someone must explicitly claim ownership
- **Clear accountability**: One person responsible for each review
- **Auto-release**: Stale claims released after configurable period (see below)
- **Visibility**: Everyone sees who is reviewing what

**Configurable Claim Expiry (Weekend Trap Prevention):**

Organizations can configure `claimExpiryHours` in their settings to handle:
- Complex reviews requiring multiple days
- Weekend/holiday coverage
- Teams in different time zones

| Setting | Default | Range | Use Case |
|---------|---------|-------|----------|
| `claimExpiryHours` | 24 | 4-168 | Hours before unclaimed review returns to queue |

```typescript
// Organization settings (in Organization.settings JSON)
interface OrganizationSettings {
  claimExpiryHours: number;           // Default: 24, max: 168 (7 days)
  requireClaimJustification: boolean; // Require note when claiming for >48h
  autoNotifyOnClaimExpiry: boolean;   // Email claimant before expiry
}
```

**Example:** A legal compliance review claimed Friday 4 PM with 72-hour expiry won't auto-release until Monday 4 PM.

**Note:**
- Users only see approvals for workspaces where they have EDITOR or MANAGER authority
- Only Design and Marketing have version approvals (CONTRIBUTOR workflow)
- Operations uses four-eyes commit workflow instead (CONTRIBUTOR creates → EDITOR/MANAGER commits)

### Founder Mode UI (Preventing Self-Review Deadlock)

In a 1-person startup, the founder is both the author and the only MANAGER. The CONTRIBUTOR workflow (Submit → Review → Approve) creates a UX deadlock if the founder accidentally submits their own work for review - they'd be requesting approval from themselves.

**The Problem:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  FOUNDER MODE DEADLOCK                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1-Person Company: Founder (MANAGER in all workspaces)                       │
│                                                                              │
│  ❌ WRONG UI: Shows both buttons                                            │
│                                                                              │
│     [Submit for Review]  [Release Version]                                  │
│                                                                              │
│     Founder clicks "Submit for Review"                                       │
│     → Version enters PENDING_REVIEW                                         │
│     → System routes to EDITOR/MANAGER approvers                             │
│     → Only approver is... the Founder                                        │
│     → Founder must switch to "Approver mode" to approve own work            │
│     → Confusing UX loop                                                      │
│                                                                              │
│  ✅ CORRECT UI: Authority-based button rendering                            │
│                                                                              │
│     if (user.authority >= EDITOR):  [Release Version]   ← Direct publish    │
│     if (user.authority == CONTRIB): [Submit for Review] ← Route to approver │
│                                                                              │
│     NEVER show both buttons to the same user                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Implementation Rule:**

```typescript
// UI button rendering logic
function getVersionActionButton(
  user: User,
  version: DesignVersion,
  workspace: Workspace
): ActionButton {
  const userAuthority = getUserWorkspaceAuthority(user, workspace);

  // EDITOR and MANAGER can self-sign/release - no approval needed
  if (userAuthority === 'EDITOR' || userAuthority === 'MANAGER') {
    return {
      label: 'Release Version',
      action: 'release',
      tooltip: 'Sign and publish this version directly'
    };
  }

  // CONTRIBUTOR must submit for review
  if (userAuthority === 'CONTRIBUTOR') {
    return {
      label: 'Submit for Review',
      action: 'submit_for_review',
      tooltip: 'Send to an Editor or Manager for approval'
    };
  }

  // VIEWER cannot modify
  return null;
}

// NEVER do this:
function getVersionActionButtons_WRONG(user, version, workspace) {
  return [
    { label: 'Submit for Review', ... },  // ❌ Both buttons shown
    { label: 'Release Version', ... }     // ❌ Confusing for all users
  ];
}
```

**Why This Matters:**

| User Type | Authority | Button Shown | Workflow |
|-----------|-----------|--------------|----------|
| Founder (solo) | MANAGER | "Release Version" | Direct publish, no approval loop |
| Team Lead | EDITOR | "Release Version" | Direct publish (self-trusted) |
| External Agency | CONTRIBUTOR | "Submit for Review" | Routes to internal approvers |
| Intern | CONTRIBUTOR | "Submit for Review" | Routes to internal approvers |
| Auditor | VIEWER | None | Read-only access |

**Product Editor Mode:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PRODUCT EDITOR                                                              │
│  Organic Cotton T-Shirt (TSH-001) • Design Workspace • Draft v4             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Materials:                                                                  │
│  ├── 95% Organic Cotton (GOTS certified)                                    │
│  └── 5% Elastane                                                            │
│                                                                              │
│  [Cancel]                                        [Save Draft] [Release v4]  │
│                                                               ↑              │
│                          MANAGER/EDITOR sees "Release" button ─┘             │
│                                                                              │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                              │
│  [Cancel]                               [Save Draft] [Submit for Review]    │
│                                                               ↑              │
│                       CONTRIBUTOR sees "Submit for Review" button ─┘         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

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
│  Link Expiry:  (•) 30 days (recommended)                                    │
│                ( ) 90 days                                                   │
│                ( ) Custom: [    ] days                                       │
│                ( ) Never expires ⚠️ (requires justification)                │
│                                                                              │
│  ⚠️ "Never expires" requires admin approval and is logged in audit trail.  │
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
POST   /api/v1/approvals/:versionId/claim    # Claim for review (IN_REVIEW)
POST   /api/v1/approvals/:versionId/release  # Release claim (back to PENDING_REVIEW)
POST   /api/v1/approvals/:versionId/approve  # Approve version
POST   /api/v1/approvals/:versionId/reject   # Reject version
```

### Version History

```
GET    /api/v1/products/:id/versions           # List all versions
GET    /api/v1/products/:id/versions/:version  # Get specific version
POST   /api/v1/products/:id/versions/:version/revert  # Revert to version
```

### Operations - Batches

```
POST   /api/v1/batches                  # Create batch (PENDING status)
GET    /api/v1/batches                  # List batches (with status filter)
GET    /api/v1/batches/:id              # Get batch details
PATCH  /api/v1/batches/:id              # Update PENDING batch (fails if committed)
DELETE /api/v1/batches/:id              # Delete PENDING batch (fails if committed)
POST   /api/v1/batches/:id/commit       # Lock batch (PENDING → COMMITTED)
PATCH  /api/v1/batches/:id/status       # Update status (COMMITTED batches only)
POST   /api/v1/batches/:id/corrections  # Add correction record
GET    /api/v1/batches/:id/corrections  # List corrections for batch
```

### Operations - Material Orders

```
POST   /api/v1/material-orders          # Create order (PENDING status)
GET    /api/v1/material-orders          # List orders
GET    /api/v1/material-orders/:id      # Get order details
PATCH  /api/v1/material-orders/:id      # Update PENDING order
DELETE /api/v1/material-orders/:id      # Delete PENDING order
POST   /api/v1/material-orders/:id/commit  # Lock order (PENDING → COMMITTED)
PATCH  /api/v1/material-orders/:id/status  # Update status (COMMITTED orders only)
```

### DID Management

```
GET    /api/v1/users/:id/did            # Get user's current DID
POST   /api/v1/users/:id/did/rotate     # Rotate user's DID (admin only)
GET    /api/v1/users/:id/did/history    # Get DID rotation history
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
| **Magic link security** | Cryptographically random tokens, secure defaults (30-day expiry) |
| **DID ownership** | Users cannot access other users' private keys |
| **Audit completeness** | Every action logged with user context and workspace |
| **Checkout locking** | Prevents concurrent edits, admin can force-release if needed |

### Admin Self-Grant Protection ("Break Glass" Audit)

Admins can modify their own permissions, which creates a potential security concern. To maintain accountability:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ADMIN SELF-GRANT RULES                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  When an admin modifies THEIR OWN permissions:                              │
│                                                                              │
│  1. AUDIT LOG ENTRY (mandatory)                                             │
│     └── action: "admin.self_grant"                                          │
│     └── metadata: { previousAccess, newAccess, justification }              │
│     └── ipAddress, userAgent, timestamp                                     │
│                                                                              │
│  2. EMAIL NOTIFICATION                                                       │
│     └── Sent to ALL other admins in the organization                        │
│     └── Subject: "[Alert] Admin self-grant: Sarah Chen"                     │
│     └── Body: Details of permission change + justification                  │
│                                                                              │
│  3. JUSTIFICATION REQUIRED                                                   │
│     └── UI prompts for reason when admin elevates own permissions           │
│     └── Stored in audit log for compliance review                           │
│                                                                              │
│  4. COOL-OFF PERIOD (optional, configurable)                                │
│     └── Self-granted elevated permissions expire after 24 hours             │
│     └── Must be re-granted by another admin for permanence                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Privilege Escalation Detection (Anti-Collusion):**

The original "self-grant only" detection had a collusion loophole: two admins could grant each other elevated access without triggering alerts. The fix detects ANY privilege escalation to MANAGER.

```typescript
async function updateUserAccess(
  targetUserId: string,
  newAccess: WorkspaceAccess[],
  requesterId: string,
  justification?: string
): Promise<void> {
  const isSelfGrant = targetUserId === requesterId;
  const previousAccess = await getCurrentAccess(targetUserId);

  // ANTI-COLLUSION: Detect ANY privilege escalation, not just self-grants
  const grantsHighPrivilege = newAccess.some(a => a.authority === 'MANAGER');
  const previousHighest = Math.max(...previousAccess.map(a => authorityLevel(a.authority)));
  const newHighest = Math.max(...newAccess.map(a => authorityLevel(a.authority)));
  const isEscalation = newHighest > previousHighest;

  // Trigger alert for ANY privilege escalation to MANAGER (regardless of target)
  if (grantsHighPrivilege && isEscalation) {
    if (!justification || justification.length < 10) {
      throw new Error('Justification required for privilege escalation (min 10 chars)');
    }

    await auditLog.create({
      action: 'admin.privilege_escalation',
      userId: requesterId,
      resourceType: 'User',
      resourceId: targetUserId,
      metadata: {
        targetUser: targetUserId,
        previousAccess,
        newAccess,
        justification,
        isSelfGrant,
        escalationType: isSelfGrant ? 'self_grant' : 'granted_by_other'
      }
    });

    // Notify ALL other admins (anti-collusion measure)
    const otherAdmins = await getOtherAdmins(requesterId);
    const requesterName = await getUserName(requesterId);
    const targetName = await getUserName(targetUserId);

    const subject = isSelfGrant
      ? `[Security Alert] Admin Self-Grant: ${requesterName}`
      : `[Security Alert] Privilege Escalation: ${requesterName} → ${targetName}`;

    await sendSecurityAlert(otherAdmins, subject, {
      requester: requesterName,
      target: targetName,
      newAccess,
      justification
    });
  }

  await prisma.workspaceAccess.updateMany({ ... });
}

function authorityLevel(authority: string): number {
  return { VIEWER: 1, CONTRIBUTOR: 2, EDITOR: 3, MANAGER: 4 }[authority] ?? 0;
}
```

**Collusion Attack Prevention:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  ADMIN COLLUSION ATTACK (PREVENTED)                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  OLD (Self-Grant Only):           NEW (Privilege Escalation):               │
│  ─────────────────────────        ───────────────────────────               │
│  Admin A → Admin B: MANAGER       Admin A → Admin B: MANAGER                │
│  (No alert - not self-grant)      → ⚠️ Alert to ALL other admins            │
│                                                                              │
│  Admin B → Admin A: MANAGER       Admin B → Admin A: MANAGER                │
│  (No alert - not self-grant)      → ⚠️ Alert to ALL other admins            │
│                                                                              │
│  Result: Undetected escalation    Result: Org owner sees both, investigates │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Weekly Admin Review Report:**

Organizations receive a weekly email summarizing:
- All privilege escalation actions (not just self-grants)
- Permission changes by workspace
- Users with elevated permissions

This creates an audit trail for compliance and enables peer review of admin actions.

---

## 13. Related Documentation

| Document | Description |
|----------|-------------|
| [DPP_CONTENT_PLAN.md](./DPP_CONTENT_PLAN.md) | How workspaces contribute to The Hub |
| [SELF_SERVICE_ONBOARDING.md](./SELF_SERVICE_ONBOARDING.md) | Onboarding flow and default workspace assignment |
| [VERIFIABLE_CREDENTIALS.md](./VERIFIABLE_CREDENTIALS.md) | DID hierarchy and VC signing |
| [MULTI_PARTY_ATTESTATION.md](./MULTI_PARTY_ATTESTATION.md) | Third-party contributor workflow |
| [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) | Data export including user DIDs |
| [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) | Full implementation roadmap |

---

*Last Updated: January 12, 2026*

# Self-Service Onboarding Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** SELF_SERVICE_ONBOARDING.md + clarification session

---

## 1. Overview

Self-service onboarding is EuroComply's key differentiator from enterprise competitors (SAP, Siemens).

### Core Principles

| Principle | Implementation |
|-----------|----------------|
| **No sales calls required** | Credit card signup |
| **Same-day compliance** | 15 minutes to first DPP |
| **No IT team needed** | AI-powered data import |
| **Role-based access** | Workspace authorities from day one |

---

## 2. Onboarding Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ONBOARDING FLOW                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  STEP 1: REGISTER                                               │
│  Email + password (via Clerk)                                   │
│  Company name, country, organization type                       │
│  Email verification (Clerk handles)                             │
│                                                                  │
│  STEP 2: SELECT PLAN                                            │
│  ┌───────────┬───────────┬───────────┬───────────┬───────────┐ │
│  │ STARTER   │  GROWTH   │   SCALE   │ENTERPRISE │ PLATFORM  │ │
│  │ €149/mo   │  €299/mo  │  €749/mo  │ €1,999/mo │  Custom   │ │
│  │ 20 users  │  50 users │ 100 users │ 200 users │ Unlimited │ │
│  │+€0.10/DPP │+€0.05/DPP │+€0.02/DPP │+€0.008/DPP│ Custom    │ │
│  └───────────┴───────────┴───────────┴───────────┴───────────┘ │
│                                                                  │
│  STEP 3: PAYMENT                                                │
│  Stripe Checkout (credit card, SEPA, iDEAL)                     │
│  VAT handled automatically (Stripe Tax)                         │
│  Full access granted immediately                                │
│                                                                  │
│  STEP 4: WORKSPACE INTRODUCTION                                 │
│  "What would you like to do first?"                             │
│  → Design (materials, BOMs)                                     │
│  → Operations (inventory, suppliers)                            │
│  → Marketing (product content)                                  │
│  → Compliance (issue DPPs)                                      │
│                                                                  │
│  STEP 5: IMPORT PRODUCTS                                        │
│  AI Import (CSV, Excel, PDF, JSON)                              │
│  Shopify Sync                                                   │
│  Manual creation with templates                                 │
│                                                                  │
│  STEP 6: ISSUE DPPs                                             │
│  Review DPP Ready products                                      │
│  Approve to issue Verifiable Credential                         │
│  QR code and public URL generated                               │
│                                                                  │
│  TOTAL TIME: ~15 minutes                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Founder Permissions

The first user (founder) receives:

| Permission | Value |
|------------|-------|
| Organization Admin | Yes (`isOrganizationAdmin: true`) |
| Design workspace | MANAGER |
| Operations workspace | MANAGER |
| Marketing workspace | MANAGER |
| Compliance workspace | MANAGER |

This allows the founder to:
- Invite team members
- Manage billing
- Access all workspaces
- Configure organization settings
- Export signing keys

---

## 4. Pricing Tiers

> **Note:** User limits protect Clerk MAU costs. Overage is €10/user/month.

| Tier | Base | Per-DPP | Users | User Overage |
|------|------|---------|-------|--------------|
| Starter | €149/mo | €0.10 | 20 | €10/user/mo |
| Growth | €299/mo | €0.05 | 50 | €10/user/mo |
| Scale | €749/mo | €0.02 | 100 | €10/user/mo |
| Enterprise | €1,999/mo | €0.008 | 200 | €10/user/mo |
| Platform | Custom | Custom | Unlimited | Included |

---

## 5. Authentication Integration

### Clerk Handles

- User registration
- Email verification
- Password/magic link login
- Session management
- MFA (TOTP, WebAuthn)

### EuroComply Handles

- Organization creation (after Clerk auth)
- Workspace authority assignment
- Organization Admin designation
- Subscription management

### Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTH + REGISTRATION FLOW                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. User visits app.eurocomply.eu                               │
│  2. Clerk handles signup (email/password or magic link)         │
│  3. Clerk verifies email                                        │
│  4. EuroComply creates organization record                      │
│  5. User selects plan → Stripe Checkout                         │
│  6. Webhook confirms payment → subscription active              │
│  7. User gets Organization Admin + all workspace MANAGER        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Tenant Provisioning

When subscription activates:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT PROVISIONING                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Assign to cell with capacity (~200 tenants/cell)           │
│                                                                  │
│  2. Create dedicated PostgreSQL schema                         │
│     CREATE SCHEMA tenant_{organizationId}                       │
│                                                                  │
│  3. Generate per-tenant encryption key (KMS DEK)               │
│                                                                  │
│  4. Run schema migrations                                       │
│                                                                  │
│  5. Register in routing database                                │
│                                                                  │
│  6. Generate organization signing key (did:key)                │
│     Store in walt.id Custodian                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Tier-Specific Infrastructure

| Tier | Cell Type | Database |
|------|-----------|----------|
| Starter | Shared cell | Schema in shared RDS |
| Growth | Shared cell | Schema in shared RDS |
| Scale | Shared cell | Schema + per-tenant credentials |
| Enterprise | Dedicated instance | Own RDS instance |
| Platform | Dedicated cluster | Multi-AZ RDS + dedicated workers |

---

## 7. Workspace Routing

### Module to Workspace Mapping

| Module | Workspace | Purpose |
|--------|-----------|---------|
| Registry | Design | Product structure, SKUs, GTINs |
| Materials | Design | BOMs, compositions |
| DAM-Tech | Design | Technical documentation |
| Item Tracking | Operations | DynamoDB items, EPCIS events |
| Inventory | Operations | Stock, batches |
| PIM | Marketing | Product content, descriptions |
| DAM-Media | Marketing | Images, videos |
| Syndication | Marketing | Shopify, channels |
| Compliance | Compliance | DPP issuance, review |
| Attestation | All | Third-party contributions |
| Import | All | AI-powered data import |

### Data Flow

```
Design, Operations, Marketing → WRITE to The Hub
Compliance → READS from The Hub to issue DPPs
```

---

## 8. API Endpoints

### Onboarding

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/organizations` | Create organization (after Clerk auth) |
| POST | `/api/v1/billing/checkout` | Create Stripe checkout session |
| POST | `/api/v1/webhooks/stripe` | Handle subscription events |
| GET | `/api/v1/billing/subscription` | Current plan and usage |
| POST | `/api/v1/billing/upgrade` | Upgrade plan |
| POST | `/api/v1/billing/cancel` | Cancel subscription |

### Stripe Webhooks

| Event | Action |
|-------|--------|
| checkout.session.completed | Activate subscription, provision tenant |
| customer.subscription.updated | Update subscription status |
| customer.subscription.deleted | Deactivate subscription |
| invoice.payment_failed | Trigger dunning flow |
| invoice.paid | Track DPP usage billing |

---

## 9. Onboarding UI Routes

```
/onboarding/
├── /register         - Clerk signup component
├── /plan             - Select subscription tier
├── /payment          - Redirects to Stripe Checkout
├── /success          - Payment confirmed, full access
└── /workspace        - Choose starting workspace

/dashboard/
├── /products         - Product management
├── /dpp-ready        - Products at 100% completeness
└── /passports        - Issued DPPs
```

---

## 10. Success Metrics

| Metric | Target |
|--------|--------|
| Time to first product import | < 15 minutes |
| Time from registration to full access | < 10 minutes |
| Payment conversion | > 60% |
| Onboarding completion | > 80% |
| DPP Ready to issuance rate | > 90% |

---

## 11. Changes from Original Document

| Aspect | Original | Design Decision |
|--------|----------|-----------------|
| **Users** | "Unlimited users" | User limits per tier (20/50/100/200) |
| **QR Lifecycle** | DORMANT_HOSTING €99/year option | Removed - 10-year hosting included |
| **Auth** | Custom JWT email verification | Clerk handles email verification |
| **Admin terminology** | "MANAGER + Admin" | Organization Admin + workspace MANAGER |
| **Time estimates** | "Week 1-2" etc. | Removed - no timeline estimates |

---

## 12. Related Documents

| Document | Purpose |
|----------|---------|
| [User Management Design](./2026-01-15-user-management-design.md) | Workspace authorities, Org Admin |
| [Business Model Design](./2026-01-15-business-model-design.md) | Pricing tiers |
| [Billing Design](./2026-01-15-billing-design.md) | Stripe integration, dunning |
| [Security Design](./2026-01-15-security-design.md) | Clerk authentication |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft - aligned with Clerk, user limits, no Dormant Hosting |

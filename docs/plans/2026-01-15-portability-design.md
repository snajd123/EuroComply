# Portability Design

**Status:** Draft
**Date:** 2026-01-15
**Source:** ARCHITECTURE_PORTABILITY.md + clarification session

---

## 1. Overview

EuroComply provides data portability through **self-contained Verifiable Credentials** and **10-year hosting included in the DPP price**.

### Core Principle

**We host. That's it. It's included.**

| Component | Hosting | Duration | Cost |
|-----------|---------|----------|------|
| DPP pages | EuroComply | 10 years | Included in DPP price |
| Status lists | EuroComply | 10 years | Included in DPP price |
| QR code resolution | EuroComply | 10 years | Included in DPP price |

No separate tiers. No archive fees. No complexity.

---

## 2. What Customers Own

```
┌─────────────────────────────────────────────────────────────────┐
│                    DATA OWNERSHIP                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CUSTOMERS OWN:                                                 │
│  • Their Verifiable Credentials (self-contained, all data)     │
│  • Their signing keys (did:key, exportable)                    │
│  • Their product data (exportable anytime)                     │
│                                                                  │
│  WE PROVIDE:                                                    │
│  • 10-year hosting (DPP pages, status lists, images)           │
│  • Signature verification (works forever, offline)             │
│  • Export tools (all tiers, no restrictions)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Verification Model

### What Works When

| Capability | While Active | After Cancel | Forever |
|------------|:------------:|:------------:|:-------:|
| Signature verification | ✅ | ✅ | ✅ |
| Revocation checking | ✅ | ✅ (frozen) | ✅ (10 years) |
| Issue NEW revocations | ✅ | ❌ | ❌ |
| DPP page access | ✅ | ✅ | ✅ (10 years) |
| QR code scanning | ✅ | ✅ | ✅ (10 years) |
| Export data | ✅ | ✅ (30-day grace) | ❌ |

### After Subscription Ends

```
┌─────────────────────────────────────────────────────────────────┐
│                    AFTER CANCELLATION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WHAT CONTINUES WORKING (10 years):                             │
│  • DPP pages load and display correctly                        │
│  • QR codes resolve to DPP pages                               │
│  • Status list returns current revocation state                │
│  • Signature verification (forever, offline)                   │
│                                                                  │
│  WHAT STOPS:                                                    │
│  • Platform access (login, editing)                            │
│  • Issuing NEW DPPs                                            │
│  • Issuing NEW revocations                                     │
│  • API access                                                   │
│                                                                  │
│  STATUS LIST IS FROZEN:                                         │
│  • Existing revocations preserved                              │
│  • Cannot add new revocations                                  │
│  • Verifiers see accurate state at time of cancellation        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Export Package

### Always Available (All Tiers)

```
dpp-export-{org-id}.zip
├── credentials/
│   ├── dpp-001.vc.json       # Signed VC with ALL data
│   └── ...
├── identity/
│   ├── did.json              # DID document
│   └── private-key.jwk       # For self-hosting
├── status-list/
│   └── status-list.vc.json   # Current state
├── products/
│   └── products.json         # All workspace data
├── images/
│   └── ...
├── viewer.html               # Offline viewer
└── manifest.json             # GTIN → VC mapping
```

### What Customers Can Do With Export

| Action | Description |
|--------|-------------|
| **Archive** | Keep a backup of everything |
| **Self-host** | Run their own DPP server |
| **Migrate** | Move to another VC platform |
| **Continue signing** | Issue new VCs with exported keys |
| **Manage revocations** | Host their own status list |

---

## 5. Self-Hosting Option

For customers who want **full control** (can issue revocations after leaving):

```
┌─────────────────────────────────────────────────────────────────┐
│                    SELF-HOSTING PATH                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE LEAVING (while active subscription):                    │
│                                                                  │
│  1. Export everything (VCs, keys, status list)                 │
│  2. Set up your own hosting                                    │
│  3. Deploy status list server                                  │
│  4. Update DNS/redirects                                       │
│                                                                  │
│  AFTER LEAVING:                                                 │
│  • You control the status list                                 │
│  • You can issue new revocations                               │
│  • You pay your own hosting costs                              │
│                                                                  │
│  NOTE: Existing VCs contain EuroComply URLs.                   │
│  Self-hosting requires DNS redirects or re-issuance.           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Most customers won't need this. The 10-year hosting covers typical product lifecycles.

---

## 6. The did:key Advantage

```
┌─────────────────────────────────────────────────────────────────┐
│                    SIGNATURE VERIFICATION                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  did:key makes signatures work FOREVER:                         │
│                                                                  │
│  • Public key IS the identifier (self-contained)               │
│  • No server needed to resolve the DID                         │
│  • Verification works offline                                   │
│  • Works even if EuroComply disappears                         │
│                                                                  │
│  WHAT THIS MEANS:                                               │
│  • "Was this signed by ACME Corp?" → Always answerable         │
│  • "Has this been tampered with?" → Always answerable          │
│  • "Is this revoked?" → Needs status list (we host 10 years)   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Simplified Model

### Before (Complex)

| Scenario | What Happened |
|----------|---------------|
| Active | Full access |
| Cancel + Compliance Archive €99/yr | Status list preserved |
| Cancel + Customer domain | Point CNAME elsewhere |
| Cancel + Nothing | Status list dies |

### After (Simple)

| Scenario | What Happens |
|----------|--------------|
| Active | Full access |
| Cancel | 10-year hosting (frozen), included in DPP price |

**That's it.**

---

## 8. Why This Works

### For Customers

- **No surprise fees** - Everything included upfront
- **No lock-in anxiety** - Data works for 10 years regardless
- **No DNS complexity** - We handle everything
- **Export if needed** - Full self-hosting always possible

### For EuroComply

- **Simple pricing** - No archive tier to manage
- **Clear SLA** - 10 years, period
- **Reduced support** - No migration complexity
- **Cost already collected** - In the per-DPP fee

### For Verifiers

- **Consistent URLs** - Status lists don't move around
- **Reliable access** - 10-year guarantee
- **Clear status** - Frozen = accurate at cancellation time

---

## 9. Edge Cases

| Situation | Resolution |
|-----------|------------|
| Customer wants to revoke after cancel | Must re-subscribe or self-host |
| Product recall after cancel | Re-subscribe, revoke, cancel again |
| EuroComply shuts down | Signatures still work; status lists transferred or frozen |
| Customer acquired by another company | Export and re-import under new org |

---

## 10. Changes from Original Document

| Aspect | Original | Design Decision |
|--------|----------|-----------------|
| **Compliance Archive** | €99-299/year tier | Removed - included in DPP price |
| **Customer-owned domain** | Recommended for portability | Removed - we just host |
| **Migration complexity** | Multiple options, complex | Simplified - we host 10 years |
| **Pricing tables** | Multiple tiers for archive | Removed - one model |

---

## 11. Related Documents

| Document | Purpose |
|----------|---------|
| [Business Model Design](./2026-01-15-business-model-design.md) | DPP pricing includes 10-year hosting |
| [Verifiable Credentials Design](./2026-01-15-verifiable-credentials-design.md) | did:key, Status List 2021 |
| [Data Sovereignty Design](./2026-01-15-data-sovereignty-design.md) | Export, event architecture |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 0.1 | 2026-01-15 | Initial draft - simplified from ARCHITECTURE_PORTABILITY.md |


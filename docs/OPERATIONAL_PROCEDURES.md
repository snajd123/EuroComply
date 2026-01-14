# Operational Procedures

## Overview

This document defines standard operating procedures for EuroComply platform operations, including customer support, account management, incident response, and deployment workflows.

---

## Customer Support Procedures

### Support Channels

| Channel | Response SLA | Hours | Use Case |
|---------|-------------|-------|----------|
| In-app chat | 4 hours | 9am-6pm CET | General questions, how-to |
| Email (support@) | 24 hours | Business days | Account issues, billing |
| Email (security@) | 4 hours | 24/7 | Security concerns |
| Enterprise Slack | 2 hours | Business days | Enterprise customers only |

### Ticket Categories

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPPORT TICKET CATEGORIES                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  BILLING (billing@eurocomply.eu)                                            │
│  ───────────────────────────────                                            │
│  • Invoice requests                                                          │
│  • Payment failures                                                          │
│  • Plan changes                                                              │
│  • Refund requests                                                           │
│                                                                              │
│  TECHNICAL (support@eurocomply.eu)                                          │
│  ─────────────────────────────────                                          │
│  • API issues                                                                │
│  • Import failures                                                           │
│  • DPP generation errors                                                     │
│  • Integration help                                                          │
│                                                                              │
│  ACCOUNT (support@eurocomply.eu)                                            │
│  ────────────────────────────────                                           │
│  • User management                                                           │
│  • Password resets                                                           │
│  • Organization transfers                                                    │
│  • Account deletion                                                          │
│                                                                              │
│  COMPLIANCE (compliance@eurocomply.eu)                                      │
│  ─────────────────────────────────────                                      │
│  • GDPR requests (access, deletion)                                          │
│  • Data export requests                                                      │
│  • DPA requests                                                              │
│  • Audit requests                                                            │
│                                                                              │
│  SECURITY (security@eurocomply.eu)                                          │
│  ─────────────────────────────────                                          │
│  • Vulnerability reports                                                     │
│  • Suspected breaches                                                        │
│  • Key compromise                                                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Escalation Matrix

| Level | Criteria | Handler | Response |
|-------|----------|---------|----------|
| L1 | Standard questions | Support team | Knowledge base, templates |
| L2 | Technical issues | Engineering on-call | Investigation, fix |
| L3 | Critical/Security | Platform lead + CTO | Immediate response |
| Executive | Legal, major complaints | CEO | Within 4 hours |

---

## Account Lifecycle

### New Account Setup

```
Customer signs up → Payment processed → Account created → Welcome email
                                                       → Onboarding guide
                                                       → did:key generated
```

**Automated Steps:**
1. Stripe webhook: `checkout.session.completed`
2. Create Organization record
3. Create Admin User record
4. Generate did:key for organization
5. Send welcome email with:
   - Dashboard link
   - Getting started guide
   - API key (if API access enabled)

### Plan Upgrades

```
┌─────────────────────────────────────────────────────────────────┐
│                    PLAN UPGRADE PROCEDURE                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  SELF-SERVICE (Growth → Scale)                                  │
│  ─────────────────────────────                                  │
│  1. Customer selects new plan in dashboard                      │
│  2. Stripe calculates prorated amount                           │
│  3. Payment charged immediately                                  │
│  4. New limits applied instantly                                 │
│  5. Confirmation email sent                                      │
│                                                                  │
│  ENTERPRISE UPGRADE                                             │
│  ──────────────────                                             │
│  1. Customer contacts sales                                      │
│  2. Custom quote prepared                                        │
│  3. Contract signed                                              │
│  4. Manual plan update by admin                                  │
│  5. Custom limits configured                                     │
│  6. Dedicated onboarding scheduled                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Plan Downgrades

**Self-Service Downgrade:**
1. Customer requests downgrade in dashboard
2. System checks current usage vs new plan limits:
   - Products: Must be at or below new limit
   - Users: Must remove excess users first
   - Features: Warn about features losing access
3. If checks pass: Schedule downgrade for next billing cycle
4. If checks fail: Show blocking message with required actions

**Downgrade Blockers:**
- Product count exceeds new plan limit
- Active Shopify connections (Growth+ only)
- Active API integrations

### Account Cancellation

```
┌─────────────────────────────────────────────────────────────────┐
│                 ACCOUNT CANCELLATION PROCEDURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  CUSTOMER REQUEST:                                              │
│  ─────────────────                                              │
│  1. Customer clicks "Cancel subscription" in billing settings   │
│  2. Survey: Reason for cancellation                             │
│  3. Confirm: "Are you sure?" with data retention info           │
│                                                                  │
│  SYSTEM ACTIONS:                                                │
│  ───────────────                                                │
│  1. Cancel Stripe subscription (end of billing period)          │
│  2. Send cancellation confirmation email                         │
│  3. Schedule account for downgrade to "read-only"               │
│  4. At billing period end:                                       │
│     - Disable write access                                       │
│     - Maintain read access for 30 days                          │
│     - Send "last chance" email at day 25                        │
│                                                                  │
│  DATA HANDLING:                                                 │
│  ─────────────                                                  │
│  • Account data: Deleted after 30 days grace period             │
│  • Product data: Deleted after 30 days                          │
│  • Issued DPPs: RETAINED for 10 years (ESPR requirement)        │
│  • Audit logs: Retained per retention policy                    │
│                                                                  │
│  COMPLIANCE ARCHIVE (Optional):                                 │
│  ─────────────────────────────                                  │
│  Customer can purchase Compliance Archive (€99/year) to:        │
│  • Keep DPPs accessible via QR codes                            │
│  • Maintain revocation capability                               │
│  • Receive ESPR updates affecting their products                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Refund Policy

| Scenario | Refund | Process |
|----------|--------|---------|
| Cancellation within 14 days | Full refund | Automatic |
| Service outage >4 hours | Prorated credit | Support ticket |
| Billing error | Full amount | Automatic on detection |
| Feature dissatisfaction | Case-by-case | Support review |
| Annual plan early cancellation | Prorated | Support ticket |

**Refund Procedure:**
1. Verify refund eligibility
2. Calculate refund amount (Stripe prorations)
3. Process refund via Stripe
4. Send confirmation email
5. Update account status if applicable

---

## GDPR Request Handling

### Access Request (Art. 15)

**Response Time:** 30 days (extendable to 90 days for complex requests)

```
1. Verify requester identity (email match or ID document)
2. Gather all personal data:
   - User profile
   - Organization membership
   - Activity logs
   - Issued passports (metadata only)
3. Generate export package (JSON + human-readable summary)
4. Send via secure link (expires in 7 days)
5. Log request and response
```

### Deletion Request (Art. 17)

**Response Time:** 30 days

```
1. Verify requester identity
2. Check for blocking conditions:
   - Active subscription → Cancel first
   - Legal hold → Cannot delete
   - ESPR retention → DPPs retained
3. If no blockers:
   - Schedule deletion for 30 days
   - Send confirmation with deletion date
   - Allow cancellation during grace period
4. If blockers exist:
   - Explain which data can/cannot be deleted
   - Offer pseudonymization where applicable
   - Document exception rationale
```

See [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) for complete data subject rights procedures.

---

## Incident Management

### Incident Severity Levels

| Severity | Definition | Response Time | Examples |
|----------|------------|---------------|----------|
| P1 - Critical | Service down, data breach | 15 minutes | Full outage, security incident |
| P2 - High | Major feature broken | 1 hour | DPP generation failing |
| P3 - Medium | Degraded performance | 4 hours | Slow API responses |
| P4 - Low | Minor issue | Next business day | UI bug, typo |

### Incident Response Process

```
┌─────────────────────────────────────────────────────────────────┐
│                    INCIDENT RESPONSE FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DETECT                                                      │
│     • Monitoring alert fires                                     │
│     • Customer reports issue                                     │
│     • Team member discovers problem                              │
│                                                                  │
│  2. TRIAGE (within 5 minutes)                                   │
│     • Assign severity level                                      │
│     • Page appropriate responders                                │
│     • Create incident channel (#incident-YYYYMMDD-NN)            │
│                                                                  │
│  3. RESPOND                                                     │
│     • Investigate root cause                                     │
│     • Implement fix or workaround                                │
│     • Update status page                                         │
│     • Communicate with affected customers                        │
│                                                                  │
│  4. RESOLVE                                                     │
│     • Verify fix in production                                   │
│     • Update status page: Resolved                               │
│     • Notify affected customers                                  │
│                                                                  │
│  5. POST-MORTEM (within 48 hours for P1/P2)                     │
│     • Document timeline                                          │
│     • Identify root cause                                        │
│     • Define action items                                        │
│     • Share learnings                                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Communication Templates

**Status Page Update (Investigating):**
```
[Service Name] - Investigating Issues

We are currently investigating reports of [brief description].
Our team is actively working to identify and resolve the issue.

Started: [timestamp]
Last Updated: [timestamp]

We will provide updates as we learn more.
```

**Status Page Update (Resolved):**
```
[Service Name] - Resolved

The issue affecting [service] has been resolved.
[Brief explanation of what happened and fix]

Duration: [start] - [end] ([duration])

We apologize for any inconvenience caused.
```

---

## Deployment Procedures

### Standard Deployment

**Deployment Window:** Tuesday-Thursday, 10:00-16:00 CET

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT CHECKLIST                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRE-DEPLOYMENT:                                                │
│  □ All tests passing in CI                                       │
│  □ Code reviewed and approved                                    │
│  □ Database migrations tested on staging                         │
│  □ Feature flags configured                                      │
│  □ Rollback plan documented                                      │
│  □ On-call engineer available                                    │
│                                                                  │
│  DEPLOYMENT:                                                    │
│  □ Announce deployment in #engineering                           │
│  □ Run deployment script                                         │
│  □ Monitor deployment progress                                   │
│  □ Run smoke tests                                               │
│  □ Verify key metrics                                            │
│                                                                  │
│  POST-DEPLOYMENT:                                               │
│  □ Monitor error rates for 30 minutes                           │
│  □ Check customer-facing functionality                           │
│  □ Update release notes                                          │
│  □ Announce completion in #engineering                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Database Migration Procedure

```bash
# 1. Backup current state
aws rds create-db-snapshot \
  --db-instance-identifier eurocomply-prod \
  --db-snapshot-identifier pre-migration-$(date +%Y%m%d-%H%M)

# 2. Run migration on staging first
npx prisma migrate deploy --preview-feature

# 3. Verify staging
npm run test:integration

# 4. Run migration on production
npx prisma migrate deploy

# 5. Verify production
curl https://api.eurocomply.eu/health
```

### Rollback Procedure

```
┌─────────────────────────────────────────────────────────────────┐
│                    ROLLBACK PROCEDURE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  APPLICATION ROLLBACK:                                          │
│  ─────────────────────                                          │
│  1. Identify last known good version                            │
│  2. Update ECS task definition to previous version              │
│  3. Force new deployment                                        │
│  4. Verify rollback successful                                  │
│                                                                  │
│  DATABASE ROLLBACK:                                             │
│  ──────────────────                                             │
│  1. Stop application writes                                      │
│  2. Restore from pre-migration snapshot                         │
│  3. Point application to restored database                      │
│  4. Resume operations                                            │
│                                                                  │
│  CLOUDFLARE WORKERS ROLLBACK:                                   │
│  ─────────────────────────────                                  │
│  1. wrangler rollback --env production                          │
│  2. Verify worker health                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## On-Call Procedures

### On-Call Rotation

- **Primary:** Responds to all alerts
- **Secondary:** Backup if primary unavailable
- **Rotation:** Weekly, handoff on Mondays 09:00 CET

### On-Call Responsibilities

```
┌─────────────────────────────────────────────────────────────────┐
│                    ON-CALL EXPECTATIONS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  AVAILABILITY:                                                  │
│  • Respond to pages within 15 minutes                           │
│  • Have laptop and internet access                              │
│  • Be able to reach office/VPN within 30 minutes                │
│                                                                  │
│  RESPONSIBILITIES:                                              │
│  • Acknowledge all alerts                                        │
│  • Triage and resolve or escalate                               │
│  • Update status page for customer-facing issues                │
│  • Document incidents                                            │
│  • Hand off unresolved issues at rotation end                   │
│                                                                  │
│  DO NOT:                                                        │
│  • Make major changes without review                            │
│  • Deploy during off-hours (except for hotfixes)                │
│  • Ignore alerts (even if you think they're false positives)    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Alert Response Guide

| Alert | Likely Cause | First Steps |
|-------|-------------|-------------|
| API 5xx rate > 1% | Application error | Check logs, recent deploys |
| Database CPU > 80% | Slow queries | Check active queries, connections |
| DPP serving errors | Cloudflare or R2 | Check Cloudflare status |
| Queue depth growing | Worker issues | Check worker logs, scale up |
| Certificate expiry | Missed renewal | Renew via ACM or Cloudflare |

---

## Routine Maintenance

### Daily Tasks

- [ ] Review overnight alerts
- [ ] Check error rate trends
- [ ] Review support queue
- [ ] Check backup status

### Weekly Tasks

- [ ] Review and close stale tickets
- [ ] Check certificate expirations
- [ ] Review infrastructure costs
- [ ] Update runbooks if needed

### Monthly Tasks

- [ ] Security updates for dependencies
- [ ] Review and rotate API keys
- [ ] Archive old logs
- [ ] Review access permissions

### Quarterly Tasks

- [ ] DR test execution
- [ ] Penetration testing review
- [ ] Capacity planning review
- [ ] SLA performance review

---

## Common Operational Tasks

### Reset User Password

```sql
-- Generate magic link for user
INSERT INTO magic_links (user_id, token, expires_at)
VALUES (
  (SELECT id FROM users WHERE email = 'user@example.com'),
  gen_random_uuid(),
  NOW() + INTERVAL '1 hour'
);
```

### Transfer Organization Ownership

```sql
-- 1. Verify new owner exists and is member
SELECT * FROM organization_members
WHERE organization_id = 'org_xxx' AND user_id = 'user_new';

-- 2. Update owner
UPDATE organizations
SET owner_id = 'user_new', updated_at = NOW()
WHERE id = 'org_xxx';

-- 3. Update roles
UPDATE organization_members
SET role = 'ADMIN'
WHERE organization_id = 'org_xxx' AND user_id = 'user_new';
```

### Regenerate Organization DID

Only in case of key compromise. See [SECURITY.md](./SECURITY.md) for full procedure.

### Force DPP Regeneration

```bash
# For single product
curl -X POST https://api.eurocomply.eu/admin/products/{id}/regenerate-dpp \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# For batch (via SQS)
aws sqs send-message \
  --queue-url $BULK_QUEUE_URL \
  --message-body '{"type":"regenerate","productIds":["prod_1","prod_2"]}'
```

---

## Document Maintenance

| Item | Frequency | Owner |
|------|-----------|-------|
| Review procedures | Quarterly | Operations |
| Update runbooks | After incidents | Engineering |
| Update contacts | Monthly | Operations |
| Test procedures | Quarterly | Operations |

---

*Last Updated: 2026-01-14*

## Related Documentation

- [DISASTER_RECOVERY.md](./DISASTER_RECOVERY.md) - DR procedures
- [SECURITY.md](./SECURITY.md) - Security procedures
- [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) - Data subject rights
- [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) - Exit procedures

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
│  SELF-SERVICE (Starter → Growth → Scale)                        │
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
- Active Shopify connections (all tiers)
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

### Scaling Alert Response Guide

The monitoring module sends scaling alerts to Slack. Each alert links to the relevant runbook in the Architecture Document (Section 9.6).

| Alert | Severity | Response |
|-------|----------|----------|
| `tenant-count-high` (150+) | Warning | Review growth rate, schedule cell provisioning within 2 weeks |
| `tenant-count-high` (180+) | Critical | **Immediate action**: Execute [Section 9.6.1](../EuroComply_Architecture_Document_v1.3.md#961-adding-a-new-database-cell) - Add new database cell |
| `rds-cpu-warning` (60%+) | Warning | Check slow queries, consider query optimization or new cell |
| `rds-cpu-critical` (75%+) | Critical | **Immediate action**: Execute [Section 9.6.1](../EuroComply_Architecture_Document_v1.3.md#961-adding-a-new-database-cell) - Add new database cell |
| `rds-connections-warning` (120+) | Warning | Check connection pooling, application connection leaks |
| `redis-memory-warning` (70%+) | Warning | Review cache TTLs, schedule Redis upgrade |
| `redis-memory-critical` (85%+) | Critical | **Immediate action**: Execute [Section 9.6.2](../EuroComply_Architecture_Document_v1.3.md#962-upgrading-redis-instance) - Upgrade Redis instance |
| `redis-evictions` (10+/hour) | Warning | Cache is full, upgrade Redis instance |
| `nat-bandwidth-warning` (4GB+/hr) | Warning | Monitor bulk processing volume |
| `nat-bandwidth-critical` (8GB+/hr) | Critical | Execute [Section 9.6.4](../EuroComply_Architecture_Document_v1.3.md#964-upgrading-nat-instance-to-nat-gateway) - Upgrade to NAT Gateway |
| `api-tasks-near-max` (8/10) | Warning | Review traffic patterns, consider increasing `api_max_capacity` |
| `api-tasks-at-max` (10/10) | Critical | **Immediate**: Increase `var.api_max_capacity` in Terraform and apply |
| `bulk-workers-at-max` (20/20) | Warning | Increase `var.worker_max_capacity` in Terraform |
| `dlq-warning` (1+ messages) | Warning | Check DLQ processor Lambda logs for failure patterns |
| `dlq-critical` (10+ messages) | Critical | Systematic failure - investigate bulk job data quality |
| `dynamodb-throttle` (any) | Warning | Unusual - check for hot partitions or runaway queries |
| `storage-abuse-warning` (50GB+/day) | Warning | High upload volume detected - investigate potential abuse |

**Storage Abuse Response:**
1. Check S3 access logs to identify which tenant is uploading
2. Review account: Is this legitimate bulk onboarding or potential abuse?
3. If abuse: Terminate account under fair use policy, delete uploaded data
4. If legitimate: Mark tenant as VIP, consider Enterprise upgrade conversation

**Dashboard Access:**
- CloudWatch Dashboard: `eurocomply-production-scaling`
- Direct link available in Slack alert messages

**Escalation:**
1. Warning alerts: Acknowledge in Slack, plan remediation within 24 hours
2. Critical alerts: Immediate response required, notify team lead if >15 minutes

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

## Background Job Deduplication (Scale-Critical)

At scale, multiple worker instances may attempt to run the same scheduled job simultaneously. This section documents distributed locking patterns to prevent duplicate execution.

### Job Types Requiring Deduplication

| Job | Schedule | Impact of Duplicate | Locking Strategy |
|-----|----------|---------------------|------------------|
| Expired checkout release | Every 15m | Double notifications | Redis `SETNX` |
| Outbox event processing | Every 1m | Duplicate events | `FOR UPDATE SKIP LOCKED` |
| Version state transitions | Every 1h | Wrong reference counts | Row-level locks |
| Metrics aggregation | Every 5m | Inflated metrics | Redis `SETNX` |
| Certificate expiry checks | Daily | Duplicate alerts | Redis `SETNX` |
| Stale draft cleanup | Daily | N/A (idempotent) | None needed |

### Redis-Based Distributed Locking

For scheduled jobs that run periodically across multiple workers:

```typescript
// Redis distributed lock for periodic jobs
class DistributedJobLock {
  constructor(private readonly redis: Redis) {}

  /**
   * Acquire lock for a periodic job
   * @param jobName Unique job identifier
   * @param ttlSeconds Lock duration (should exceed max job runtime)
   * @returns Lock token if acquired, null if already running
   */
  async acquire(jobName: string, ttlSeconds: number): Promise<string | null> {
    const lockKey = `job:lock:${jobName}`;
    const lockToken = crypto.randomUUID();

    // SETNX with expiry - atomic operation
    const acquired = await this.redis.set(
      lockKey,
      lockToken,
      'NX',  // Only set if not exists
      'EX',  // Set expiry
      ttlSeconds
    );

    if (acquired === 'OK') {
      return lockToken;
    }

    // Lock already held by another worker
    return null;
  }

  /**
   * Release lock (only if we still own it)
   */
  async release(jobName: string, lockToken: string): Promise<boolean> {
    const lockKey = `job:lock:${jobName}`;

    // Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockToken);
    return result === 1;
  }

  /**
   * Extend lock TTL (for long-running jobs)
   */
  async extend(jobName: string, lockToken: string, ttlSeconds: number): Promise<boolean> {
    const lockKey = `job:lock:${jobName}`;

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("expire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockToken, ttlSeconds);
    return result === 1;
  }
}
```

### Job Wrapper Implementation

```typescript
// Wrapper that handles locking automatically
class DistributedJob {
  constructor(
    private readonly lock: DistributedJobLock,
    private readonly metrics: MetricsClient,
    private readonly logger: Logger
  ) {}

  async run(
    jobName: string,
    job: () => Promise<void>,
    options: { ttlSeconds?: number; extendInterval?: number } = {}
  ): Promise<void> {
    const ttl = options.ttlSeconds || 300; // 5 minute default
    const extendInterval = options.extendInterval || 60000; // 1 minute

    // Attempt to acquire lock
    const lockToken = await this.lock.acquire(jobName, ttl);

    if (!lockToken) {
      this.logger.info('Job already running on another worker', { jobName });
      this.metrics.increment(`job.${jobName}.skipped`);
      return;
    }

    this.logger.info('Acquired lock, starting job', { jobName });
    this.metrics.increment(`job.${jobName}.started`);

    // Set up lock extension for long-running jobs
    const extendTimer = setInterval(async () => {
      const extended = await this.lock.extend(jobName, lockToken, ttl);
      if (!extended) {
        this.logger.warn('Failed to extend lock', { jobName });
      }
    }, extendInterval);

    try {
      await job();
      this.metrics.increment(`job.${jobName}.completed`);
      this.logger.info('Job completed successfully', { jobName });
    } catch (error) {
      this.metrics.increment(`job.${jobName}.failed`);
      this.logger.error('Job failed', { jobName, error: error.message });
      throw error;
    } finally {
      clearInterval(extendTimer);
      await this.lock.release(jobName, lockToken);
    }
  }
}

// Usage
const distributedJob = new DistributedJob(lock, metrics, logger);

// Scheduled with cron or similar
async function runExpiredCheckoutRelease() {
  await distributedJob.run(
    'expired-checkout-release',
    async () => {
      await releaseExpiredCheckouts();
    },
    { ttlSeconds: 600 } // 10 minute max runtime
  );
}
```

### Database Row-Level Locking (Alternative)

For jobs that process specific rows, use `FOR UPDATE SKIP LOCKED`:

```sql
-- Worker 1 and Worker 2 can run simultaneously
-- Each processes different rows

-- Worker 1 gets rows 1-100
SELECT id FROM batch_jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 100
FOR UPDATE SKIP LOCKED;

-- Worker 2 gets rows 101-200 (skips Worker 1's locked rows)
SELECT id FROM batch_jobs
WHERE status = 'pending'
ORDER BY created_at
LIMIT 100
FOR UPDATE SKIP LOCKED;
```

### Monitoring Job Health

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    BACKGROUND JOB HEALTH                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  JOB                          LAST RUN    STATUS    DURATION   NEXT RUN     │
│  ────────────────────────────────────────────────────────────────────────   │
│  expired-checkout-release     2m ago      SUCCESS   12s        13m          │
│  outbox-processor             30s ago     SUCCESS   3s         30s          │
│  version-state-transition     45m ago     SUCCESS   8m         15m          │
│  metrics-aggregation          2m ago      SUCCESS   45s        3m           │
│  certificate-expiry-check     18h ago     SUCCESS   2m         6h           │
│                                                                              │
│  LOCK STATUS:                                                               │
│  • expired-checkout-release: unlocked                                        │
│  • outbox-processor: locked by worker-3 (12s ago)                           │
│  • version-state-transition: unlocked                                        │
│                                                                              │
│  ALERTS:                                                                    │
│  • None                                                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Alert Conditions

| Condition | Severity | Action |
|-----------|----------|--------|
| Job not run in 2x schedule | Warning | Check worker health |
| Job not run in 5x schedule | Critical | Page on-call |
| Lock held > 2x TTL | Warning | Check for stuck job |
| Consecutive failures > 3 | Critical | Page on-call |
| Lock acquisition failures > 10/min | Warning | Check Redis |

### Debugging Stuck Locks

```bash
# Check current locks
redis-cli KEYS "job:lock:*"

# Check lock holder and TTL
redis-cli GET "job:lock:expired-checkout-release"
redis-cli TTL "job:lock:expired-checkout-release"

# Force release stuck lock (emergency only)
redis-cli DEL "job:lock:expired-checkout-release"
```

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

## Multi-Cell Operations

This section covers operational procedures for managing multiple database cells at scale.

### Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MULTI-CELL ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  CELL TOPOLOGY:                                                             │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    CONFIGURATION DATABASE                            │   │
│  │                    (Aurora Global - Single Instance)                 │   │
│  │                                                                      │   │
│  │  • Tenant → Cell mapping                                            │   │
│  │  • Cell health status                                               │   │
│  │  • Global configuration                                             │   │
│  └───────────────────────────┬─────────────────────────────────────────┘   │
│                              │                                              │
│            ┌─────────────────┼─────────────────┐                           │
│            │                 │                 │                           │
│            ▼                 ▼                 ▼                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                     │
│  │   CELL-01    │  │   CELL-02    │  │   CELL-03    │                     │
│  │ (eu-west-1)  │  │ (eu-west-1)  │  │ (eu-central) │                     │
│  │              │  │              │  │              │                     │
│  │ ~200 tenants │  │ ~200 tenants │  │ ~150 tenants │                     │
│  │ PostgreSQL   │  │ PostgreSQL   │  │ PostgreSQL   │                     │
│  │ Redis        │  │ Redis        │  │ Redis        │                     │
│  └──────────────┘  └──────────────┘  └──────────────┘                     │
│                                                                              │
│  CAPACITY PER CELL: ~200 tenants (varies by tenant size)                   │
│  MAX CELLS: Unlimited (provision as needed)                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Cross-Cell Query Capability

Admin dashboards need to query across all cells for aggregate reporting.

#### Federated Query Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FEDERATED QUERY FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ADMIN REQUEST:                                                             │
│  GET /admin/metrics/all-organizations                                       │
│                                                                              │
│  PROCESSING:                                                                │
│                                                                              │
│  1. Admin API receives request                                              │
│     │                                                                        │
│  2. Query config DB for list of active cells                               │
│     │                                                                        │
│  3. Fan out query to each cell (parallel)                                  │
│     ├── Cell-01: Query tenant metrics                                      │
│     ├── Cell-02: Query tenant metrics                                      │
│     └── Cell-03: Query tenant metrics                                      │
│     │                                                                        │
│  4. Aggregate results                                                       │
│     │                                                                        │
│  5. Return combined response                                                │
│                                                                              │
│  TIMEOUT HANDLING:                                                          │
│  • Individual cell timeout: 5s                                              │
│  • If cell times out: Return partial results with warning                  │
│  • Response includes: { "partial": true, "failedCells": ["cell-03"] }      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Federated Query Implementation:**

```typescript
interface FederatedQueryOptions {
  cells?: string[];        // Specific cells (default: all active)
  timeout?: number;        // Per-cell timeout in ms (default: 5000)
  failOnPartial?: boolean; // Fail if any cell fails (default: false)
}

async function federatedQuery<T>(
  query: (cell: CellConnection) => Promise<T[]>,
  options: FederatedQueryOptions = {}
): Promise<FederatedResult<T>> {
  const { timeout = 5000, failOnPartial = false } = options;

  // 1. Get active cells from config DB
  const cells = options.cells ?? await getActiveCells();

  // 2. Execute query on each cell in parallel
  const results = await Promise.allSettled(
    cells.map(cell =>
      withTimeout(
        query(cell.connection),
        timeout,
        `Cell ${cell.id} timeout`
      )
    )
  );

  // 3. Aggregate results
  const data: T[] = [];
  const failedCells: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      data.push(...result.value);
    } else {
      failedCells.push(cells[index].id);
    }
  });

  if (failOnPartial && failedCells.length > 0) {
    throw new Error(`Query failed on cells: ${failedCells.join(', ')}`);
  }

  return {
    data,
    partial: failedCells.length > 0,
    failedCells,
    queriedCells: cells.map(c => c.id)
  };
}
```

**Available Federated Queries:**

| Query | Endpoint | Use Case |
|-------|----------|----------|
| All Organizations | `GET /admin/organizations` | Admin dashboard |
| Global Metrics | `GET /admin/metrics/global` | Executive reporting |
| DPP Count | `GET /admin/metrics/dpp-count` | Billing reconciliation |
| Health Check | `GET /admin/health/cells` | Ops monitoring |

### Tenant Migration Between Cells

When a cell approaches capacity or a tenant needs to be moved (e.g., to a region-specific cell).

#### Migration Procedure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TENANT MIGRATION RUNBOOK                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRE-MIGRATION CHECKLIST:                                                   │
│  ─────────────────────────                                                  │
│  □ Identify source cell and target cell                                    │
│  □ Verify target cell has capacity (<180 tenants)                         │
│  □ Schedule maintenance window (notify tenant if >1 hour)                  │
│  □ Create backup of tenant data in source cell                            │
│  □ Prepare rollback plan                                                   │
│                                                                              │
│  MIGRATION STEPS:                                                           │
│  ────────────────                                                           │
│                                                                              │
│  1. PREPARE (No downtime)                                                   │
│     ├── Create tenant schema in target cell                                │
│     ├── Set up streaming replication from source to target                 │
│     └── Verify replication lag is acceptable (<1 minute)                   │
│                                                                              │
│  2. CUTOVER (Brief downtime: 30-60 seconds)                                │
│     ├── Enable maintenance mode for tenant                                 │
│     ├── Wait for final replication sync                                    │
│     ├── Update config DB: tenant → target cell                            │
│     ├── Invalidate tenant cache in API layer                              │
│     └── Disable maintenance mode                                           │
│                                                                              │
│  3. VERIFY (No downtime)                                                    │
│     ├── Test API calls for tenant                                          │
│     ├── Verify all products accessible                                     │
│     ├── Check webhook deliveries working                                   │
│     └── Monitor error rates for 1 hour                                     │
│                                                                              │
│  4. CLEANUP (No downtime, delayed)                                         │
│     ├── Keep source data for 7 days (rollback window)                     │
│     ├── After 7 days: Drop tenant schema from source cell                 │
│     └── Update migration log                                               │
│                                                                              │
│  ROLLBACK PROCEDURE:                                                        │
│  ────────────────────                                                       │
│  If issues detected within 7 days:                                          │
│  1. Enable maintenance mode                                                 │
│  2. Update config DB: tenant → source cell                                 │
│  3. Invalidate cache                                                       │
│  4. Disable maintenance mode                                               │
│  5. Investigate root cause before retry                                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Migration Commands:**

```bash
# 1. Start migration (creates schema, begins replication)
./ops-cli tenant migrate start \
  --tenant-id org_abc123 \
  --source-cell cell-01 \
  --target-cell cell-02

# 2. Check replication status
./ops-cli tenant migrate status --tenant-id org_abc123

# 3. Execute cutover (brief downtime)
./ops-cli tenant migrate cutover --tenant-id org_abc123 --confirm

# 4. Verify migration
./ops-cli tenant migrate verify --tenant-id org_abc123

# 5. Cleanup source (after 7 days)
./ops-cli tenant migrate cleanup --tenant-id org_abc123 --confirm
```

**Migration Metrics:**

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Cutover duration | <60 seconds | >120 seconds |
| Replication lag | <1 minute | >5 minutes |
| Post-migration errors | 0 | Any |
| Migrations per week | <5 | >10 (investigate growth) |

### Cell Decommissioning

When a cell needs to be retired (e.g., consolidation, region migration).

#### Decommissioning Checklist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CELL DECOMMISSIONING RUNBOOK                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PRE-DECOMMISSION (2+ weeks before):                                        │
│  ────────────────────────────────────                                       │
│  □ Identify all tenants in cell                                            │
│  □ Plan target cells for each tenant                                       │
│  □ Verify target cells have capacity                                       │
│  □ Notify affected tenants (if extended maintenance expected)              │
│  □ Schedule migration windows                                              │
│                                                                              │
│  MIGRATION PHASE (1-2 weeks):                                               │
│  ────────────────────────────                                               │
│  □ Migrate tenants in batches (5-10 per day)                               │
│  □ Monitor error rates after each batch                                    │
│  □ Verify each tenant after migration                                      │
│  □ Track progress in migration log                                         │
│                                                                              │
│  DRAINING PHASE (After all tenants migrated):                              │
│  ─────────────────────────────────────────────                              │
│  □ Mark cell as "draining" in config DB                                    │
│  □ No new tenants assigned to this cell                                    │
│  □ Verify tenant count = 0                                                 │
│  □ Keep cell running for 7 days (rollback window)                         │
│                                                                              │
│  DECOMMISSION PHASE:                                                        │
│  ────────────────────                                                       │
│  □ Mark cell as "decommissioned" in config DB                              │
│  □ Take final backup of cell databases                                     │
│  □ Store backup in Glacier (7-year retention)                             │
│  □ Terminate cell infrastructure via Terraform                             │
│  □ Remove DNS entries                                                       │
│  □ Update architecture documentation                                       │
│  □ Close decommission ticket                                               │
│                                                                              │
│  INFRASTRUCTURE TEARDOWN (Terraform):                                       │
│  ─────────────────────────────────────                                      │
│  terraform workspace select cell-XX                                         │
│  terraform destroy -auto-approve                                            │
│                                                                              │
│  POST-DECOMMISSION:                                                         │
│  ──────────────────                                                         │
│  □ Verify no traffic to decommissioned cell (CloudWatch)                   │
│  □ Update capacity planning documents                                       │
│  □ Archive cell configuration                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Decommission Commands:**

```bash
# 1. List tenants in cell
./ops-cli cell list-tenants --cell cell-03

# 2. Mark cell as draining (no new assignments)
./ops-cli cell drain --cell cell-03

# 3. Migrate all tenants (interactive, batched)
./ops-cli cell evacuate --cell cell-03 --batch-size 5

# 4. Verify cell is empty
./ops-cli cell verify-empty --cell cell-03

# 5. Create final backup
./ops-cli cell backup --cell cell-03 --destination s3://backups/cell-03-final/

# 6. Decommission (marks cell inactive, does NOT destroy)
./ops-cli cell decommission --cell cell-03 --confirm

# 7. Destroy infrastructure (after 7-day waiting period)
./ops-cli cell destroy --cell cell-03 --confirm
```

### Cell Health Dashboard

Monitor all cells from a single dashboard.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CELL HEALTH DASHBOARD                                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Cell Overview:                                                             │
│  ┌─────────┬──────────┬────────┬──────────┬────────────┬─────────────────┐ │
│  │ Cell    │ Region   │ Status │ Tenants  │ CPU        │ Connections     │ │
│  ├─────────┼──────────┼────────┼──────────┼────────────┼─────────────────┤ │
│  │ cell-01 │ eu-west-1│ ● OK   │ 187/200  │ ▓▓▓▓░ 42%  │ ▓▓▓░░░ 98/200  │ │
│  │ cell-02 │ eu-west-1│ ● OK   │ 156/200  │ ▓▓▓░░ 35%  │ ▓▓░░░░ 76/200  │ │
│  │ cell-03 │ eu-cent  │ ⚠ WARN │ 195/200  │ ▓▓▓▓▓ 68%  │ ▓▓▓▓░░ 145/200 │ │
│  │ cell-04 │ eu-west-2│ ● OK   │ 42/200   │ ▓░░░░ 12%  │ ▓░░░░░ 28/200  │ │
│  └─────────┴──────────┴────────┴──────────┴────────────┴─────────────────┘ │
│                                                                              │
│  Total: 4 cells │ 580 tenants │ Avg utilization: 39%                       │
│                                                                              │
│  Alerts:                                                                    │
│  ⚠ cell-03: Tenant count at 97.5% capacity - schedule new cell provision  │
│                                                                              │
│  Recent Operations:                                                         │
│  │ 2026-01-14 11:30 │ tenant org_xyz migrated cell-01 → cell-04 │ Success │ │
│  │ 2026-01-13 09:00 │ cell-04 provisioned                       │ Success │ │
│  │ 2026-01-10 14:20 │ tenant org_abc migrated cell-03 → cell-02 │ Success │ │
│                                                                              │
│  [Provision New Cell]  [View Migration Queue]  [Export Report]             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Operational Tooling

### Tenant Data Export API (GDPR Compliance)

Complete data export capability for GDPR Article 20 (data portability) and Article 15 (right of access) compliance.

#### Export Data Categories

| Category | Description | Format | Included By Default |
|----------|-------------|--------|---------------------|
| `account` | User profile, preferences, organization | JSON | Yes |
| `products` | All product records with full history | JSON + CSV | Yes |
| `dpps` | Issued Digital Product Passports | JSON (VC format) | Yes |
| `attestations` | Third-party attestations received | JSON | Yes |
| `events` | EPCIS events for supply chain | JSON | Yes |
| `audit_log` | User actions audit trail | JSON | On request |
| `billing` | Invoices, payment history | JSON + PDF | On request |
| `api_keys` | API key metadata (not secrets) | JSON | Yes |

#### Export API Endpoints

```typescript
// POST /api/v1/exports
// Request a new data export
interface ExportRequest {
  scope: 'full' | 'partial';
  categories?: string[];  // If partial, specify which categories
  format: 'json' | 'csv' | 'both';
  includeHistory: boolean;  // Include version history
  encryption: {
    enabled: boolean;
    publicKey?: string;  // Customer's PGP public key for encryption
  };
  notifyEmail?: string;  // Email when export ready
}

// Response
interface ExportResponse {
  exportId: string;           // exp_abc123
  status: 'queued' | 'processing' | 'completed' | 'failed';
  estimatedSize: number;      // Bytes
  estimatedCompletionTime: string;  // ISO 8601
  createdAt: string;
}

// GET /api/v1/exports/:exportId
// Check export status
interface ExportStatus {
  exportId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;           // 0-100
  categories: {
    name: string;
    status: 'pending' | 'processing' | 'completed';
    recordCount: number;
  }[];
  downloadUrl?: string;       // Signed URL, expires in 24 hours
  expiresAt?: string;         // When download URL expires
  errorMessage?: string;      // If failed
}

// GET /api/v1/exports/:exportId/download
// Download the export (redirects to signed S3 URL)

// DELETE /api/v1/exports/:exportId
// Delete an export before download (cancel if in progress)
```

#### Export Job Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EXPORT JOB LIFECYCLE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  QUEUED ────► PROCESSING ────► COMPLETED ────► DOWNLOADED ────► EXPIRED     │
│     │              │               │                                        │
│     │              │               └──► Download URL valid for 24 hours     │
│     │              │                    Then auto-deleted from storage      │
│     │              │                                                        │
│     │              └──────────────► FAILED (retryable up to 3 times)       │
│     │                                                                       │
│     └──────────────────────────────► CANCELLED (by user request)           │
│                                                                              │
│  Timeouts:                                                                  │
│  • Queued → Processing: Max 5 minutes                                       │
│  • Processing: Max 4 hours (large exports)                                 │
│  • Completed → Expired: 24 hours after completion                          │
│                                                                              │
│  Notifications:                                                             │
│  • Email sent when export completes or fails                               │
│  • Webhook event: export.completed, export.failed                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Export Format Specification

```typescript
// Export archive structure (ZIP)
export-{orgId}-{timestamp}/
├── manifest.json           // Export metadata and checksums
├── account/
│   ├── organization.json   // Organization details
│   └── users.json          // User profiles (admin-only)
├── products/
│   ├── products.json       // All products
│   ├── products.csv        // CSV version
│   └── history/
│       └── {productId}.json // Version history per product
├── dpps/
│   ├── credentials.json    // All issued VCs
│   └── status-lists.json   // Revocation status
├── attestations/
│   └── attestations.json   // Third-party attestations
├── events/
│   └── epcis-events.json   // Supply chain events
├── audit/                  // Only if requested
│   └── audit-log.json      // User action log
└── billing/                // Only if requested
    ├── invoices.json       // Invoice metadata
    └── invoices/           // PDF invoices
        └── {invoiceId}.pdf

// manifest.json
interface ExportManifest {
  version: '1.0';
  exportId: string;
  organizationId: string;
  exportedAt: string;        // ISO 8601
  exportedBy: string;        // User ID who requested
  categories: string[];
  totalRecords: number;
  totalSize: number;         // Bytes
  checksums: {
    [filename: string]: {
      algorithm: 'sha256';
      hash: string;
    };
  };
  encryption: {
    enabled: boolean;
    algorithm?: 'PGP';
    keyFingerprint?: string;
  };
}
```

#### Rate Limits and Quotas

| Tier | Concurrent Exports | Export History Retention | Max Export Size |
|------|-------------------|--------------------------|-----------------|
| Starter | 1 | 7 days | 1 GB |
| Growth | 2 | 30 days | 10 GB |
| Enterprise | 5 | 90 days | Unlimited |

#### CLI Tool

```bash
# Request export
./ops-cli export create --org org_xyz --scope full --format json

# Check status
./ops-cli export status --export-id exp_abc123

# Download
./ops-cli export download --export-id exp_abc123 --output ./export.zip

# List recent exports
./ops-cli export list --org org_xyz --limit 10

# Admin: Export all tenant data (for legal/compliance)
./ops-cli export admin-create --org org_xyz --include-audit --reason "Legal hold request"
```

---

### Audit Log Retention Policy

Audit logs are retained for 7 years to meet compliance requirements for financial records, ESPR traceability, and legal discovery.

#### Retention Tiers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUDIT LOG RETENTION TIERS                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  HOT STORAGE (0-90 days)                                                    │
│  ───────────────────────                                                    │
│  • Location: Aurora PostgreSQL (primary database)                           │
│  • Query performance: < 100ms                                              │
│  • Full-text search: Yes                                                    │
│  • Used for: Real-time dashboards, recent activity views                   │
│                                                                              │
│  WARM STORAGE (90 days - 2 years)                                          │
│  ─────────────────────────────────                                         │
│  • Location: S3 (Standard)                                                  │
│  • Query performance: 1-10 seconds (via Athena)                            │
│  • Full-text search: Yes (Athena)                                          │
│  • Used for: Security investigations, compliance queries                    │
│                                                                              │
│  COLD STORAGE (2-7 years)                                                   │
│  ─────────────────────────                                                  │
│  • Location: S3 Glacier Deep Archive                                        │
│  • Query performance: 12-48 hours retrieval time                           │
│  • Full-text search: No (must restore first)                               │
│  • Used for: Legal discovery, regulatory audits                            │
│                                                                              │
│  DELETION (7+ years)                                                        │
│  ────────────────────                                                       │
│  • Automated deletion via S3 lifecycle policy                              │
│  • Deletion logged for compliance                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Audit Event Categories

| Category | Retention | Legal Basis |
|----------|-----------|-------------|
| Authentication events | 2 years | Security |
| Authorization changes | 7 years | SOC2, compliance |
| Data modifications | 7 years | ESPR traceability |
| DPP issuance/revocation | 10 years | ESPR Article 12(2) |
| Billing events | 7 years | Tax/financial records |
| API access | 90 days | Operational |
| System events | 30 days | Operational |

#### Audit Log Schema

```typescript
interface AuditLogEntry {
  id: string;                    // Unique log ID
  timestamp: string;             // ISO 8601 with timezone
  eventType: string;             // e.g., 'product.update', 'dpp.issue'
  category: AuditCategory;       // For retention policy

  // Actor
  actorType: 'user' | 'api_key' | 'system' | 'admin';
  actorId: string;               // User ID, API key ID, or 'system'
  actorEmail?: string;           // For user actors
  actorIp?: string;              // IP address (hashed after 90 days)

  // Target
  resourceType: string;          // e.g., 'product', 'dpp', 'user'
  resourceId: string;            // Target resource ID
  organizationId: string;        // Tenant isolation

  // Details
  action: 'create' | 'read' | 'update' | 'delete' | 'other';
  details: {
    before?: object;             // Previous state (for updates)
    after?: object;              // New state (for creates/updates)
    metadata?: object;           // Additional context
  };

  // Compliance
  retentionCategory: RetentionCategory;
  retentionExpiresAt: string;    // When this log can be deleted
}

type AuditCategory =
  | 'authentication'
  | 'authorization'
  | 'data_modification'
  | 'dpp_lifecycle'
  | 'billing'
  | 'api_access'
  | 'system';

type RetentionCategory =
  | '30_days'    // System events
  | '90_days'    // API access
  | '2_years'    // Authentication
  | '7_years'    // Data modifications, billing
  | '10_years';  // DPP lifecycle (ESPR)
```

#### Automated Archival Process

```typescript
// Daily archival job (runs at 3 AM UTC)
interface ArchivalJob {
  name: 'audit-log-archival';
  schedule: '0 3 * * *';

  steps: [
    {
      // Step 1: Move 90+ day logs from PostgreSQL to S3
      action: 'archive_to_warm',
      source: 'aurora.audit_logs',
      destination: 's3://audit-logs-warm/',
      condition: 'timestamp < NOW() - INTERVAL 90 days',
      format: 'parquet',  // Efficient for Athena queries
      partitionBy: ['year', 'month', 'organization_id'],
    },
    {
      // Step 2: Move 2+ year logs from S3 Standard to Glacier
      action: 'archive_to_cold',
      source: 's3://audit-logs-warm/',
      destination: 's3://audit-logs-cold/',
      condition: 'timestamp < NOW() - INTERVAL 2 years',
      storageClass: 'GLACIER_DEEP_ARCHIVE',
    },
    {
      // Step 3: Delete 7+ year logs (except DPP lifecycle)
      action: 'delete_expired',
      source: 's3://audit-logs-cold/',
      condition: 'timestamp < NOW() - INTERVAL 7 years AND category != dpp_lifecycle',
      logDeletion: true,  // Log what was deleted for compliance
    },
    {
      // Step 4: Delete 10+ year DPP logs
      action: 'delete_expired',
      source: 's3://audit-logs-cold/',
      condition: 'timestamp < NOW() - INTERVAL 10 years AND category = dpp_lifecycle',
      logDeletion: true,
    },
  ];
}
```

#### Audit Log Query API

```typescript
// GET /api/v1/audit-logs
// Query audit logs (hot storage only via API)
interface AuditLogQuery {
  organizationId: string;        // Required for tenant isolation
  startTime?: string;            // ISO 8601
  endTime?: string;              // ISO 8601
  eventType?: string;            // Filter by event type
  actorId?: string;              // Filter by actor
  resourceType?: string;         // Filter by resource type
  resourceId?: string;           // Filter by specific resource
  limit?: number;                // Max 1000
  cursor?: string;               // Pagination
}

// For warm/cold storage, use admin CLI
// ./ops-cli audit query --org org_xyz --start 2024-01-01 --end 2024-12-31
```

---

### Performance Baselines

Performance baselines for monitoring and alerting. All metrics measured at P50, P95, and P99 percentiles.

#### API Response Time Baselines

| Operation | P50 | P95 | P99 | Alert Threshold |
|-----------|-----|-----|-----|-----------------|
| **Authentication** |
| Magic link send | 200ms | 500ms | 1s | P95 > 1s |
| Magic link verify | 50ms | 100ms | 200ms | P95 > 300ms |
| Session validate | 10ms | 30ms | 50ms | P95 > 100ms |
| **Products** |
| List products | 100ms | 300ms | 500ms | P95 > 500ms |
| Get product | 50ms | 100ms | 200ms | P95 > 300ms |
| Create product | 150ms | 400ms | 800ms | P95 > 1s |
| Update product | 100ms | 300ms | 600ms | P95 > 800ms |
| **DPP Operations** |
| Issue DPP | 500ms | 1.5s | 3s | P95 > 3s |
| Verify DPP | 100ms | 300ms | 500ms | P95 > 500ms |
| Revoke DPP | 200ms | 500ms | 1s | P95 > 1s |
| Get status list | 50ms | 100ms | 200ms | P95 > 300ms |
| **Bulk Operations** |
| Import (100 products) | 5s | 15s | 30s | P95 > 30s |
| Export (full org) | 30s | 2min | 5min | P95 > 5min |
| Batch DPP issue (100) | 10s | 30s | 60s | P95 > 60s |
| **Integrations** |
| Shopify webhook process | 200ms | 500ms | 1s | P95 > 1s |
| PLM sync | 500ms | 2s | 5s | P95 > 5s |

#### Database Query Baselines

| Query Type | P50 | P95 | P99 | Alert Threshold |
|------------|-----|-----|-----|-----------------|
| Simple select | 5ms | 20ms | 50ms | P95 > 50ms |
| Indexed query | 10ms | 50ms | 100ms | P95 > 100ms |
| Join (2 tables) | 20ms | 100ms | 200ms | P95 > 200ms |
| Aggregation | 50ms | 200ms | 500ms | P95 > 500ms |
| Full-text search | 100ms | 500ms | 1s | P95 > 1s |

#### Background Job Baselines

| Job Type | Expected Duration | Max Duration | Alert Threshold |
|----------|------------------|--------------|-----------------|
| Email send | 1s | 10s | > 30s |
| Webhook delivery | 2s | 30s | > 60s (with retries) |
| Status list update | 500ms | 5s | > 10s |
| Audit log archival | 5min | 30min | > 1hr |
| DPP pre-computation | 100ms | 1s | > 5s |

#### Infrastructure Baselines

| Metric | Normal | Warning | Critical |
|--------|--------|---------|----------|
| **ECS Tasks** |
| CPU utilization | < 50% | 50-75% | > 75% |
| Memory utilization | < 60% | 60-80% | > 80% |
| Task count | Baseline | +25% | +50% |
| **RDS/Aurora** |
| CPU utilization | < 40% | 40-70% | > 70% |
| Connection count | < 60% max | 60-80% max | > 80% max |
| Read latency | < 5ms | 5-20ms | > 20ms |
| Write latency | < 10ms | 10-50ms | > 50ms |
| **DynamoDB** |
| Read capacity | < 60% | 60-80% | > 80% |
| Write capacity | < 60% | 60-80% | > 80% |
| Throttled requests | 0 | < 1% | > 1% |

#### Performance Monitoring Dashboard

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PERFORMANCE DASHBOARD                                              [Live]  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  API Response Times (Last Hour):                                            │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Products API     [====●=========] P50: 87ms  P95: 245ms  P99: 412ms  │ │
│  │ DPP Issue        [======●=======] P50: 523ms P95: 1.2s   P99: 2.1s   │ │
│  │ DPP Verify       [==●===========] P50: 89ms  P95: 187ms  P99: 298ms  │ │
│  │ Authentication   [=●============] P50: 42ms  P95: 98ms   P99: 156ms  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  Error Rates:                                                               │
│  │ API 5xx:        0.02% ▼ (target: < 0.1%)                               │ │
│  │ API 4xx:        1.2%    (informational)                                │ │
│  │ Background job: 0.5%  ▼ (target: < 1%)                                 │ │
│                                                                              │
│  Database Performance:                                                      │
│  │ Aurora read:    4.2ms (P95)  ● Normal                                  │ │
│  │ Aurora write:   8.7ms (P95)  ● Normal                                  │ │
│  │ DynamoDB:       12ms (P95)   ● Normal                                  │ │
│                                                                              │
│  Active Alerts: 0                                                           │
│                                                                              │
│  [View Detailed Metrics]  [Configure Alerts]  [Export Report]              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Performance Baseline Review Schedule

| Review Type | Frequency | Owner | Actions |
|-------------|-----------|-------|---------|
| Weekly metrics review | Weekly | Engineering | Identify trends, adjust thresholds |
| Monthly baseline recalibration | Monthly | Platform Lead | Update baselines based on growth |
| Quarterly capacity planning | Quarterly | Engineering + Ops | Plan infrastructure changes |
| Post-incident review | After incidents | Engineering | Update baselines if needed |

---

## Distributed Tracing (OpenTelemetry)

### Overview

EuroComply uses OpenTelemetry for distributed tracing across services, enabling end-to-end visibility for debugging issues at scale.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DISTRIBUTED TRACING ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐  │
│  │   Client    │───▶│   API GW    │───▶│  Service    │───▶│  Database   │  │
│  │  (Browser)  │    │  (ALB/CF)   │    │   (ECS)     │    │  (Aurora)   │  │
│  └─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘  │
│                                                                              │
│       trace_id: abc123 ─────────────────────────────────────────▶           │
│       span_id:  span1 ──▶ span2 ────▶ span3 ────────▶ span4                 │
│                                                                              │
│  All spans share trace_id for correlation                                   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Instrumentation Setup

```typescript
// src/instrumentation.ts
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: 'eurocomply-api',
    [SemanticResourceAttributes.SERVICE_VERSION]: process.env.APP_VERSION,
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV,
  }),
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://otel-collector:4318/v1/traces',
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (req) =>
          req.url?.includes('/health') || req.url?.includes('/ready'),
      },
      '@opentelemetry/instrumentation-pg': {
        enhancedDatabaseReporting: true,
      },
    }),
  ],
});

sdk.start();
```

### Custom Spans for Business Operations

```typescript
import { trace, SpanStatusCode, context } from '@opentelemetry/api';

const tracer = trace.getTracer('eurocomply-api');

class ProductService {
  async createDPPSnapshot(params: SnapshotParams): Promise<DPPSnapshot> {
    return tracer.startActiveSpan('dpp.create_snapshot', async (span) => {
      try {
        // Add business context to span
        span.setAttributes({
          'eurocomply.organization_id': params.organizationId,
          'eurocomply.batch_id': params.batchId,
          'eurocomply.design_version_id': params.designVersionId,
        });

        // Nested spans for sub-operations
        const designData = await tracer.startActiveSpan(
          'dpp.fetch_design_data',
          async (childSpan) => {
            const data = await this.designRepository.getView(params.designVersionId);
            childSpan.setAttributes({ 'design.version_number': data.versionNumber });
            childSpan.end();
            return data;
          }
        );

        const opsData = await tracer.startActiveSpan(
          'dpp.fetch_operations_data',
          async (childSpan) => {
            const data = await this.opsRepository.getView(params.batchId);
            childSpan.setAttributes({
              'batch.quantity': data.quantity,
              'batch.epcis_events_count': data.epcisEvents.length,
            });
            childSpan.end();
            return data;
          }
        );

        // Verify attestations
        await tracer.startActiveSpan('dpp.verify_attestations', async (childSpan) => {
          const attestations = [...designData.attestations, ...opsData.attestations];
          childSpan.setAttributes({ 'attestations.count': attestations.length });

          for (const att of attestations) {
            await this.verifyAttestation(att);
          }
          childSpan.end();
        });

        // Create snapshot
        const snapshot = await this.snapshotRepository.create({
          designData,
          operationsData: opsData,
        });

        span.setAttributes({ 'snapshot.id': snapshot.id });
        span.setStatus({ code: SpanStatusCode.OK });

        return snapshot;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
```

### Trace Context Propagation

```typescript
// Middleware: Extract trace context from incoming requests
import { propagation, context } from '@opentelemetry/api';

function traceContextMiddleware(req: Request, res: Response, next: NextFunction) {
  // Extract trace context from headers (W3C Trace Context)
  const ctx = propagation.extract(context.active(), req.headers);

  // Run rest of request in extracted context
  context.with(ctx, () => {
    // Add trace ID to response headers for debugging
    const span = trace.getActiveSpan();
    if (span) {
      const traceId = span.spanContext().traceId;
      res.setHeader('X-Trace-Id', traceId);
    }

    next();
  });
}

// Event emission: Include trace context
async function emitEvent(event: DomainEvent): Promise<void> {
  const span = trace.getActiveSpan();
  if (span) {
    event.correlationId = span.spanContext().traceId;
  }

  await eventBus.emit(event);
}
```

### Tenant Context in Traces

```typescript
// Add tenant context to all spans
class TenantContextMiddleware {
  handle(req: Request, res: Response, next: NextFunction) {
    const span = trace.getActiveSpan();

    if (span && req.context?.organizationId) {
      span.setAttributes({
        'eurocomply.tenant_id': req.context.organizationId,
        'eurocomply.user_id': req.context.userId,
        'eurocomply.tier': req.context.tier,
      });
    }

    next();
  }
}
```

### Querying Traces

**By Trace ID (from X-Trace-Id header):**
```bash
# AWS X-Ray Console or Grafana Tempo
# Filter: trace_id = "abc123def456..."
```

**By Tenant:**
```bash
# Filter spans by tenant
# eurocomply.tenant_id = "org-12345"
```

**Slow Requests:**
```bash
# Find requests > 5 seconds
# duration > 5000ms AND service.name = "eurocomply-api"
```

**Error Traces:**
```bash
# Find all errors
# status.code = ERROR AND eurocomply.tenant_id = "org-12345"
```

### Integration with Logging

```typescript
// Correlate logs with traces
import { context, trace } from '@opentelemetry/api';
import pino from 'pino';

const logger = pino({
  mixin() {
    const span = trace.getActiveSpan();
    if (span) {
      const ctx = span.spanContext();
      return {
        trace_id: ctx.traceId,
        span_id: ctx.spanId,
      };
    }
    return {};
  },
});

// Usage - logs automatically include trace context
logger.info({ productId: '123' }, 'Creating product');
// Output: {"trace_id":"abc...","span_id":"def...","productId":"123","msg":"Creating product"}
```

### Sampling Strategy

```typescript
// Production: Sample 10% of traces, but always sample errors
import { TraceIdRatioBasedSampler, ParentBasedSampler } from '@opentelemetry/sdk-trace-base';

const sampler = new ParentBasedSampler({
  root: new TraceIdRatioBasedSampler(0.1), // 10% of root spans
});

// Custom sampler: always sample specific operations
class EuroComplySampler {
  shouldSample(context: Context, traceId: string, spanName: string): SamplingResult {
    // Always sample DPP issuance
    if (spanName.startsWith('dpp.')) {
      return { decision: SamplingDecision.RECORD_AND_SAMPLED };
    }

    // Always sample errors (detected in parent)
    // (errors are recorded even if sampling says no)

    // 10% for everything else
    return this.ratioSampler.shouldSample(context, traceId, spanName);
  }
}
```

### Debugging Checklist

When investigating issues at scale:

| Step | Tool | Query |
|------|------|-------|
| 1. Find trace ID | Logs/Error | Get X-Trace-Id from response or error log |
| 2. View full trace | Trace UI | Search by trace_id |
| 3. Identify slow span | Trace UI | Sort spans by duration |
| 4. Check span attributes | Trace UI | Look for error messages, tenant context |
| 5. Correlate with logs | Log UI | Filter by trace_id |
| 6. Check metrics | Metrics UI | Filter by tenant_id, time range |

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

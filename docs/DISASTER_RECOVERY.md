# Disaster Recovery Plan

## Overview

This document defines EuroComply's disaster recovery (DR) procedures, recovery objectives, and incident response protocols. The goal is to minimize downtime and data loss while maintaining compliance with ESPR regulations.

---

## Recovery Objectives

### Service Level Targets

| Service | RTO (Recovery Time) | RPO (Recovery Point) | Priority |
|---------|---------------------|----------------------|----------|
| DPP Public API | 15 minutes | 0 (stateless) | Critical |
| Dashboard | 1 hour | 5 minutes | High |
| Bulk Generation | 4 hours | 5 minutes | Medium |
| AI Import | 8 hours | 5 minutes | Low |

### Component-Level Objectives

| Component | Backup Frequency | Retention | RPO | RTO |
|-----------|-----------------|-----------|-----|-----|
| RDS (PostgreSQL) | Continuous + daily snapshot | 7 days snapshots, 35 days PITR | 5 minutes | 30 minutes |
| DynamoDB | Continuous PITR | 35 days | 1 second | Minutes |
| Cloudflare R2 | Versioned | 30 days | 0 | Instant |
| Redis | None (cache) | N/A | N/A | 5 minutes (rebuild) |
| S3 (uploads) | Versioned | Indefinite | 0 | Instant |
| KMS Keys | Cross-region replication | N/A | 0 | Instant |

---

## Backup Procedures

### Automated Backups

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTOMATED BACKUP SCHEDULE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RDS (PostgreSQL)                                                           │
│  ─────────────────                                                          │
│  • Automated snapshots: Daily at 03:00 UTC                                  │
│  • Point-in-time recovery: Continuous (5-minute granularity)                │
│  • Cross-region copy: Daily to eu-north-1 (DR region)                       │
│  • Retention: 7 days (automated), 35 days (PITR)                            │
│                                                                              │
│  DynamoDB                                                                   │
│  ─────────────────                                                          │
│  • Point-in-time recovery: Enabled (continuous)                             │
│  • On-demand backups: Weekly (Sundays 04:00 UTC)                            │
│  • Global tables: Automatic multi-region replication                        │
│  • Retention: 35 days (PITR), indefinite (on-demand)                        │
│                                                                              │
│  Cloudflare R2                                                              │
│  ─────────────────                                                          │
│  • Object versioning: Enabled                                               │
│  • No scheduled backups (R2 provides durability)                            │
│  • Retention: 30 days for deleted/overwritten versions                      │
│                                                                              │
│  S3 (Source uploads)                                                        │
│  ─────────────────                                                          │
│  • Object versioning: Enabled                                               │
│  • Cross-region replication: To eu-north-1                                  │
│  • Lifecycle: Move to IA after 30 days, Glacier after 90 days               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Manual Backup Triggers

On-demand backups should be triggered before:
- Major database migrations
- Bulk data imports (>10,000 products)
- Infrastructure changes
- Terraform applies to production

```bash
# RDS manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier eurocomply-prod \
  --db-snapshot-identifier eurocomply-prod-$(date +%Y%m%d-%H%M)

# DynamoDB on-demand backup
aws dynamodb create-backup \
  --table-name eurocomply-items-prod \
  --backup-name eurocomply-items-$(date +%Y%m%d-%H%M)
```

---

## Disaster Scenarios

### Scenario 1: Single Component Failure

**Database (RDS) Failure**

```
Trigger: RDS instance unavailable, replication lag, or corruption
Impact: Dashboard unavailable, DPP generation blocked
RTO: 30 minutes

Recovery Steps:
1. Verify failure (CloudWatch alarms, health checks)
2. Initiate point-in-time recovery:
   aws rds restore-db-instance-to-point-in-time \
     --source-db-instance-identifier eurocomply-prod \
     --target-db-instance-identifier eurocomply-prod-recovered \
     --restore-time 2026-01-14T10:00:00Z
3. Update application configuration to use recovered instance
4. Verify data integrity
5. Promote recovered instance to production
6. Update DNS/connection strings
```

**Cache (Redis) Failure**

```
Trigger: ElastiCache cluster unavailable
Impact: Increased latency, session loss
RTO: 5 minutes

Recovery Steps:
1. Sessions automatically recreated on login
2. DEK cache rebuilds automatically from KMS
3. If cluster unrecoverable:
   - Terraform apply to recreate cluster
   - No data loss (cache is ephemeral)
```

**DPP Serving (R2) Failure**

```
Trigger: Cloudflare R2 or Workers unavailable
Impact: QR code scans fail
RTO: 15 minutes

Recovery Steps:
1. Check Cloudflare status page
2. If regional: Traffic auto-routes to other regions
3. If global: Enable S3 fallback origin
4. Re-deploy Workers from source if corrupted
```

### Scenario 2: Region Failure

**Primary Region (eu-west-1) Unavailable**

```
Trigger: AWS eu-west-1 regional outage
Impact: Full service unavailable
RTO: 4 hours (failover to DR region)

Recovery Steps:
1. Activate DR region (eu-north-1):
   - Promote RDS read replica to primary
   - Update DynamoDB global table to use DR region
   - Deploy ECS services to DR region
2. Update DNS:
   - Route 53 health check triggers failover
   - Or manual DNS update if automatic fails
3. Update Cloudflare Workers to point to DR APIs
4. Verify service functionality
5. Notify customers of potential data staleness (up to 5 min RPO)
```

### Scenario 3: Data Corruption

**Database Corruption**

```
Trigger: Bad migration, SQL injection, application bug
Impact: Incorrect data served, compliance risk
RTO: 1-4 hours depending on scope

Recovery Steps:
1. Identify corruption scope and timestamp
2. Stop writes to affected tables
3. Point-in-time recovery to pre-corruption state
4. Replay valid transactions from audit log
5. Verify data integrity
6. Resume normal operations
```

**DPP Data Corruption**

```
Trigger: Incorrect DPP generated, wrong VC signed
Impact: Invalid passports in circulation
RTO: 1 hour

Recovery Steps:
1. Identify affected passports by timestamp/batch
2. Revoke VCs using StatusList2021
3. Re-generate correct DPPs
4. Notify affected organizations
5. Update R2 with corrected DPP files
```

### Scenario 4: Security Incident

**Key Compromise**

See [SECURITY.md](./SECURITY.md) for detailed key compromise recovery procedure.

**Data Breach**

```
Trigger: Unauthorized data access detected
Impact: GDPR violation, customer trust
RTO: Immediate containment, 72h notification

Recovery Steps:
1. CONTAIN:
   - Revoke compromised credentials
   - Isolate affected systems
   - Enable enhanced logging
2. ASSESS:
   - Identify scope of breach
   - Determine data exposed
   - Check audit logs
3. NOTIFY:
   - DPO within 1 hour
   - Supervisory authority within 72 hours
   - Affected customers if high risk
4. REMEDIATE:
   - Patch vulnerability
   - Rotate all credentials
   - Review access controls
5. DOCUMENT:
   - Full incident report
   - Lessons learned
   - Process improvements
```

---

## Recovery Procedures

### Database Recovery

**Point-in-Time Recovery (PITR)**

```bash
# 1. Identify target recovery time
RECOVERY_TIME="2026-01-14T10:00:00Z"

# 2. Restore to new instance
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier eurocomply-prod \
  --target-db-instance-identifier eurocomply-prod-pitr \
  --restore-time $RECOVERY_TIME \
  --db-instance-class db.t3.medium \
  --vpc-security-group-ids sg-xxx \
  --db-subnet-group-name eurocomply-prod

# 3. Wait for instance availability
aws rds wait db-instance-available \
  --db-instance-identifier eurocomply-prod-pitr

# 4. Verify data integrity
psql -h eurocomply-prod-pitr.xxx.rds.amazonaws.com -U eurocomply -c "
  SELECT COUNT(*) FROM products;
  SELECT MAX(updated_at) FROM products;
"

# 5. Update application configuration
# Edit ECS task definition or environment variables

# 6. Swap DNS or connection string
```

**Snapshot Recovery**

```bash
# 1. List available snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier eurocomply-prod \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime]'

# 2. Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier eurocomply-prod-restored \
  --db-snapshot-identifier eurocomply-prod-20260114-0300 \
  --db-instance-class db.t3.medium
```

### Application Recovery

**ECS Service Recovery**

```bash
# 1. Force new deployment
aws ecs update-service \
  --cluster eurocomply-prod \
  --service api \
  --force-new-deployment

# 2. Scale up if needed
aws ecs update-service \
  --cluster eurocomply-prod \
  --service api \
  --desired-count 4

# 3. Roll back to previous task definition
aws ecs update-service \
  --cluster eurocomply-prod \
  --service api \
  --task-definition eurocomply-api:42
```

**Cloudflare Workers Recovery**

```bash
# 1. Check worker status
wrangler tail eurocomply-dpp-worker --env production

# 2. Re-deploy from source
wrangler deploy --env production

# 3. Verify routing
curl -I https://dpp.eurocomply.eu/health
```

---

## Testing Procedures

### Quarterly DR Tests

| Test | Frequency | Duration | Success Criteria |
|------|-----------|----------|------------------|
| RDS PITR restore | Quarterly | 2 hours | Data matches within RPO |
| DynamoDB restore | Quarterly | 1 hour | Item counts match |
| Region failover | Annually | 4 hours | Services functional in DR region |
| Full DR exercise | Annually | 8 hours | RTO/RPO targets met |

### Test Runbook

```
┌─────────────────────────────────────────────────────────────────┐
│                    QUARTERLY DR TEST PROCEDURE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  PRE-TEST (Day before):                                         │
│  ─────────────────────                                          │
│  • Notify team of scheduled test                                │
│  • Verify backup status                                         │
│  • Prepare isolated test environment                            │
│                                                                  │
│  TEST EXECUTION:                                                │
│  ───────────────                                                │
│  1. Record test start time                                      │
│  2. Initiate recovery procedure (staging environment)           │
│  3. Measure time to service availability                        │
│  4. Verify data integrity                                       │
│  5. Run integration tests against recovered environment         │
│  6. Record test completion time                                 │
│                                                                  │
│  POST-TEST:                                                     │
│  ──────────                                                     │
│  • Document actual RTO achieved                                 │
│  • Document any data loss (RPO)                                 │
│  • Clean up test resources                                      │
│  • Update runbooks if issues found                              │
│  • File test report                                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Monitoring and Alerting

### Recovery-Related Alerts

| Alert | Threshold | Action |
|-------|-----------|--------|
| RDS backup failed | Any failure | Investigate immediately |
| RDS storage > 80% | > 80% used | Expand storage |
| DynamoDB PITR disabled | Status change | Re-enable immediately |
| R2 error rate | > 1% | Check Cloudflare status |
| Cross-region replication lag | > 10 minutes | Investigate network |

### Health Check Endpoints

```
Production endpoints to monitor:
- https://api.eurocomply.eu/health          (API)
- https://dpp.eurocomply.eu/health          (DPP serving)
- https://app.eurocomply.eu/api/health      (Dashboard)

DR region endpoints:
- https://api-dr.eurocomply.eu/health       (DR API)
```

---

## Contact Information

### Escalation Path

| Level | Contact | When |
|-------|---------|------|
| L1 | On-call engineer | Any alert triggered |
| L2 | Platform team lead | L1 cannot resolve in 30 min |
| L3 | CTO | Data loss or extended outage |
| External | AWS Support (Enterprise) | Infrastructure issues |
| External | Cloudflare Support | CDN/DPP serving issues |

### External Dependencies

| Service | Support Contact | SLA |
|---------|-----------------|-----|
| AWS | Enterprise Support | 15 min response (critical) |
| Cloudflare | Enterprise Support | 1 hour response |
| walt.id | support@walt.id | Best effort |

---

## Compliance Considerations

### ESPR Requirements

DPP availability is required by ESPR regulations:
- QR codes on products must resolve to valid DPPs
- 10-year availability requirement for product passports
- Regulatory auditors may verify DPP accessibility

**DR Impact on Compliance:**
- Extended outages may trigger regulatory inquiry
- Data loss affecting DPPs requires re-issuance
- Document all incidents affecting DPP availability

### GDPR Requirements

- 72-hour breach notification requirement
- Data recovery must not expose additional data
- Audit logs must be preserved during recovery
- Document data processing during recovery

---

## Document Maintenance

| Item | Frequency | Owner |
|------|-----------|-------|
| Review procedures | Quarterly | Platform team |
| Update contacts | Monthly | Operations |
| Test runbooks | After each DR test | Platform team |
| Update RTO/RPO targets | Annually | CTO |

---

*Last Updated: 2026-01-14*

## Related Documentation

- [SECURITY.md](./SECURITY.md) - Key compromise recovery
- [GDPR_COMPLIANCE.md](./GDPR_COMPLIANCE.md) - Data protection requirements
- [DATA_SOVEREIGNTY.md](./DATA_SOVEREIGNTY.md) - Data residency
- [ARCHITECTURE_PORTABILITY.md](./ARCHITECTURE_PORTABILITY.md) - Exit procedures

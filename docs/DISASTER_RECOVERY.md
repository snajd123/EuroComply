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

### Testing Schedule

> **"Untested backups are not backups."** - All restore procedures must be tested quarterly.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ANNUAL TESTING CALENDAR                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Q1 (January):   Full database PITR restore test                            │
│  Q2 (April):     Single-tenant restore + DynamoDB recovery                  │
│  Q3 (July):      Region failover exercise                                   │
│  Q4 (October):   Full DR exercise (all systems)                             │
│                                                                              │
│  MONTHLY:        Automated restore verification job (see below)             │
│                                                                              │
│  Testing environment: dr-test.eurocomply.internal (isolated VPC)            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Quarterly DR Tests

| Test | Frequency | Duration | Success Criteria |
|------|-----------|----------|------------------|
| RDS PITR restore | Quarterly | 2 hours | Data matches within RPO |
| Single-tenant restore | Quarterly | 1 hour | Tenant data complete, isolated |
| DynamoDB restore | Quarterly | 1 hour | Item counts match |
| Region failover | Annually | 4 hours | Services functional in DR region |
| Full DR exercise | Annually | 8 hours | RTO/RPO targets met |

---

## Restore Runbooks

### Runbook 1: Point-in-Time Recovery (Full Database)

**When to use:** Database corruption, bad migration, need to recover to specific point in time.

```bash
#!/bin/bash
# PITR Restore Runbook
# Estimated time: 30-45 minutes

# === 1. PREPARE ===
RECOVERY_TIME="2026-01-14T10:00:00Z"  # Set to target recovery point
RECOVERY_INSTANCE="eurocomply-prod-pitr-$(date +%s)"
SOURCE_INSTANCE="eurocomply-prod"

echo "Starting PITR restore to $RECOVERY_TIME"
echo "Recovery instance: $RECOVERY_INSTANCE"

# === 2. INITIATE RESTORE ===
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier $SOURCE_INSTANCE \
  --target-db-instance-identifier $RECOVERY_INSTANCE \
  --restore-time $RECOVERY_TIME \
  --db-instance-class db.t3.medium \
  --vpc-security-group-ids sg-xxx \
  --db-subnet-group-name eurocomply-prod \
  --no-publicly-accessible

# === 3. WAIT FOR AVAILABILITY ===
echo "Waiting for instance availability (typically 15-25 minutes)..."
aws rds wait db-instance-available \
  --db-instance-identifier $RECOVERY_INSTANCE

# === 4. GET ENDPOINT ===
ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier $RECOVERY_INSTANCE \
  --query 'DBInstances[0].Endpoint.Address' \
  --output text)
echo "Recovery endpoint: $ENDPOINT"

# === 5. VERIFY DATA INTEGRITY ===
echo "Verifying data integrity..."
psql -h $ENDPOINT -U eurocomply -d eurocomply -c "
  -- Check row counts for critical tables
  SELECT 'organizations' as table_name, COUNT(*) as count FROM organizations
  UNION ALL SELECT 'products', COUNT(*) FROM products
  UNION ALL SELECT 'passports', COUNT(*) FROM passports
  UNION ALL SELECT 'users', COUNT(*) FROM users;

  -- Check latest timestamps (should be before RECOVERY_TIME)
  SELECT 'Latest product update' as check_name, MAX(updated_at) as value FROM products
  UNION ALL SELECT 'Latest passport', MAX(created_at) FROM passports;
"

# === 6. VERIFICATION CHECKLIST ===
echo "
┌─────────────────────────────────────────────────────────────────┐
│                   MANUAL VERIFICATION CHECKLIST                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [ ] Row counts match expected (compare to monitoring metrics)  │
│  [ ] Latest timestamps are before recovery point                │
│  [ ] Sample 5 random products and verify data                   │
│  [ ] Verify tenant isolation (query with wrong tenant fails)    │
│  [ ] Test login with known user credentials                     │
│  [ ] Generate test DPP from recovered data                      │
│                                                                  │
│  If all checks pass:                                            │
│  1. Update ECS task definition with new endpoint                │
│  2. Deploy updated task definition                              │
│  3. Verify API health                                           │
│  4. Delete old instance after 24h observation                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
"
```

### Runbook 2: Single-Tenant Data Restore

**When to use:** Customer requests data recovery, accidental deletion, tenant-specific corruption.

```bash
#!/bin/bash
# Single-Tenant Restore Runbook
# Estimated time: 45-60 minutes

# === 1. IDENTIFY TENANT ===
ORG_ID="org_01h8x9y2z3a4b5c6d7e8f9g0h1"  # Target organization
RECOVERY_TIME="2026-01-14T10:00:00Z"      # Recovery point
TENANT_SCHEMA="tenant_${ORG_ID}"

echo "Restoring tenant: $ORG_ID"
echo "Schema: $TENANT_SCHEMA"
echo "Recovery point: $RECOVERY_TIME"

# === 2. CREATE PITR INSTANCE (same as full restore) ===
RECOVERY_INSTANCE="eurocomply-tenant-restore-$(date +%s)"

aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier eurocomply-prod \
  --target-db-instance-identifier $RECOVERY_INSTANCE \
  --restore-time $RECOVERY_TIME \
  --db-instance-class db.t3.small \
  --vpc-security-group-ids sg-xxx \
  --db-subnet-group-name eurocomply-prod

aws rds wait db-instance-available \
  --db-instance-identifier $RECOVERY_INSTANCE

RECOVERY_ENDPOINT=$(aws rds describe-db-instances \
  --db-instance-identifier $RECOVERY_INSTANCE \
  --query 'DBInstances[0].Endpoint.Address' --output text)

# === 3. EXPORT TENANT DATA FROM RECOVERED INSTANCE ===
echo "Exporting tenant data from recovered instance..."

# Export tenant schema to SQL file
pg_dump -h $RECOVERY_ENDPOINT -U eurocomply -d eurocomply \
  --schema=$TENANT_SCHEMA \
  --no-owner \
  --no-privileges \
  -f /tmp/tenant_restore_${ORG_ID}.sql

# === 4. VERIFY EXPORT ===
echo "Verifying export..."
grep -c "INSERT INTO" /tmp/tenant_restore_${ORG_ID}.sql
ls -lh /tmp/tenant_restore_${ORG_ID}.sql

# === 5. RESTORE TO PRODUCTION (CAREFUL!) ===
echo "
┌─────────────────────────────────────────────────────────────────┐
│                    ⚠️  PRODUCTION RESTORE ⚠️                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  BEFORE RESTORING TO PRODUCTION:                                │
│                                                                  │
│  [ ] Notify customer of planned restore window                  │
│  [ ] Take fresh snapshot of current production                  │
│  [ ] Verify export file integrity                               │
│  [ ] Confirm customer approval                                  │
│                                                                  │
│  RESTORE STEPS:                                                 │
│  1. Drop current tenant schema (or rename to _backup)           │
│  2. Import restored schema                                      │
│  3. Verify data integrity                                       │
│  4. Notify customer                                             │
│                                                                  │
│  COMMANDS:                                                      │
│  psql -h prod-db -c \"ALTER SCHEMA $TENANT_SCHEMA                │
│                       RENAME TO ${TENANT_SCHEMA}_backup\"        │
│  psql -h prod-db -f /tmp/tenant_restore_${ORG_ID}.sql           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
"

# === 6. RESTORE DYNAMODB ITEMS FOR TENANT ===
echo "Restoring DynamoDB items for tenant..."

# Use DynamoDB PITR to restore to temp table
aws dynamodb restore-table-to-point-in-time \
  --source-table-name eurocomply-items-prod \
  --target-table-name eurocomply-items-restore-${ORG_ID} \
  --restore-date-time $RECOVERY_TIME

# Wait for restore
aws dynamodb wait table-exists \
  --table-name eurocomply-items-restore-${ORG_ID}

# Scan and copy items for specific org (using GSI)
# Note: In production, use a script that:
# 1. Queries GSI1 for all items with pk starting with "ORG#${ORG_ID}"
# 2. Batch-writes to production table
# 3. Verifies counts

# === 7. CLEANUP ===
echo "
Cleanup steps (after verification):
1. Delete recovery RDS instance:
   aws rds delete-db-instance --db-instance-identifier $RECOVERY_INSTANCE --skip-final-snapshot
2. Delete DynamoDB restore table:
   aws dynamodb delete-table --table-name eurocomply-items-restore-${ORG_ID}
3. Delete backup schema from production (after 7 days):
   psql -h prod-db -c \"DROP SCHEMA ${TENANT_SCHEMA}_backup CASCADE\"
"
```

### Runbook 3: DynamoDB Point-in-Time Recovery

**When to use:** Item data corruption, need to recover DPP item records.

```bash
#!/bin/bash
# DynamoDB PITR Runbook
# Estimated time: 15-30 minutes

RECOVERY_TIME="2026-01-14T10:00:00Z"
SOURCE_TABLE="eurocomply-items-prod"
RESTORE_TABLE="eurocomply-items-pitr-$(date +%s)"

# === 1. INITIATE RESTORE ===
aws dynamodb restore-table-to-point-in-time \
  --source-table-name $SOURCE_TABLE \
  --target-table-name $RESTORE_TABLE \
  --restore-date-time $RECOVERY_TIME

# === 2. WAIT FOR RESTORE ===
echo "Waiting for table restore..."
aws dynamodb wait table-exists --table-name $RESTORE_TABLE

# === 3. VERIFY COUNTS ===
ORIGINAL_COUNT=$(aws dynamodb scan \
  --table-name $SOURCE_TABLE \
  --select COUNT \
  --query 'Count' --output text)

RESTORED_COUNT=$(aws dynamodb scan \
  --table-name $RESTORE_TABLE \
  --select COUNT \
  --query 'Count' --output text)

echo "Original table count: $ORIGINAL_COUNT"
echo "Restored table count: $RESTORED_COUNT"

# === 4. SAMPLE VERIFICATION ===
echo "Sampling 10 random items..."
aws dynamodb scan \
  --table-name $RESTORE_TABLE \
  --limit 10 \
  --projection-expression "pk,sk,serialNumber,createdAt"

# === 5. SWAP TABLES (if full replacement needed) ===
echo "
To swap tables:
1. Update application config to use $RESTORE_TABLE
2. Deploy updated configuration
3. Verify application functionality
4. Rename or delete original table after 24h observation
"
```

---

## Automated Restore Verification

Monthly automated job verifies backup restorability:

```yaml
# .github/workflows/backup-verification.yml
name: Monthly Backup Verification

on:
  schedule:
    - cron: '0 3 1 * *'  # First day of each month, 3 AM UTC

jobs:
  verify-rds-backup:
    runs-on: ubuntu-latest
    steps:
      - name: Restore from latest snapshot
        run: |
          SNAPSHOT=$(aws rds describe-db-snapshots \
            --db-instance-identifier eurocomply-prod \
            --query 'DBSnapshots | sort_by(@, &SnapshotCreateTime) | [-1].DBSnapshotIdentifier' \
            --output text)

          aws rds restore-db-instance-from-db-snapshot \
            --db-instance-identifier backup-verify-${{ github.run_id }} \
            --db-snapshot-identifier $SNAPSHOT \
            --db-instance-class db.t3.micro

          aws rds wait db-instance-available \
            --db-instance-identifier backup-verify-${{ github.run_id }}

      - name: Run integrity checks
        run: |
          ENDPOINT=$(aws rds describe-db-instances \
            --db-instance-identifier backup-verify-${{ github.run_id }} \
            --query 'DBInstances[0].Endpoint.Address' --output text)

          # Run test suite against restored database
          DATABASE_URL="postgresql://verify:${{ secrets.VERIFY_PASSWORD }}@$ENDPOINT/eurocomply" \
            npm run test:db-integrity

      - name: Cleanup
        if: always()
        run: |
          aws rds delete-db-instance \
            --db-instance-identifier backup-verify-${{ github.run_id }} \
            --skip-final-snapshot

      - name: Report results
        run: |
          # Send Slack notification with results
          curl -X POST ${{ secrets.SLACK_WEBHOOK }} \
            -d '{"text": "✅ Monthly backup verification passed"}'

  verify-dynamodb-backup:
    runs-on: ubuntu-latest
    steps:
      - name: Restore DynamoDB table
        run: |
          aws dynamodb restore-table-to-point-in-time \
            --source-table-name eurocomply-items-prod \
            --target-table-name backup-verify-${{ github.run_id }} \
            --use-latest-restorable-time

          aws dynamodb wait table-exists \
            --table-name backup-verify-${{ github.run_id }}

      - name: Verify item count
        run: |
          COUNT=$(aws dynamodb scan \
            --table-name backup-verify-${{ github.run_id }} \
            --select COUNT \
            --query 'Count' --output text)

          if [ "$COUNT" -lt 1000 ]; then
            echo "ERROR: Unexpected low item count: $COUNT"
            exit 1
          fi
          echo "Item count verified: $COUNT"

      - name: Cleanup
        if: always()
        run: |
          aws dynamodb delete-table \
            --table-name backup-verify-${{ github.run_id }}
```

---

## Test Execution Runbook

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
│  • Identify test tenant (use internal test org)                 │
│                                                                  │
│  TEST EXECUTION:                                                │
│  ───────────────                                                │
│  1. Record test start time                                      │
│  2. Initiate recovery procedure (staging environment)           │
│  3. Measure time to service availability                        │
│  4. Verify data integrity                                       │
│  5. Run integration tests against recovered environment         │
│  6. Test single-tenant restore for test org                     │
│  7. Record test completion time                                 │
│                                                                  │
│  POST-TEST:                                                     │
│  ──────────                                                     │
│  • Document actual RTO achieved                                 │
│  • Document any data loss (RPO)                                 │
│  • Clean up test resources                                      │
│  • Update runbooks if issues found                              │
│  • File test report (template below)                            │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### DR Test Report Template

```markdown
# DR Test Report - Q[X] 2026

**Test Date:** YYYY-MM-DD
**Test Lead:** [Name]
**Test Type:** [PITR / Single-Tenant / Region Failover / Full DR]

## Summary
- **Overall Result:** PASS / FAIL
- **RTO Target:** X minutes | **RTO Achieved:** Y minutes
- **RPO Target:** X minutes | **RPO Achieved:** Y minutes

## Tests Performed
| Test | Target | Actual | Result |
|------|--------|--------|--------|
| RDS PITR restore | 30 min | XX min | ✅/❌ |
| Data integrity check | 100% | XX% | ✅/❌ |
| Single-tenant restore | 60 min | XX min | ✅/❌ |
| DynamoDB restore | 15 min | XX min | ✅/❌ |
| Application functionality | Pass | Pass/Fail | ✅/❌ |

## Issues Found
1. [Issue description]
   - Impact: [Description]
   - Resolution: [How it was fixed]
   - Runbook updated: Yes/No

## Action Items
- [ ] [Action item 1]
- [ ] [Action item 2]

## Approvals
- [ ] Test Lead: [Name] - Date
- [ ] Platform Lead: [Name] - Date
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

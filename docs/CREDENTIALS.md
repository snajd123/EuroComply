# EuroComply Credential Management

> Complete guide to credentials, secrets, and sensitive configuration management.

**Last Updated:** 2026-01-17

---

## Overview

EuroComply uses a layered approach to credential management:

| Environment | Storage | Access Method |
|-------------|---------|---------------|
| **Development** | Local `.env` files | Direct environment variables |
| **Testing (CI)** | GitHub workflow env | Injected at runtime |
| **Staging/Production** | AWS Secrets Manager | ECS `valueFrom` injection |

**Key Principles:**
- No credentials committed to repository
- Production secrets stored in AWS Secrets Manager
- Least-privilege IAM access
- Secrets injected at runtime, never baked into images

---

## Credentials Inventory

### 1. Database Credentials

| Credential | Environment | Storage | Notes |
|------------|-------------|---------|-------|
| `DB_HOST` | Staging/Prod | Terraform output | RDS endpoint |
| `DB_PORT` | Staging/Prod | Terraform output | Default: 5432 |
| `DB_NAME` | Staging/Prod | Terraform output | `eurocomply` |
| `DB_USER` | Staging/Prod | Terraform output | `eurocomply` |
| `DB_PASSWORD` | Staging/Prod | **Secrets Manager** | Auto-generated |
| `DATABASE_URL` | Development | `.env` file | Full connection string |

**Secrets Manager ARN:** `eurocomply/{environment}/database`

**Stored Values:**
```json
{
  "username": "eurocomply",
  "password": "<32-char-random>",
  "host": "<rds-endpoint>",
  "port": 5432,
  "database": "eurocomply"
}
```

### 2. Authentication (Clerk)

| Credential | Environment | Storage | Notes |
|------------|-------------|---------|-------|
| `CLERK_SECRET_KEY` | Staging/Prod | **Secrets Manager** | Backend API key |
| `CLERK_PUBLISHABLE_KEY` | All | Environment variable | Public, safe to expose |

**Secrets Manager ARN:** `eurocomply/{environment}/app-secrets`

**Stored Values:**
```json
{
  "CLERK_SECRET_KEY": "sk_live_..."
}
```

### 3. Cache (Redis/ElastiCache)

| Credential | Environment | Storage | Notes |
|------------|-------------|---------|-------|
| `REDIS_URL` | All | Environment variable | No auth in staging |

**Note:** ElastiCache in VPC uses network-level security (security groups) rather than password authentication.

### 4. CI/CD (GitHub)

| Secret | Purpose | Configured In |
|--------|---------|---------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code Review bot | GitHub repo secrets |
| `PRODUCTION_API_URL` | Production smoke tests | GitHub repo secrets |

**Note:** AWS credentials use OIDC federation - no static keys stored.

### 5. Cloudflare R2 (DPP Storage)

| Credential | Environment | Storage | Notes |
|------------|-------------|---------|-------|
| `R2_ACCESS_KEY_ID` | Staging/Prod | **Secrets Manager** | Account API token |
| `R2_SECRET_ACCESS_KEY` | Staging/Prod | **Secrets Manager** | Account API token secret |
| `R2_BUCKET` | Staging/Prod | Environment variable | `eurocomply-dpps-staging` / `eurocomply-dpps-production` |
| `R2_ENDPOINT` | Staging/Prod | Environment variable | `https://<account-id>.r2.cloudflarestorage.com` |

**Secrets Manager ARN:** `eurocomply/{environment}/cloudflare-r2`

**Stored Values:**
```json
{
  "R2_ACCESS_KEY_ID": "2ad3b660083d1cdcbad023fb63ba0c89",
  "R2_SECRET_ACCESS_KEY": "<secret>",
  "R2_BUCKET": "eurocomply-dpps-staging",
  "R2_ENDPOINT": "https://a674829c753c174d1e9a23b167d5894d.r2.cloudflarestorage.com"
}
```

**Cloudflare Dashboard:** https://dash.cloudflare.com → R2 → Manage R2 API Tokens

---

## Storage Locations

### AWS Secrets Manager

All production credentials are stored in AWS Secrets Manager in the European Sovereign Cloud (`eusc-de-east-1`).

**Naming Convention:** `eurocomply/{environment}/{secret-type}`

| Secret Name | Contents |
|-------------|----------|
| `eurocomply/staging/database` | RDS credentials (user, password, host, port, database) |
| `eurocomply/staging/app-secrets` | Application secrets (CLERK_SECRET_KEY) |
| `eurocomply/staging/cloudflare-r2` | Cloudflare R2 credentials (access key, secret, bucket, endpoint) |
| `eurocomply/production/database` | RDS credentials |
| `eurocomply/production/app-secrets` | Application secrets |
| `eurocomply/production/cloudflare-r2` | Cloudflare R2 credentials |

### Terraform State

Terraform state contains references to secret ARNs but not the secret values themselves. State is stored encrypted in S3.

**State Bucket:** `eurocomply-terraform-state`
**Encryption:** AWS KMS (default key)

### GitHub Repository Secrets

Configure at: `https://github.com/{org}/{repo}/settings/secrets/actions`

Required secrets:
- `CLAUDE_CODE_OAUTH_TOKEN` - For AI code review
- `PRODUCTION_API_URL` - For production smoke tests (when production is live)

---

## How Secrets Flow to Applications

### Development

```
.env file → Docker Compose → Container environment
```

**Setup:**
```bash
cp .env.example .env
# Edit .env with your values
docker compose up
```

### CI/CD Testing

```
GitHub workflow env → Container environment
```

Test credentials are non-sensitive placeholders defined directly in workflow files.

### Staging/Production

```
Terraform → Secrets Manager → ECS Task Definition → Container environment
```

**Flow:**
1. Terraform creates secrets in AWS Secrets Manager
2. ECS Task Definition references secrets via ARN
3. ECS Execution Role has permission to read secrets
4. At container start, ECS injects secret values as environment variables

**Terraform Configuration:**
```hcl
# In ECS module
secrets = [
  {
    name      = "CLERK_SECRET_KEY"
    valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CLERK_SECRET_KEY::"
  },
  {
    name      = "DB_PASSWORD"
    valueFrom = "${module.rds.db_credentials_secret_arn}:password::"
  }
]
```

---

## Managing Credentials

### View Current Secrets (AWS CLI)

```bash
# List all secrets
aws secretsmanager list-secrets \
  --endpoint-url https://secretsmanager.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1

# Get a secret value
aws secretsmanager get-secret-value \
  --secret-id eurocomply/staging/database \
  --endpoint-url https://secretsmanager.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1 \
  | jq -r '.SecretString | fromjson'
```

### Rotate Database Password

Database password is generated by Terraform using `random_password`. To rotate:

```bash
cd infrastructure/terraform/environments/staging

# Taint the password resource to force regeneration
terraform taint module.rds.random_password.db

# Apply to regenerate password and update Secrets Manager
terraform apply
```

**Note:** This will:
1. Generate a new 32-character password
2. Update the RDS instance
3. Update the Secrets Manager secret
4. ECS tasks will get the new password on next deployment

### Update Clerk Secret Key

```bash
# Update via AWS CLI
aws secretsmanager put-secret-value \
  --secret-id eurocomply/staging/app-secrets \
  --secret-string '{"CLERK_SECRET_KEY":"sk_live_new_key_here"}' \
  --endpoint-url https://secretsmanager.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1

# Force ECS to redeploy with new secret
aws ecs update-service \
  --cluster eurocomply-staging-cluster \
  --service eurocomply-staging-api \
  --force-new-deployment \
  --endpoint-url https://ecs.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1
```

### Add New Secret

1. **Add to Terraform** (`environments/staging/main.tf`):
```hcl
resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    CLERK_SECRET_KEY = var.clerk_secret_key
    NEW_SECRET_KEY   = var.new_secret_key  # Add new secret
  })
}
```

2. **Add variable** (`environments/staging/variables.tf`):
```hcl
variable "new_secret_key" {
  description = "Description of new secret"
  type        = string
  sensitive   = true
  default     = "placeholder"
}
```

3. **Pass to ECS** (`environments/staging/main.tf`):
```hcl
secrets = [
  # ... existing secrets ...
  {
    name      = "NEW_SECRET_KEY"
    valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:NEW_SECRET_KEY::"
  }
]
```

4. **Apply:**
```bash
terraform apply -var="new_secret_key=actual_value"
```

---

## Security Best Practices

### What We Do

| Practice | Implementation |
|----------|----------------|
| **No hardcoded secrets** | All secrets in Secrets Manager or env vars |
| **Encryption at rest** | Secrets Manager uses KMS encryption |
| **Encryption in transit** | All connections use TLS/SSL |
| **Least privilege** | ECS roles only access specific secrets |
| **Audit logging** | CloudTrail logs Secrets Manager access |
| **Sensitive terraform vars** | `sensitive = true` prevents logging |
| **Network isolation** | RDS/Redis in private subnets |

### IAM Permissions

**ECS Execution Role** can:
- `secretsmanager:GetSecretValue` for specific secret ARNs
- `ecr:GetAuthorizationToken` for pulling images
- `logs:CreateLogStream`, `logs:PutLogEvents` for logging

**ECS Task Role** can:
- Access application-specific AWS resources
- No secrets access (secrets injected by execution role)

### Audit & Compliance

**View secret access logs:**
```bash
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventName,AttributeValue=GetSecretValue \
  --endpoint-url https://cloudtrail.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1
```

---

## Environment Reference

### Development (.env)

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/eurocomply

# Authentication
CLERK_SECRET_KEY=sk_test_xxxxx
CLERK_PUBLISHABLE_KEY=pk_test_xxxxx

# Cache
REDIS_URL=redis://localhost:6379

# Application
NODE_ENV=development
PORT=3000
```

### Staging/Production (ECS)

Environment variables (non-sensitive):
- `NODE_ENV=production`
- `PORT=3000`
- `DB_HOST=<rds-endpoint>`
- `DB_PORT=5432`
- `DB_NAME=eurocomply`
- `DB_USER=eurocomply`
- `DB_SSL=true`
- `REDIS_URL=<elasticache-endpoint>`

Secrets (from Secrets Manager):
- `CLERK_SECRET_KEY`
- `DB_PASSWORD`

---

## Troubleshooting

### ECS Container Can't Access Secrets

1. Check execution role has Secrets Manager permissions:
```bash
aws iam get-role-policy \
  --role-name eurocomply-staging-ecs-execution \
  --policy-name secrets-access \
  --endpoint-url https://iam.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1
```

2. Verify secret ARN in task definition matches actual secret

3. Check CloudWatch logs for ECS task failures

### Database Connection Fails

1. Verify password in Secrets Manager:
```bash
aws secretsmanager get-secret-value \
  --secret-id eurocomply/staging/database \
  --endpoint-url https://secretsmanager.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1 \
  | jq -r '.SecretString | fromjson | .password'
```

2. Check security group allows ECS → RDS connection

3. Verify RDS instance is running and accessible

### Clerk Authentication Fails

1. Verify secret is set:
```bash
aws secretsmanager get-secret-value \
  --secret-id eurocomply/staging/app-secrets \
  --endpoint-url https://secretsmanager.eusc-de-east-1.amazonaws.eu \
  --region eusc-de-east-1 \
  | jq -r '.SecretString | fromjson | .CLERK_SECRET_KEY'
```

2. Check key matches Clerk dashboard (test vs live key)

3. Force ECS redeployment to pick up latest secret

---

## Related Documentation

- [Infrastructure Overview](./plans/2026-01-16-devops-infrastructure-design.md)
- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [ECS Task Definition Secrets](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data-secrets.html)

---

*For security concerns, contact the infrastructure team.*

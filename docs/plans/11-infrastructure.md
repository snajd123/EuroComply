# Infrastructure

**Status:** Active
**Last Updated:** 2026-01-21

---

## 1. Overview

EuroComply runs entirely on AWS European Sovereign Cloud with Cloudflare for edge delivery. This architecture provides maximum EU data sovereignty, high availability, and cost-optimized DPP hosting.

### Infrastructure Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    EUROCOMPLY INFRASTRUCTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  AWS EUROPEAN SOVEREIGN CLOUD (eusc-de-east-1)                              │
│  ─────────────────────────────────────────────                              │
│  • VPC with public/private subnets (2 AZs)                                  │
│  • ECS Fargate (API, walt.id services)                                      │
│  • RDS PostgreSQL (Multi-AZ production)                                     │
│  • ElastiCache Redis (session, queue)                                       │
│  • Secrets Manager (credentials)                                            │
│  • KMS (encryption at rest)                                                 │
│                                                                              │
│  CLOUDFLARE (Global Edge)                                                   │
│  ───────────────────────                                                    │
│  • DNS (eurocomply.eu)                                                      │
│  • R2 (DPP storage - zero egress)                                          │
│  • Workers (content negotiation)                                            │
│  • WAF (rate limiting, bot protection)                                      │
│                                                                              │
│  VERCEL (Frontend)                                                          │
│  ────────────────                                                           │
│  • Next.js dashboard (app.eurocomply.eu)                                    │
│  • Edge deployment                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Architecture

| Decision | Rationale |
|----------|-----------|
| **AWS Sovereign Cloud** | Maximum EU data sovereignty, BSI C5 certified |
| **Cloudflare R2 for DPPs** | Zero egress cost (AWS would be EUR 38K/mo at scale) |
| **ECS Fargate** | Serverless containers, no EC2 management |
| **PostgreSQL** | MikroORM support, schema-per-tenant multi-tenancy |

---

## 2. AWS European Sovereign Cloud

### Overview

| Attribute | Value |
|-----------|-------|
| Partition | `aws-eusc` |
| Region | `eusc-de-east-1` |
| Location | Brandenburg, Germany |
| Console | https://console.aws.eu |
| Certification | BSI C5, ISO 27001, SOC 1/2/3 |

### Sovereign Cloud Benefits

- **Complete EU data residency** - All data AND metadata stays in EU
- **EU-only operations** - Only EU-resident staff can access infrastructure
- **EU legal jurisdiction** - German-incorporated subsidiaries under EU law
- **Marketing differentiator** - Only compliance platform on Sovereign Cloud

### Key Differences from Standard AWS

| Feature | Standard AWS | European Sovereign Cloud |
|---------|-------------|-------------------------|
| Partition | `aws` | `aws-eusc` |
| ARN format | `arn:aws:...` | `arn:aws-eusc:...` |
| Console | console.aws.amazon.com | console.aws.eu |
| API endpoints | `.amazonaws.com` | `.amazonaws.eu` |
| Service principals | `.amazonaws.com` | `.amazonaws.com` (unchanged) |

### Service Principal Note

Service principals (for IAM policies) remain `.amazonaws.com` even in Sovereign Cloud:
- `rds.amazonaws.com`
- `ecs-tasks.amazonaws.com`
- `secretsmanager.amazonaws.com`

This doesn't compromise sovereignty - principals are IAM identity strings, not network destinations.

---

## 3. Network Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VPC ARCHITECTURE (10.0.0.0/16)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  INTERNET                                                                   │
│      │                                                                      │
│      ▼                                                                      │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  CLOUDFLARE (WAF, CDN)                                             │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│      │                                                                      │
│      ▼                                                                      │
│  PUBLIC SUBNETS (10.0.1.0/24, 10.0.2.0/24)                                 │
│  ┌────────────────────┐  ┌────────────────────┐                            │
│  │  ALB               │  │  NAT Gateway       │                            │
│  │  (TLS termination) │  │  (outbound only)   │                            │
│  └─────────┬──────────┘  └─────────┬──────────┘                            │
│            │                       │                                        │
│            ▼                       ▼                                        │
│  PRIVATE SUBNETS (10.0.10.0/24, 10.0.20.0/24)                              │
│  ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐   │
│  │  ECS Fargate       │  │  ECS Fargate       │  │  ElastiCache       │   │
│  │  (API Service)     │  │  (walt.id)         │  │  (Redis)           │   │
│  │                    │  │                    │  │                    │   │
│  │  • Port 3000       │  │  • Port 7000-7003  │  │  • Port 6379       │   │
│  │  • Auto-scaling    │  │  • Internal only   │  │  • AUTH enabled    │   │
│  └────────────────────┘  └────────────────────┘  └────────────────────┘   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────┐    │
│  │  RDS PostgreSQL (Multi-AZ)                                         │    │
│  │  • Private subnet only                                             │    │
│  │  • IAM authentication (app user)                                   │    │
│  │  • SSL required                                                    │    │
│  └────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
│  SERVICE DISCOVERY (Cloud Map)                                              │
│  └── eurocomply.internal                                                   │
│      └── waltid.staging.eurocomply.internal                                │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Security Groups

| Security Group | Inbound | Outbound |
|----------------|---------|----------|
| ALB | 443 from Cloudflare IPs | ECS on 3000 |
| ECS (API) | 3000 from ALB | RDS, Redis, walt.id, NAT |
| ECS (walt.id) | 7000-7003 from ECS | NAT (for Docker pulls) |
| RDS | 5432 from ECS | HTTPS only (patches) |
| ElastiCache | 6379 from ECS | None |

---

## 4. Database Architecture

### Three-User Security Model

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     THREE-USER DATABASE ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. eurocomply (Master User)                                                │
│     ├── Auth: Password (from Secrets Manager)                               │
│     ├── Used by: Lambda only (during Terraform apply)                       │
│     ├── Privileges: rds_superuser (automatic), NO rds_iam                   │
│     └── Purpose: Database administration and user management                │
│                                                                              │
│  2. eurocomply_app (Application User)                                       │
│     ├── Auth: IAM Token (15-minute expiry, auto-generated)                  │
│     ├── Used by: ECS Fargate tasks at runtime                               │
│     ├── Privileges: SELECT, INSERT, UPDATE, DELETE only (DML)               │
│     └── Purpose: Application runtime with least privilege                   │
│                                                                              │
│  3. eurocomply_migrate (Migration User)                                     │
│     ├── Auth: Password (from Secrets Manager)                               │
│     ├── Used by: CI/CD pipelines for MikroORM migrations                    │
│     ├── Privileges: Schema owner, full DDL + DML                            │
│     └── Purpose: Database schema migrations                                 │
│                                                                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                         SECURITY BENEFITS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  If ECS task is compromised:                                                │
│  ✗ Cannot DROP or ALTER tables                                              │
│  ✗ Cannot CREATE new tables                                                 │
│  ✗ Cannot GRANT permissions                                                 │
│  ✓ Can only read/write existing data (blast radius contained)              │
│                                                                              │
│  IAM Token Benefits:                                                        │
│  • No static passwords in ECS environment                                   │
│  • Tokens expire in 15 minutes (auto-refresh)                               │
│  • CloudTrail logs all token generation                                     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MikroORM Configuration

```typescript
import { Options, PostgreSqlDriver } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import { generateRDSAuthToken } from '@aws-sdk/credential-providers';

interface DatabaseConfig {
  host: string;
  port: number;
  dbName: string;
  user: string;
  region: string;
}

async function getIamAuthToken(config: DatabaseConfig): Promise<string> {
  const token = await generateRDSAuthToken({
    hostname: config.host,
    port: config.port,
    username: config.user,
    region: config.region,
  });
  return token;
}

export async function createMikroOrmConfig(): Promise<Options> {
  const isProduction = process.env.NODE_ENV === 'production';
  const useIamAuth = process.env.DB_IAM_AUTH === 'true';

  const baseConfig: Options = {
    driver: PostgreSqlDriver,
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    dbName: process.env.DB_NAME,
    user: process.env.DB_USER,
    entities: ['./dist/entities/**/*.js'],
    entitiesTs: ['./src/entities/**/*.ts'],
    extensions: [Migrator],
    migrations: {
      path: './dist/migrations',
      pathTs: './src/migrations',
    },
    driverOptions: {
      connection: {
        ssl: isProduction ? { rejectUnauthorized: true } : false,
      },
    },
  };

  if (useIamAuth) {
    // Use IAM token authentication for production
    const token = await getIamAuthToken({
      host: process.env.DB_HOST!,
      port: parseInt(process.env.DB_PORT || '5432', 10),
      dbName: process.env.DB_NAME!,
      user: process.env.DB_USER!,
      region: process.env.AWS_REGION || 'eusc-de-east-1',
    });

    return {
      ...baseConfig,
      password: token,
      pool: {
        // Refresh connection before token expires
        idleTimeoutMillis: 10 * 60 * 1000, // 10 minutes
        max: 10,
      },
    };
  }

  return {
    ...baseConfig,
    password: process.env.DB_PASSWORD,
  };
}
```

### Schema-per-Tenant Multi-Tenancy

```typescript
import { EntityManager } from '@mikro-orm/postgresql';

export class TenantConnectionManager {
  private readonly schemaPrefix = 'tenant_';

  constructor(private readonly em: EntityManager) {}

  /**
   * Get EntityManager scoped to tenant schema
   */
  forTenant(organizationId: string): EntityManager {
    const schemaName = this.getSchemaName(organizationId);
    return this.em.fork({ schema: schemaName });
  }

  /**
   * Create tenant schema with all required tables
   */
  async createTenantSchema(organizationId: string): Promise<void> {
    const schemaName = this.getSchemaName(organizationId);

    // Create schema
    await this.em.execute(`CREATE SCHEMA IF NOT EXISTS "${schemaName}"`);

    // Grant permissions to app user
    await this.em.execute(`
      GRANT USAGE ON SCHEMA "${schemaName}" TO eurocomply_app
    `);
    await this.em.execute(`
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "${schemaName}" TO eurocomply_app
    `);
    await this.em.execute(`
      ALTER DEFAULT PRIVILEGES IN SCHEMA "${schemaName}"
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO eurocomply_app
    `);

    // Run migrations for tenant schema
    const migrator = this.em.getMigrator();
    await migrator.up({ schema: schemaName });
  }

  /**
   * Drop tenant schema (dangerous - use with caution)
   */
  async dropTenantSchema(organizationId: string): Promise<void> {
    const schemaName = this.getSchemaName(organizationId);
    await this.em.execute(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  }

  private getSchemaName(organizationId: string): string {
    // Sanitize to prevent SQL injection
    const sanitized = organizationId.replace(/[^a-zA-Z0-9_]/g, '');
    return `${this.schemaPrefix}${sanitized}`;
  }
}
```

---

## 5. Cloudflare Infrastructure

### Why Cloudflare for DPPs

ESPR mandates free public access to DPPs. At scale, AWS egress would cost EUR 38K/month. Cloudflare R2 has zero egress cost.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLOUDFLARE INFRASTRUCTURE                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  DNS (eurocomply.eu)                                                        │
│  ├── api.eurocomply.eu        → AWS ALB (proxied)                          │
│  ├── app.eurocomply.eu        → Vercel (frontend)                          │
│  ├── dpp.eurocomply.eu        → Cloudflare Workers                         │
│  └── staging.eurocomply.eu    → AWS ALB (staging)                          │
│                                                                              │
│  R2 BUCKETS (zero egress)                                                   │
│  ├── eurocomply-dpps-staging                                                │
│  └── eurocomply-dpps-production                                            │
│      └── /{org_id}/{credential_id}/                                        │
│          ├── credential.json   (signed VC)                                 │
│          ├── qr.png            (GS1 Digital Link)                          │
│          └── preview.html      (human-readable)                            │
│                                                                              │
│  WORKERS                                                                    │
│  └── dpp-serve                                                             │
│      ├── Content negotiation (Accept header)                               │
│      ├── Edge caching (1 hour TTL)                                         │
│      └── GS1 Digital Link resolution                                       │
│                                                                              │
│  WAF RULES                                                                  │
│  ├── Rate limiting (1000 req/min per IP)                                   │
│  └── Bot protection (managed ruleset)                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DPP Worker Implementation

```typescript
interface Env {
  DPP_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Parse GS1 Digital Link: /01/{gtin}/21/{serial}
    const gs1Match = path.match(/^\/01\/(\d{13,14})(?:\/21\/(.+))?$/);
    if (!gs1Match) {
      return new Response('Not Found', { status: 404 });
    }

    const [, gtin, serial] = gs1Match;
    const objectKey = serial
      ? `${gtin}/${serial}/credential.json`
      : `${gtin}/credential.json`;

    // Content negotiation
    const accept = request.headers.get('Accept') || '';
    let filename = 'credential.json';
    let contentType = 'application/vc+ld+json';

    if (accept.includes('text/html')) {
      filename = 'preview.html';
      contentType = 'text/html';
    } else if (accept.includes('image/png')) {
      filename = 'qr.png';
      contentType = 'image/png';
    }

    const objectPath = objectKey.replace('credential.json', filename);
    const object = await env.DPP_BUCKET.get(objectPath);

    if (!object) {
      return new Response('DPP Not Found', { status: 404 });
    }

    return new Response(object.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  },
};
```

---

## 6. CI/CD Pipeline

### GitHub Actions Workflows

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    GITHUB ACTIONS WORKFLOWS                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ci.yml                                                                     │
│  ──────                                                                      │
│  Trigger: push to any branch, all PRs                                       │
│  Jobs: lint → typecheck → unit-tests → integration-tests → build            │
│                                                                              │
│  deploy-staging.yml                                                         │
│  ─────────────────                                                           │
│  Trigger: push to main (after CI passes)                                    │
│  Jobs: build image → push ECR → run migrations → update ECS → smoke tests   │
│                                                                              │
│  deploy-production.yml                                                      │
│  ────────────────────                                                        │
│  Trigger: release tag (v*)                                                  │
│  Jobs: build image → push ECR → run migrations → update ECS → smoke tests   │
│                                                                              │
│  terraform.yml                                                              │
│  ─────────────                                                               │
│  Trigger: changes to infrastructure/terraform/**                            │
│  Jobs: fmt → plan → apply (manual approval for production)                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Deployment Flow

```yaml
# deploy-staging.yml
name: Deploy to Staging

on:
  push:
    branches: [main]

permissions:
  id-token: write
  contents: read

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging

    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS Credentials (Sovereign Cloud)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws-eusc:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/github-actions
          aws-region: eusc-de-east-1

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
        with:
          registry-type: private

      - name: Build and Push Image
        env:
          REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          REPOSITORY: eurocomply-api
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $REGISTRY/$REPOSITORY:$IMAGE_TAG .
          docker push $REGISTRY/$REPOSITORY:$IMAGE_TAG
          docker tag $REGISTRY/$REPOSITORY:$IMAGE_TAG $REGISTRY/$REPOSITORY:staging
          docker push $REGISTRY/$REPOSITORY:staging

      - name: Run Database Migrations
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL_MIGRATE }}
        run: |
          npx mikro-orm migration:up

      - name: Update ECS Service
        run: |
          aws ecs update-service \
            --cluster eurocomply-staging \
            --service eurocomply-api-staging \
            --force-new-deployment

      - name: Wait for Deployment
        run: |
          aws ecs wait services-stable \
            --cluster eurocomply-staging \
            --services eurocomply-api-staging

      - name: Smoke Test
        run: |
          curl -f https://api-staging.eurocomply.eu/health || exit 1
```

### GitHub OIDC for Sovereign Cloud

```hcl
# GitHub Actions OIDC provider in Sovereign Cloud
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]
}

resource "aws_iam_role" "github_actions" {
  name = "github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:eurocomply/eurocomply:*"
          }
        }
      }
    ]
  })
}
```

---

## 7. walt.id SSI Services

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    walt.id COMMUNITY STACK (ECS Fargate)                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                       │
│  │   Core API   │  │  Signatory   │  │  Custodian   │                       │
│  │   (7000)     │  │  (7001)      │  │  (7002)      │                       │
│  │              │  │              │  │              │                       │
│  │  DID ops     │  │  VC signing  │  │  Key mgmt    │                       │
│  │  Resolution  │  │  Templates   │  │  Storage     │                       │
│  └──────────────┘  └──────────────┘  └──────────────┘                       │
│                                                                              │
│  ┌──────────────┐                                                           │
│  │   Auditor    │   Storage: EFS (persistent across restarts)              │
│  │   (7003)     │   Access: Internal only (via Service Discovery)          │
│  │              │   DNS: waltid.staging.eurocomply.internal                 │
│  │  VC verify   │                                                           │
│  └──────────────┘                                                           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### ECS Task Definition

```hcl
resource "aws_ecs_task_definition" "waltid" {
  family                   = "${var.project}-${var.environment}-waltid"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 512
  memory                   = 1024
  execution_role_arn       = aws_iam_role.waltid_execution.arn
  task_role_arn            = aws_iam_role.waltid_task.arn

  container_definitions = jsonencode([
    {
      name      = "waltid-core"
      image     = "waltid/ssikit:latest"
      essential = true
      command   = ["serve", "-b", "0.0.0.0"]

      portMappings = [
        { containerPort = 7000, protocol = "tcp" },
        { containerPort = 7001, protocol = "tcp" },
        { containerPort = 7002, protocol = "tcp" },
        { containerPort = 7003, protocol = "tcp" },
      ]

      mountPoints = [
        {
          sourceVolume  = "waltid-data"
          containerPath = "/data"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.waltid.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "waltid"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --spider http://localhost:7000/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  volume {
    name = "waltid-data"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.waltid.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.waltid.id
      }
    }
  }
}
```

### Service Discovery

```hcl
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.environment}.eurocomply.internal"
  description = "Private DNS for EuroComply ${var.environment}"
  vpc         = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "waltid" {
  name = "waltid"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}
```

---

## 8. Terraform Structure

```
infrastructure/
├── terraform/
│   ├── modules/                    ← Reusable components
│   │   ├── vpc/                    (VPC, subnets, NAT, flow logs)
│   │   ├── security-groups/        (ALB, ECS, RDS, ElastiCache, walt.id)
│   │   ├── alb/                    (Load balancer, HTTPS listener)
│   │   ├── ecs/                    (Cluster, API service, task definitions)
│   │   ├── rds/                    (PostgreSQL, parameter group, IAM auth)
│   │   ├── elasticache/            (Redis, parameter group, AUTH token)
│   │   ├── ecr/                    (Container registry, lifecycle policy)
│   │   ├── waltid/                 (SSI services, EFS, service discovery)
│   │   └── kms/                    (Encryption keys)
│   │
│   ├── environments/               ← Environment configs
│   │   ├── staging/
│   │   │   ├── main.tf
│   │   │   ├── variables.tf
│   │   │   └── terraform.tfvars
│   │   └── production/
│   │       ├── main.tf
│   │       ├── variables.tf
│   │       └── terraform.tfvars
│   │
│   └── bootstrap/                  ← One-time setup
│       └── main.tf                 (S3 state, DynamoDB locks, ECR, OIDC)
│
└── lambda/
    └── rds-iam-setup/              (Lambda for RDS IAM auth setup)
```

### Environment Differences

| Variable | Staging | Production |
|----------|---------|------------|
| `rds_instance_class` | db.t4g.micro | db.t4g.small |
| `rds_multi_az` | false | true |
| `ecs_api_desired_count` | 1 | 2 |
| `elasticache_node_type` | cache.t4g.micro | cache.t4g.small |

### Terraform Provider Configuration

```hcl
provider "aws" {
  region = "eusc-de-east-1"

  endpoints {
    sts            = "https://sts.eusc-de-east-1.amazonaws.eu"
    iam            = "https://iam.eusc-de-east-1.amazonaws.eu"
    s3             = "https://s3.eusc-de-east-1.amazonaws.eu"
    ecr            = "https://ecr.eusc-de-east-1.amazonaws.eu"
    ecs            = "https://ecs.eusc-de-east-1.amazonaws.eu"
    rds            = "https://rds.eusc-de-east-1.amazonaws.eu"
    secretsmanager = "https://secretsmanager.eusc-de-east-1.amazonaws.eu"
  }
}

terraform {
  backend "s3" {
    bucket         = "eurocomply-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "eusc-de-east-1"
    dynamodb_table = "eurocomply-terraform-locks"
    encrypt        = true
    endpoints = {
      s3       = "https://s3.eusc-de-east-1.amazonaws.eu"
      dynamodb = "https://dynamodb.eusc-de-east-1.amazonaws.eu"
    }
  }
}
```

---

## 9. Secrets Management

### Secrets Manager Structure

| Secret Path | Contents | Access |
|-------------|----------|--------|
| `/eurocomply/{env}/database` | RDS master password | Lambda only |
| `/eurocomply/{env}/database-migrate` | Migration user password | CI/CD only |
| `/eurocomply/{env}/redis` | ElastiCache AUTH token | ECS |
| `/eurocomply/{env}/clerk` | Clerk API keys | ECS |
| `/eurocomply/{env}/stripe` | Stripe API keys | ECS |
| `/eurocomply/{env}/r2` | Cloudflare R2 credentials | ECS |

### Secret Rotation

```hcl
resource "aws_secretsmanager_secret_rotation" "database" {
  secret_id           = aws_secretsmanager_secret.database.id
  rotation_lambda_arn = aws_lambda_function.secret_rotation.arn

  rotation_rules {
    automatically_after_days = 30
  }
}
```

---

## 10. Monitoring & Alerting

### CloudWatch Dashboards

| Dashboard | Metrics |
|-----------|---------|
| **API Health** | Request count, latency (p50/p95/p99), error rate |
| **Database** | Connection count, CPU, IOPS, replica lag |
| **ECS** | Task count, CPU/memory utilization, restarts |
| **DPP Delivery** | R2 request count, Worker invocations, cache hit rate |

### Alarms

| Alarm | Threshold | Action |
|-------|-----------|--------|
| API 5xx rate > 5% | 5 min | PagerDuty |
| RDS CPU > 80% | 10 min | Email |
| ECS task unhealthy | Immediate | Auto-restart |
| DPP Worker errors > 1% | 5 min | Email |

### Log Aggregation

All logs flow to CloudWatch Logs with structured JSON format:

```typescript
const logger = {
  info: (message: string, context?: Record<string, unknown>) => {
    console.log(JSON.stringify({
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      ...context,
    }));
  },
  error: (message: string, error: Error, context?: Record<string, unknown>) => {
    console.log(JSON.stringify({
      level: 'error',
      message,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      timestamp: new Date().toISOString(),
      ...context,
    }));
  },
};
```

---

## 11. Cost Estimates

### Monthly Costs (EUR)

| Component | Staging | Production |
|-----------|---------|------------|
| ECS Fargate (API) | 35 | 70 |
| ECS Fargate (walt.id) | 20 | 20 |
| RDS PostgreSQL | 25 | 80 |
| ElastiCache Redis | 15 | 30 |
| ALB | 20 | 20 |
| NAT Gateway | 35 | 35 |
| Secrets Manager | 5 | 5 |
| CloudWatch | 10 | 15 |
| **AWS Subtotal** | **~165** | **~275** |
| Cloudflare (Pro) | 20 | 20 |
| Vercel (Pro) | 20 | 20 |
| **Total** | **~205** | **~315** |

Note: Sovereign Cloud pricing is ~10-20% higher than standard regions.

---

## 12. Disaster Recovery

### Backup Strategy

| Component | Backup | Retention | Recovery |
|-----------|--------|-----------|----------|
| RDS | Automated snapshots | 7 days | Point-in-time (5 min) |
| R2 | Versioning enabled | 30 days | Object restore |
| EFS (walt.id) | AWS Backup | 7 days | Full restore |
| Secrets | KMS encrypted | N/A | Recreate from 1Password |

### Recovery Procedures

1. **Database failure**: Automatic failover to standby (Multi-AZ)
2. **ECS failure**: Auto-restart with circuit breaker rollback
3. **Region failure**: Cross-region not applicable (single Sovereign region)
4. **Complete rebuild**: Terraform + database restore + secrets recreate

---

## 13. Related Documents

| Document | Purpose |
|----------|---------|
| [Architecture](./01-architecture.md) | System architecture |
| [Security](./03-security.md) | Auth, encryption, compliance |
| [Data Model](./02-data-model.md) | Database schema |
| [Integrations](./10-integrations.md) | External systems |
| [Regulatory Advisor](./13-regulatory-advisor.md) | Regulation PDF storage, AI services |

---

**Document Control**

| Version | Date | Changes |
|---------|------|---------|
| 2.2 | 2026-01-26 | Confirmed Clerk as auth provider throughout |
| 2.0 | 2026-01-21 | Consolidated from DevOps, Testing, walt.id infrastructure designs |

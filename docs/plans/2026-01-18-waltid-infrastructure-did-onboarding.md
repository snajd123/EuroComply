# walt.id Infrastructure & DID Onboarding Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deploy walt.id services on AWS ECS and integrate DID creation into organization/user onboarding flow.

**Architecture:** walt.id runs as internal ECS service (not exposed to internet). API service connects via internal DNS. DIDs created at organization creation and user org-join.

**Tech Stack:** Terraform, AWS ECS Fargate, walt.id Community Stack (Docker), TypeScript

---

## Context

### Current State
- Database schema complete: `Organization.did`, `UserDidHistory`, `OrgDidHistory` tables exist
- `WaltIdClient` implemented with `createDid()`, `sign()`, `verify()` methods
- `SealedArtifactService` expects DIDs to exist in history tables
- Organization creation (`organization.service.ts`) does NOT create DIDs
- No walt.id infrastructure in Terraform

### Target State
- walt.id services running on ECS (internal, same VPC as API)
- Organization DID created automatically at org creation
- User DID created when user joins an organization
- All DIDs tracked in history tables with status list indices

### walt.id Architecture
```
┌─────────────────────────────────────────────────────────────────┐
│                    walt.id Community Stack                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Core API   │  │  Signatory   │  │  Custodian   │          │
│  │   (port 7000)│  │  (port 7001) │  │  (port 7002) │          │
│  │              │  │              │  │              │          │
│  │  DID ops     │  │  VC signing  │  │  Key mgmt    │          │
│  │  Resolution  │  │  Templates   │  │  Storage     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│                                                                  │
│  ┌──────────────┐                                               │
│  │   Auditor    │   Note: We use Core API primarily.            │
│  │  (port 7003) │   Signatory/Custodian for key operations.     │
│  │              │   Auditor for verification (optional).        │
│  │  VC verify   │                                               │
│  └──────────────┘                                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Infrastructure (Terraform)

### Task 1.1: Create walt.id Terraform Module

**Files:**
- Create: `infrastructure/terraform/modules/waltid/main.tf`
- Create: `infrastructure/terraform/modules/waltid/variables.tf`
- Create: `infrastructure/terraform/modules/waltid/outputs.tf`

**Step 1: Create variables.tf**

Create `infrastructure/terraform/modules/waltid/variables.tf`:

```hcl
variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "aws_region" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "ecs_cluster_id" {
  type        = string
  description = "Existing ECS cluster ID to deploy walt.id services"
}

variable "cpu" {
  type    = number
  default = 512
}

variable "memory" {
  type    = number
  default = 1024
}

variable "log_retention_days" {
  type    = number
  default = 30
}
```

**Step 2: Create main.tf**

Create `infrastructure/terraform/modules/waltid/main.tf`:

```hcl
# walt.id Community Stack Module
# Deploys walt.id services as internal ECS service

locals {
  name_prefix = "${var.project}-${var.environment}"
  partition   = "aws-eusc"

  # walt.id container images (official)
  waltid_image = "waltid/ssikit:latest"
}

# =============================================================================
# CloudWatch Log Group
# =============================================================================
resource "aws_cloudwatch_log_group" "waltid" {
  name              = "/ecs/${local.name_prefix}-waltid"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${local.name_prefix}-waltid-logs"
  }
}

# =============================================================================
# IAM Roles
# =============================================================================
resource "aws_iam_role" "waltid_execution" {
  name = "${local.name_prefix}-waltid-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "waltid_execution" {
  role       = aws_iam_role.waltid_execution.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role" "waltid_task" {
  name = "${local.name_prefix}-waltid-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# =============================================================================
# ECS Task Definition - All-in-One walt.id
# =============================================================================
# walt.id SSI Kit runs all services in one container with different ports
resource "aws_ecs_task_definition" "waltid" {
  family                   = "${local.name_prefix}-waltid"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.waltid_execution.arn
  task_role_arn            = aws_iam_role.waltid_task.arn

  container_definitions = jsonencode([
    {
      name      = "waltid-core"
      image     = local.waltid_image
      essential = true
      command   = ["serve", "-b", "0.0.0.0"]

      portMappings = [
        { containerPort = 7000, protocol = "tcp" },  # Core API
        { containerPort = 7001, protocol = "tcp" },  # Signatory
        { containerPort = 7002, protocol = "tcp" },  # Custodian
        { containerPort = 7003, protocol = "tcp" },  # Auditor
      ]

      environment = [
        { name = "WALTID_DATA_ROOT", value = "/data" }
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
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:7000/api/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${local.name_prefix}-waltid"
  }
}

# =============================================================================
# ECS Service - Internal (No Load Balancer)
# =============================================================================
resource "aws_ecs_service" "waltid" {
  name            = "${local.name_prefix}-waltid"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.waltid.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = false
  }

  # Service discovery for internal DNS
  service_registries {
    registry_arn = aws_service_discovery_service.waltid.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = {
    Name = "${local.name_prefix}-waltid"
  }
}

# =============================================================================
# Service Discovery - Internal DNS
# =============================================================================
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.environment}.eurocomply.internal"
  description = "Private DNS namespace for EuroComply ${var.environment}"
  vpc         = data.aws_subnet.first.vpc_id
}

data "aws_subnet" "first" {
  id = var.private_subnet_ids[0]
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

**Step 3: Create outputs.tf**

Create `infrastructure/terraform/modules/waltid/outputs.tf`:

```hcl
output "service_name" {
  value = aws_ecs_service.waltid.name
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.waltid.arn
}

output "core_api_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7000"
  description = "Internal endpoint for walt.id Core API"
}

output "signatory_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7001"
  description = "Internal endpoint for walt.id Signatory"
}

output "custodian_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7002"
  description = "Internal endpoint for walt.id Custodian"
}

output "auditor_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7003"
  description = "Internal endpoint for walt.id Auditor"
}

output "dns_namespace_id" {
  value = aws_service_discovery_private_dns_namespace.main.id
}
```

**Step 4: Commit**

```bash
git add infrastructure/terraform/modules/waltid/
git commit -m "feat(infra): add walt.id Terraform module for ECS deployment"
```

---

### Task 1.2: Add Security Group for walt.id

**Files:**
- Modify: `infrastructure/terraform/modules/security-groups/main.tf`

**Step 1: Read current security groups file**

Read the file to understand existing structure.

**Step 2: Add walt.id security group**

Add after existing security groups:

```hcl
# =============================================================================
# walt.id Security Group
# =============================================================================
resource "aws_security_group" "waltid" {
  name        = "${local.name_prefix}-waltid-sg"
  description = "Security group for walt.id services"
  vpc_id      = var.vpc_id

  # Allow inbound from ECS (API service)
  ingress {
    description     = "Core API from ECS"
    from_port       = 7000
    to_port         = 7003
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # Allow all outbound
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-waltid-sg"
  }
}
```

**Step 3: Add output**

```hcl
output "waltid_security_group_id" {
  value = aws_security_group.waltid.id
}
```

**Step 4: Commit**

```bash
git add infrastructure/terraform/modules/security-groups/main.tf
git commit -m "feat(infra): add security group for walt.id internal access"
```

---

### Task 1.3: Integrate walt.id Module into Staging

**Files:**
- Modify: `infrastructure/terraform/environments/staging/main.tf`
- Modify: `infrastructure/terraform/environments/staging/outputs.tf`

**Step 1: Add walt.id module instantiation**

Add after the ECS module in staging/main.tf:

```hcl
# =============================================================================
# walt.id Services (Internal)
# =============================================================================
module "waltid" {
  source = "../../modules/waltid"

  project            = local.project
  environment        = local.environment
  aws_region         = var.aws_region
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.waltid_security_group_id
  ecs_cluster_id     = module.ecs.cluster_id

  cpu    = 512
  memory = 1024
}
```

**Step 2: Update ECS environment variables**

Update the ECS module's environment_variables to include walt.id endpoints:

```hcl
environment_variables = [
  { name = "NODE_ENV", value = "production" },
  { name = "PORT", value = tostring(var.app_port) },
  # Database connection
  { name = "DB_HOST", value = module.rds.db_instance_address },
  { name = "DB_PORT", value = tostring(module.rds.db_instance_port) },
  { name = "DB_NAME", value = module.rds.db_name },
  { name = "DB_USER", value = module.rds.db_username },
  { name = "DB_SSL", value = "true" },
  { name = "REDIS_URL", value = module.elasticache.redis_url },
  # walt.id endpoints (internal DNS)
  { name = "WALTID_CORE_URL", value = module.waltid.core_api_endpoint },
  { name = "WALTID_SIGNATORY_URL", value = module.waltid.signatory_endpoint },
  { name = "WALTID_CUSTODIAN_URL", value = module.waltid.custodian_endpoint },
  { name = "WALTID_AUDITOR_URL", value = module.waltid.auditor_endpoint },
]
```

**Step 3: Add outputs**

Add to staging/outputs.tf:

```hcl
output "waltid_core_endpoint" {
  value       = module.waltid.core_api_endpoint
  description = "Internal walt.id Core API endpoint"
}
```

**Step 4: Commit**

```bash
git add infrastructure/terraform/environments/staging/
git commit -m "feat(infra): integrate walt.id module into staging environment"
```

---

### Task 1.4: Update Environment Configuration

**Files:**
- Modify: `.env.example`
- Modify: `apps/api/.env.example`

**Step 1: Update root .env.example**

Add walt.id configuration section:

```bash
# walt.id Configuration (SSI Kit)
# For local development, run walt.id via Docker:
# docker run -p 7000-7003:7000-7003 waltid/ssikit serve -b 0.0.0.0
WALTID_CORE_URL=http://localhost:7000
WALTID_SIGNATORY_URL=http://localhost:7001
WALTID_CUSTODIAN_URL=http://localhost:7002
WALTID_AUDITOR_URL=http://localhost:7003
```

**Step 2: Update apps/api/.env.example**

Add same variables.

**Step 3: Update docker-compose.yml**

Add walt.id service for local development:

```yaml
  waltid:
    image: waltid/ssikit:latest
    command: serve -b 0.0.0.0
    ports:
      - "7000:7000"
      - "7001:7001"
      - "7002:7002"
      - "7003:7003"
    volumes:
      - waltid_data:/data
    profiles:
      - full
      - waltid

volumes:
  waltid_data:
```

**Step 4: Commit**

```bash
git add .env.example apps/api/.env.example docker-compose.yml
git commit -m "feat(config): add walt.id configuration for local and production"
```

---

## Phase 2: DID Creation Service

### Task 2.1: Create DID Service

**Files:**
- Create: `apps/api/src/services/did.service.ts`
- Create: `apps/api/src/services/did.service.test.ts`

**Step 1: Write the failing test**

Create `apps/api/src/services/did.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { DidService } from './did.service.js';

interface MockDependencies {
  waltIdClient: {
    createDid: Mock;
  };
  statusListService: {
    allocateIndex: Mock;
  };
  prisma: {
    organization: { update: Mock };
    orgDidHistory: { create: Mock };
    userDidHistory: { create: Mock; findFirst: Mock };
  };
}

const mockDeps: MockDependencies = {
  waltIdClient: {
    createDid: vi.fn(),
  },
  statusListService: {
    allocateIndex: vi.fn(),
  },
  prisma: {
    organization: { update: vi.fn() },
    orgDidHistory: { create: vi.fn() },
    userDidHistory: { create: vi.fn(), findFirst: vi.fn() },
  },
};

describe('DidService', () => {
  let service: DidService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DidService(
      mockDeps.waltIdClient as any,
      mockDeps.statusListService as any,
      mockDeps.prisma as any
    );
  });

  describe('createOrganizationDid', () => {
    it('should create DID and store in organization and history', async () => {
      mockDeps.waltIdClient.createDid.mockResolvedValue({
        did: 'did:key:z6MkOrg123',
        keyId: 'key_org_123',
        didDocument: { id: 'did:key:z6MkOrg123' },
      });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(0);
      mockDeps.prisma.organization.update.mockResolvedValue({});
      mockDeps.prisma.orgDidHistory.create.mockResolvedValue({});

      const result = await service.createOrganizationDid('org_123');

      expect(result.did).toBe('did:key:z6MkOrg123');
      expect(result.keyId).toBe('key_org_123');
      expect(mockDeps.waltIdClient.createDid).toHaveBeenCalledWith({
        method: 'key',
        keyAlgorithm: 'Ed25519',
      });
      expect(mockDeps.prisma.organization.update).toHaveBeenCalledWith({
        where: { id: 'org_123' },
        data: {
          did: 'did:key:z6MkOrg123',
          waltIdKeyId: 'key_org_123',
        },
      });
      expect(mockDeps.prisma.orgDidHistory.create).toHaveBeenCalled();
    });
  });

  describe('createUserDid', () => {
    it('should create DID for user in organization context', async () => {
      mockDeps.userDidHistory.findFirst.mockResolvedValue(null); // No existing DID
      mockDeps.waltIdClient.createDid.mockResolvedValue({
        did: 'did:key:z6MkUser456',
        keyId: 'key_user_456',
        didDocument: { id: 'did:key:z6MkUser456' },
      });
      mockDeps.statusListService.allocateIndex.mockResolvedValue(1);
      mockDeps.prisma.userDidHistory.create.mockResolvedValue({});

      const result = await service.createUserDid('user_456', 'org_123');

      expect(result.did).toBe('did:key:z6MkUser456');
      expect(result.keyId).toBe('key_user_456');
      expect(mockDeps.prisma.userDidHistory.create).toHaveBeenCalled();
    });

    it('should return existing DID if user already has one', async () => {
      mockDeps.prisma.userDidHistory.findFirst.mockResolvedValue({
        did: 'did:key:z6MkExisting',
        waltIdKeyId: 'key_existing',
      });

      const result = await service.createUserDid('user_456', 'org_123');

      expect(result.did).toBe('did:key:z6MkExisting');
      expect(mockDeps.waltIdClient.createDid).not.toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/api && pnpm test run src/services/did.service.test.ts`
Expected: FAIL - module not found

**Step 3: Write the implementation**

Create `apps/api/src/services/did.service.ts`:

```typescript
import { type PrismaClient } from '@eurocomply/db';
import { type WaltIdClient } from '@eurocomply/walt-id';
import { StatusList2021Service } from './status-list.service.js';

export interface DidCreationResult {
  did: string;
  keyId: string;
}

/**
 * DidService handles DID creation and lifecycle management.
 *
 * DIDs (Decentralized Identifiers) are created using walt.id and stored
 * in history tables for key rotation tracking and revocation support.
 */
export class DidService {
  constructor(
    private readonly waltIdClient: WaltIdClient,
    private readonly statusListService: StatusList2021Service,
    private readonly prisma: PrismaClient
  ) {}

  /**
   * Create a DID for an organization.
   *
   * This creates a new did:key identifier via walt.id and stores it
   * in both the Organization record and OrgDidHistory for tracking.
   *
   * @param organizationId - The organization to create DID for
   * @returns The created DID and key ID
   */
  async createOrganizationDid(organizationId: string): Promise<DidCreationResult> {
    // Create DID via walt.id
    const didResponse = await this.waltIdClient.createDid({
      method: 'key',
      keyAlgorithm: 'Ed25519',
    });

    // Allocate status list index for revocation tracking
    const statusListIndex = await this.statusListService.allocateIndex(
      organizationId
    );

    // Update organization with DID
    await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        did: didResponse.did,
        waltIdKeyId: didResponse.keyId,
      },
    });

    // Create history entry for tracking
    await this.prisma.orgDidHistory.create({
      data: {
        organizationId,
        did: didResponse.did,
        waltIdKeyId: didResponse.keyId,
        validFrom: new Date(),
        statusListIndex,
      },
    });

    return {
      did: didResponse.did,
      keyId: didResponse.keyId,
    };
  }

  /**
   * Create a DID for a user.
   *
   * Users have a single DID that works across all organizations.
   * If the user already has a DID, returns the existing one.
   *
   * @param userId - The user to create DID for
   * @param organizationId - The organization context (for status list index)
   * @returns The created or existing DID and key ID
   */
  async createUserDid(
    userId: string,
    organizationId: string
  ): Promise<DidCreationResult> {
    // Check if user already has a valid DID
    const existingDid = await this.prisma.userDidHistory.findFirst({
      where: {
        userId,
        validTo: null,
        revokedAt: null,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (existingDid) {
      return {
        did: existingDid.did,
        keyId: existingDid.waltIdKeyId,
      };
    }

    // Create new DID via walt.id
    const didResponse = await this.waltIdClient.createDid({
      method: 'key',
      keyAlgorithm: 'Ed25519',
    });

    // Allocate status list index
    const statusListIndex = await this.statusListService.allocateIndex(
      organizationId
    );

    // Create history entry
    await this.prisma.userDidHistory.create({
      data: {
        userId,
        did: didResponse.did,
        waltIdKeyId: didResponse.keyId,
        validFrom: new Date(),
        statusListIndex,
      },
    });

    return {
      did: didResponse.did,
      keyId: didResponse.keyId,
    };
  }

  /**
   * Get the current valid DID for an organization.
   *
   * @param organizationId - The organization ID
   * @returns The current DID info or null if none exists
   */
  async getOrganizationDid(organizationId: string): Promise<DidCreationResult | null> {
    const orgDid = await this.prisma.orgDidHistory.findFirst({
      where: {
        organizationId,
        validTo: null,
        revokedAt: null,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!orgDid) {
      return null;
    }

    return {
      did: orgDid.did,
      keyId: orgDid.waltIdKeyId,
    };
  }

  /**
   * Get the current valid DID for a user.
   *
   * @param userId - The user ID
   * @returns The current DID info or null if none exists
   */
  async getUserDid(userId: string): Promise<DidCreationResult | null> {
    const userDid = await this.prisma.userDidHistory.findFirst({
      where: {
        userId,
        validTo: null,
        revokedAt: null,
      },
      orderBy: { validFrom: 'desc' },
    });

    if (!userDid) {
      return null;
    }

    return {
      did: userDid.did,
      keyId: userDid.waltIdKeyId,
    };
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd apps/api && pnpm test run src/services/did.service.test.ts`
Expected: All tests pass

**Step 5: Commit**

```bash
git add apps/api/src/services/did.service.ts apps/api/src/services/did.service.test.ts
git commit -m "feat(api): add DidService for DID creation and lifecycle management"
```

---

### Task 2.2: Integrate DID Creation into Organization Service

**Files:**
- Modify: `apps/api/src/services/organization.service.ts`

**Step 1: Read current file**

Read the organization.service.ts to understand current structure.

**Step 2: Add DID creation after organization creation**

Update the `createOrganization` function to create DIDs:

```typescript
import { prisma, createTenantSchema, publishEvent, EventTypes } from '@eurocomply/db';
import { createWaltIdClient } from '@eurocomply/walt-id';
import { ConflictError, NotFoundError } from '../lib/errors.js';
import { DidService } from './did.service.js';
import { StatusList2021Service } from './status-list.service.js';

// ... existing code ...

export async function createOrganization(
  input: CreateOrganizationInput
): Promise<OrganizationWithOwner> {
  const { name, ownerClerkId, ownerEmail, ownerName } = input;

  // ... existing slug generation and validation ...

  // Create everything in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // 1. Create or get user (existing code)
    // 2. Create organization (existing code)
    // 3. Create owner membership (existing code)
    // 4. Publish event (existing code)

    return { organization, user };
  });

  // 5. Create tenant schema (existing code)
  await createTenantSchema(prisma, schemaName);

  // 6. NEW: Create DIDs for organization and owner
  try {
    const waltIdClient = createWaltIdClient();
    const statusListService = new StatusList2021Service(prisma);
    const didService = new DidService(waltIdClient, statusListService, prisma);

    // Create organization DID
    await didService.createOrganizationDid(result.organization.id);

    // Create user DID (owner)
    await didService.createUserDid(result.user.id, result.organization.id);
  } catch (error) {
    // Log error but don't fail org creation - DIDs can be created later
    console.error('Failed to create DIDs during org creation:', error);
  }

  return {
    // ... existing return ...
  };
}
```

**Step 3: Update tests**

Update organization service tests to mock DID creation.

**Step 4: Commit**

```bash
git add apps/api/src/services/organization.service.ts
git commit -m "feat(api): integrate DID creation into organization onboarding"
```

---

### Task 2.3: Add User DID Creation on Org Join

**Files:**
- Create: `apps/api/src/services/membership.service.ts`
- Create: `apps/api/src/services/membership.service.test.ts`

**Step 1: Write the failing test**

Create test for membership service that handles user joining an org.

**Step 2: Write implementation**

Create service that:
1. Adds user to organization
2. Creates user DID if they don't have one
3. Publishes USER_JOINED event

**Step 3: Run tests**

**Step 4: Commit**

```bash
git add apps/api/src/services/membership.service.ts apps/api/src/services/membership.service.test.ts
git commit -m "feat(api): add membership service with DID creation on org join"
```

---

## Phase 3: Integration & Testing

### Task 3.1: Update Integration Tests

**Files:**
- Modify: `apps/api/src/test/integration/setup.ts`

**Step 1: Add walt.id mock for tests**

Update test setup to mock walt.id client or use test containers.

**Step 2: Run full test suite**

Run: `pnpm test`
Expected: All tests pass

**Step 3: Commit**

```bash
git add apps/api/src/test/integration/
git commit -m "test(api): add walt.id mocks to integration test setup"
```

---

### Task 3.2: Verify End-to-End Flow

**Files:** None (manual verification)

**Step 1: Start local environment**

```bash
docker-compose --profile full up -d
```

**Step 2: Create test organization via API**

```bash
curl -X POST http://localhost:3000/api/v1/organizations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <clerk-token>" \
  -d '{"name": "Test Company"}'
```

**Step 3: Verify DIDs were created**

Check database for:
- Organization.did is set
- OrgDidHistory has entry
- UserDidHistory has entry for owner

**Step 4: Test sealed artifact creation**

Verify SealedArtifactService can now create artifacts.

---

## Summary

### Files to Create
- `infrastructure/terraform/modules/waltid/main.tf`
- `infrastructure/terraform/modules/waltid/variables.tf`
- `infrastructure/terraform/modules/waltid/outputs.tf`
- `apps/api/src/services/did.service.ts`
- `apps/api/src/services/did.service.test.ts`
- `apps/api/src/services/membership.service.ts`
- `apps/api/src/services/membership.service.test.ts`

### Files to Modify
- `infrastructure/terraform/modules/security-groups/main.tf`
- `infrastructure/terraform/environments/staging/main.tf`
- `infrastructure/terraform/environments/staging/outputs.tf`
- `.env.example`
- `apps/api/.env.example`
- `docker-compose.yml`
- `apps/api/src/services/organization.service.ts`
- `apps/api/src/test/integration/setup.ts`

### Deployment Order
1. Apply Terraform changes (creates walt.id ECS service)
2. Deploy API with new environment variables
3. Test DID creation flow
4. Backfill DIDs for existing organizations (if any)

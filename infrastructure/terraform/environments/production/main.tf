# EuroComply Production Environment
# Deploys full infrastructure stack for production
# Production-specific settings: Multi-AZ, deletion protection, enhanced monitoring

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }

  # AWS European Sovereign Cloud state backend
  backend "s3" {
    bucket         = "eurocomply-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "eusc-de-east-1"
    dynamodb_table = "eurocomply-terraform-locks"
    encrypt        = true
    endpoints = {
      s3       = "https://s3.eusc-de-east-1.amazonaws.eu"
      dynamodb = "https://dynamodb.eusc-de-east-1.amazonaws.eu"
    }
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
  }
}

# AWS European Sovereign Cloud Provider
provider "aws" {
  region = "eusc-de-east-1"

  endpoints {
    sts                    = "https://sts.eusc-de-east-1.amazonaws.eu"
    iam                    = "https://iam.eusc-de-east-1.amazonaws.eu"
    s3                     = "https://s3.eusc-de-east-1.amazonaws.eu"
    dynamodb               = "https://dynamodb.eusc-de-east-1.amazonaws.eu"
    ec2                    = "https://ec2.eusc-de-east-1.amazonaws.eu"
    ecs                    = "https://ecs.eusc-de-east-1.amazonaws.eu"
    ecr                    = "https://ecr.eusc-de-east-1.amazonaws.eu"
    elasticache            = "https://elasticache.eusc-de-east-1.amazonaws.eu"
    rds                    = "https://rds.eusc-de-east-1.amazonaws.eu"
    secretsmanager         = "https://secretsmanager.eusc-de-east-1.amazonaws.eu"
    elasticloadbalancing   = "https://elasticloadbalancing.eusc-de-east-1.amazonaws.eu"
    elbv2                  = "https://elasticloadbalancing.eusc-de-east-1.amazonaws.eu"
    logs                   = "https://logs.eusc-de-east-1.amazonaws.eu"
    applicationautoscaling = "https://application-autoscaling.eusc-de-east-1.amazonaws.eu"
  }

  default_tags {
    tags = {
      Project         = var.project
      Environment     = var.environment
      ManagedBy       = "terraform"
      DataSovereignty = "eu-sovereign"
    }
  }
}

data "aws_caller_identity" "current" {}

locals {
  project     = var.project
  environment = var.environment
  account_id  = data.aws_caller_identity.current.account_id
  region      = "eusc-de-east-1"

  # walt.id service discovery URLs (centralized to avoid duplication)
  # These are determined by the Cloud Map namespace and service name
  waltid_base_url      = "http://waltid.${var.environment}.eurocomply.internal"
  waltid_core_url      = "${local.waltid_base_url}:7000"
  waltid_signatory_url = "${local.waltid_base_url}:7001"
  waltid_custodian_url = "${local.waltid_base_url}:7002"
  waltid_auditor_url   = "${local.waltid_base_url}:7003"
}

# =============================================================================
# KMS Keys (Customer-Managed Encryption Keys)
# =============================================================================
module "kms" {
  source = "../../modules/kms"

  project     = local.project
  environment = local.environment
}

# =============================================================================
# VPC
# =============================================================================
module "vpc" {
  source = "../../modules/vpc"

  project            = local.project
  environment        = local.environment
  vpc_cidr           = var.vpc_cidr
  az_count           = var.az_count
  single_nat_gateway = false # Multi-NAT for production HA

  # Extended retention for production compliance
  flow_logs_retention_days = 90
}

# =============================================================================
# Security Groups
# =============================================================================
module "security_groups" {
  source = "../../modules/security-groups"

  project                         = local.project
  environment                     = local.environment
  vpc_id                          = module.vpc.vpc_id
  app_port                        = var.app_port
  vpc_endpoints_security_group_id = module.vpc.vpc_endpoints_security_group_id
}

# =============================================================================
# Application Load Balancer
# =============================================================================
module "alb" {
  source = "../../modules/alb"

  project           = local.project
  environment       = local.environment
  vpc_id            = module.vpc.vpc_id
  public_subnet_ids = module.vpc.public_subnet_ids
  security_group_id = module.security_groups.alb_security_group_id
  app_port          = var.app_port
  health_check_path = "/health"
  certificate_arn   = var.certificate_arn
}

# =============================================================================
# RDS PostgreSQL (Production Settings)
# =============================================================================
module "rds" {
  source = "../../modules/rds"

  project            = local.project
  environment        = local.environment
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.rds_security_group_id

  instance_class          = var.db_instance_class
  allocated_storage       = var.db_allocated_storage
  multi_az                = true # Multi-AZ for production HA
  backup_retention_period = var.backup_retention_period
  kms_key_arn             = module.kms.primary_key_arn

  # IAM Authentication Setup
  setup_iam_auth           = true
  lambda_subnet_ids        = module.vpc.private_subnet_ids
  lambda_security_group_id = module.security_groups.ecs_security_group_id

  # Secret rotation for production
  enable_secret_rotation = var.enable_secret_rotation
  secret_rotation_days   = var.secret_rotation_days
}

# =============================================================================
# ElastiCache Redis
# =============================================================================
module "elasticache" {
  source = "../../modules/elasticache"

  project            = local.project
  environment        = local.environment
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.elasticache_security_group_id

  node_type   = var.redis_node_type
  kms_key_arn = module.kms.elasticache_key_arn
}

# =============================================================================
# Secrets Manager for Application Secrets
# =============================================================================
resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "${local.project}/${local.environment}/app-secrets"
  description = "Application secrets for ${local.project} ${local.environment}"

  tags = {
    Environment = local.environment
    Project     = local.project
  }
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id
  secret_string = jsonencode({
    CLERK_SECRET_KEY = var.clerk_secret_key
  })
}

# =============================================================================
# ECS Fargate (Production Settings)
# =============================================================================
module "ecs" {
  source = "../../modules/ecs"

  project            = local.project
  environment        = local.environment
  aws_region         = var.aws_region
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.ecs_security_group_id
  target_group_arn   = module.alb.target_group_arn

  container_name  = "api"
  container_image = "${local.account_id}.dkr.ecr.${local.region}.amazonaws.eu/${local.project}-api:production"
  container_port  = var.app_port

  cpu    = var.ecs_cpu
  memory = var.ecs_memory

  desired_count = var.ecs_desired_count

  environment_variables = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = tostring(var.app_port) },
    { name = "DB_HOST", value = module.rds.db_instance_address },
    { name = "DB_PORT", value = tostring(module.rds.db_instance_port) },
    { name = "DB_NAME", value = module.rds.db_name },
    { name = "DB_USER", value = module.rds.db_username },
    { name = "DB_SSL", value = "true" },
    { name = "REDIS_HOST", value = module.elasticache.redis_endpoint },
    { name = "REDIS_PORT", value = tostring(module.elasticache.redis_port) },
    { name = "REDIS_TLS", value = tostring(module.elasticache.transit_encryption_enabled) },
    # walt.id SSI endpoints (internal service discovery via Cloud Map)
    { name = "WALTID_CORE_URL", value = local.waltid_core_url },
    { name = "WALTID_SIGNATORY_URL", value = local.waltid_signatory_url },
    { name = "WALTID_CUSTODIAN_URL", value = local.waltid_custodian_url },
    { name = "WALTID_AUDITOR_URL", value = local.waltid_auditor_url },
  ]

  secrets = [
    {
      name      = "CLERK_SECRET_KEY"
      valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CLERK_SECRET_KEY::"
    },
    {
      name      = "DB_PASSWORD"
      valueFrom = "${module.rds.db_credentials_secret_arn}:password::"
    },
    {
      name      = "REDIS_AUTH_TOKEN"
      valueFrom = "${module.elasticache.redis_auth_secret_arn}:auth_token::"
    }
  ]

  secrets_arns = [
    aws_secretsmanager_secret.app_secrets.arn,
    module.rds.db_credentials_secret_arn,
    module.elasticache.redis_auth_secret_arn
  ]

  # Production settings
  container_insights = true # Enhanced monitoring for production
  log_retention_days = 90   # Extended log retention for production
  enable_autoscaling = true # Auto-scaling for production

  rds_resource_id = module.rds.db_resource_id
  db_username     = module.rds.db_username
  aws_account_id  = local.account_id
}

# =============================================================================
# walt.id SSI Services
# =============================================================================
module "waltid" {
  source = "../../modules/waltid"

  project            = local.project
  environment        = local.environment
  aws_region         = local.region
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.waltid_security_group_id
  ecs_cluster_id     = module.ecs.cluster_id

  cpu                = 1024 # Higher CPU for production
  memory             = 2048 # Higher memory for production
  log_retention_days = 90
}

# =============================================================================
# GitHub Actions Role with ECS permissions
# =============================================================================
resource "aws_iam_role_policy" "github_actions_ecs" {
  name = "github-actions-ecs-deploy"
  role = "github-actions-eurocomply"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "ECSClusterAccess"
        Effect = "Allow"
        Action = [
          "ecs:DescribeClusters"
        ]
        Resource = "arn:aws-eusc:ecs:${local.region}:${local.account_id}:cluster/${local.project}-${local.environment}"
      },
      {
        Sid    = "ECSServiceAccess"
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:ListTasks",
          "ecs:DescribeTasks",
          "ecs:RunTask"
        ]
        Resource = [
          "arn:aws-eusc:ecs:${local.region}:${local.account_id}:service/${local.project}-${local.environment}/*",
          "arn:aws-eusc:ecs:${local.region}:${local.account_id}:task/${local.project}-${local.environment}/*"
        ]
      },
      {
        Sid    = "ECSTaskDefinitions"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:RequestedRegion" = local.region
          }
        }
      },
      {
        Sid    = "PassRoleForECS"
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          module.ecs.execution_role_arn,
          module.ecs.task_role_arn
        ]
      },
      {
        Sid    = "SecretsAccess"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.app_secrets.arn,
          module.rds.db_credentials_secret_arn
        ]
      }
    ]
  })
}

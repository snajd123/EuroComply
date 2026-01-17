# EuroComply Staging Environment
# Deploys full infrastructure stack for staging

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
  }

  # AWS European Sovereign Cloud state backend
  # Note: Run bootstrap/main.tf first to create this bucket
  backend "s3" {
    bucket         = "eurocomply-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "eusc-de-east-1"
    dynamodb_table = "eurocomply-terraform-locks"
    encrypt        = true
    # Sovereign Cloud S3 endpoint (amazonaws.eu domain)
    endpoints = {
      s3       = "https://s3.eusc-de-east-1.amazonaws.eu"
      dynamodb = "https://dynamodb.eusc-de-east-1.amazonaws.eu"
    }
    # Skip validation for Sovereign Cloud region
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
  }
}

# AWS European Sovereign Cloud Provider
# Region: eusc-de-east-1 (Brandenburg, Germany)
# Partition: aws-eusc (isolated from global AWS)
# Console: https://console.aws.eu
provider "aws" {
  region = "eusc-de-east-1"

  # Sovereign Cloud endpoints (amazonaws.eu domain)
  endpoints {
    sts              = "https://sts.eusc-de-east-1.amazonaws.eu"
    iam              = "https://iam.eusc-de-east-1.amazonaws.eu"
    s3               = "https://s3.eusc-de-east-1.amazonaws.eu"
    dynamodb         = "https://dynamodb.eusc-de-east-1.amazonaws.eu"
    ec2              = "https://ec2.eusc-de-east-1.amazonaws.eu"
    ecs              = "https://ecs.eusc-de-east-1.amazonaws.eu"
    ecr              = "https://ecr.eusc-de-east-1.amazonaws.eu"
    elasticache      = "https://elasticache.eusc-de-east-1.amazonaws.eu"
    rds              = "https://rds.eusc-de-east-1.amazonaws.eu"
    secretsmanager   = "https://secretsmanager.eusc-de-east-1.amazonaws.eu"
    elasticloadbalancing = "https://elasticloadbalancing.eusc-de-east-1.amazonaws.eu"
    elbv2            = "https://elasticloadbalancing.eusc-de-east-1.amazonaws.eu"
    logs             = "https://logs.eusc-de-east-1.amazonaws.eu"
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

locals {
  project     = var.project
  environment = var.environment
  # Hardcoded for AWS European Sovereign Cloud
  # Data sources don't work due to Terraform provider limitations
  account_id = "075285241396"
  region     = "eusc-de-east-1"
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
  single_nat_gateway = true # Cost savings for staging
}

# =============================================================================
# Security Groups
# =============================================================================
module "security_groups" {
  source = "../../modules/security-groups"

  project     = local.project
  environment = local.environment
  vpc_id      = module.vpc.vpc_id
  app_port    = var.app_port
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
# RDS PostgreSQL
# =============================================================================
module "rds" {
  source = "../../modules/rds"

  project            = local.project
  environment        = local.environment
  private_subnet_ids = module.vpc.private_subnet_ids
  security_group_id  = module.security_groups.rds_security_group_id

  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  multi_az             = false # Single AZ for staging
  backup_retention_period = 7
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

  node_type = var.redis_node_type
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
# ECS Fargate
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
  # Sovereign Cloud ECR endpoint format (amazonaws.eu domain)
  container_image = "${local.account_id}.dkr.ecr.${local.region}.amazonaws.eu/${local.project}-api:staging"
  container_port  = var.app_port

  cpu    = var.ecs_cpu
  memory = var.ecs_memory

  desired_count = var.ecs_desired_count

  environment_variables = [
    { name = "NODE_ENV", value = "production" },
    { name = "PORT", value = tostring(var.app_port) },
    { name = "DATABASE_URL", value = "postgresql://${module.rds.db_username}:PLACEHOLDER@${module.rds.db_instance_address}:${module.rds.db_instance_port}/${module.rds.db_name}" },
    { name = "REDIS_URL", value = module.elasticache.redis_url },
  ]

  secrets = [
    {
      name      = "DB_PASSWORD"
      valueFrom = "${module.rds.db_credentials_secret_arn}:password::"
    },
    {
      name      = "CLERK_SECRET_KEY"
      valueFrom = "${aws_secretsmanager_secret.app_secrets.arn}:CLERK_SECRET_KEY::"
    }
  ]

  secrets_arns = [
    module.rds.db_credentials_secret_arn,
    aws_secretsmanager_secret.app_secrets.arn
  ]

  container_insights = false
  log_retention_days = 30
  enable_autoscaling = false
}

# =============================================================================
# Update GitHub Actions Role with ECS permissions
# =============================================================================
resource "aws_iam_role_policy" "github_actions_ecs" {
  name = "github-actions-ecs-deploy"
  role = "github-actions-eurocomply"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:DescribeClusters",
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:DeregisterTaskDefinition",
          "ecs:ListTasks",
          "ecs:DescribeTasks"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "iam:PassRole"
        ]
        Resource = [
          module.ecs.execution_role_arn,
          module.ecs.task_role_arn
        ]
      }
    ]
  })
}

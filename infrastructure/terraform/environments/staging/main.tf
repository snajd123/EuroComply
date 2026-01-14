# infrastructure/terraform/environments/staging/main.tf
#
# Staging environment - cost-effective version for integration testing
# Key differences from production:
# - Single-AZ where possible
# - Smaller instance sizes
# - No deletion protection
# - Shorter retention periods
# - Staging subdomain

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "s3" {
    bucket         = "eurocomply-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "eu-central-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "eurocomply"
      ManagedBy   = "terraform"
    }
  }
}

# ==============================================================================
# VARIABLES
# ==============================================================================

variable "aws_region" {
  type    = string
  default = "eu-central-1"
}

variable "environment" {
  type    = string
  default = "staging"
}

variable "app_name" {
  type    = string
  default = "eurocomply"
}

variable "domain" {
  type    = string
  default = "eurocomply.eu"
}

variable "staging_subdomain" {
  type    = string
  default = "staging"
}

# ==============================================================================
# VPC
# ==============================================================================

module "vpc" {
  source = "../../modules/vpc"

  name               = "${var.app_name}-${var.environment}"
  cidr               = "10.1.0.0/16"  # Different CIDR from production
  availability_zones = ["${var.aws_region}a", "${var.aws_region}b"]

  public_subnets   = ["10.1.1.0/24", "10.1.2.0/24"]
  private_subnets  = ["10.1.10.0/24", "10.1.11.0/24"]
  database_subnets = ["10.1.20.0/24", "10.1.21.0/24"]

  # Use NAT Instance to save ~€30/month
  enable_nat_instance = true
  nat_instance_type   = "t4g.nano"
}

# ==============================================================================
# KMS - Encryption Key
# ==============================================================================

resource "aws_kms_key" "main" {
  description             = "KMS key for ${var.app_name} ${var.environment}"
  deletion_window_in_days = 7  # Shorter for staging
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow ECS Task Role"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ecs_task.arn
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:GenerateDataKeyWithoutPlaintext"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

resource "aws_kms_alias" "main" {
  name          = "alias/${var.app_name}-${var.environment}"
  target_key_id = aws_kms_key.main.key_id
}

data "aws_caller_identity" "current" {}

# ==============================================================================
# RDS - Staging Database (Single-AZ, smaller instance)
# ==============================================================================

module "staging_db" {
  source = "../../modules/rds"

  identifier     = "${var.app_name}-${var.environment}"
  engine         = "postgres"
  engine_version = "15.4"

  instance_class        = "db.t4g.micro"  # Smallest instance
  allocated_storage     = 20
  max_allocated_storage = 50

  multi_az = false  # Single-AZ for cost savings

  db_name  = "eurocomply"
  username = "eurocomply_admin"

  vpc_id                 = module.vpc.vpc_id
  subnet_group_name      = module.vpc.db_subnet_group_name
  vpc_security_group_ids = [module.vpc.database_security_group_id]

  backup_retention_period = 3   # Shorter backup retention
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = false  # Disabled for cost
  kms_key_id                   = aws_kms_key.main.arn

  deletion_protection = false  # Allow deletion in staging
}

# ==============================================================================
# ELASTICACHE - Redis (with encryption for security parity)
# ==============================================================================

# Parameter group for Redis with encryption
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7"
  name   = "${var.app_name}-${var.environment}-redis7"

  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.app_name}-${var.environment}"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  subnet_group_name  = module.vpc.elasticache_subnet_group_name
  security_group_ids = [module.vpc.cache_security_group_id]

  # Encryption settings (best practice even in staging)
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true

  snapshot_retention_limit = 0  # No snapshots in staging (cost savings)

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

# ==============================================================================
# DYNAMODB - Items Table
# ==============================================================================

resource "aws_dynamodb_table" "items" {
  name         = "${var.app_name}-items-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"

  hash_key  = "pk"
  range_key = "sk"

  attribute {
    name = "pk"
    type = "S"
  }

  attribute {
    name = "sk"
    type = "S"
  }

  attribute {
    name = "gsi1pk"
    type = "S"
  }

  attribute {
    name = "gsi1sk"
    type = "S"
  }

  global_secondary_index {
    name            = "GSI1"
    hash_key        = "gsi1pk"
    range_key       = "gsi1sk"
    projection_type = "ALL"
  }

  point_in_time_recovery {
    enabled = true  # Keep PITR even in staging for safety
  }

  server_side_encryption {
    enabled     = true
    kms_key_arn = aws_kms_key.main.arn
  }

  tags = {
    Name = "${var.app_name}-items-${var.environment}"
  }
}

# ==============================================================================
# SQS - Event Queue
# ==============================================================================

resource "aws_sqs_queue" "events" {
  name                        = "${var.app_name}-events-${var.environment}.fifo"
  fifo_queue                  = true
  content_based_deduplication = true

  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600  # 4 days (shorter in staging)
  receive_wait_time_seconds  = 20

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.events_dlq.arn
    maxReceiveCount     = 5
  })

  kms_master_key_id = aws_kms_key.main.id

  tags = {
    Name = "${var.app_name}-events-${var.environment}"
  }
}

resource "aws_sqs_queue" "events_dlq" {
  name                      = "${var.app_name}-events-dlq-${var.environment}.fifo"
  fifo_queue                = true
  message_retention_seconds = 345600
  kms_master_key_id         = aws_kms_key.main.id

  tags = {
    Name = "${var.app_name}-events-dlq-${var.environment}"
  }
}

# ==============================================================================
# ECR - Use production ECR (shared across environments)
# ==============================================================================

# Note: Staging uses the same ECR repositories as production
# This is intentional - we build once and promote images between environments
# Reference production ECR via data sources:

data "aws_ecr_repository" "api" {
  name = "${var.app_name}-api"
}

data "aws_ecr_repository" "worker" {
  name = "${var.app_name}-worker"
}

# ==============================================================================
# IAM - ECS Task Role
# ==============================================================================

resource "aws_iam_role" "ecs_task" {
  name = "${var.app_name}-ecs-task-${var.environment}"

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

resource "aws_iam_role_policy" "ecs_task" {
  name = "${var.app_name}-ecs-task-policy"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:GenerateDataKeyWithoutPlaintext"
        ]
        Resource = aws_kms_key.main.arn
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.app_name}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query",
          "dynamodb:Scan",
          "dynamodb:BatchGetItem",
          "dynamodb:BatchWriteItem"
        ]
        Resource = [
          aws_dynamodb_table.items.arn,
          "${aws_dynamodb_table.items.arn}/index/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          aws_sqs_queue.events.arn,
          aws_sqs_queue.events_dlq.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.assets.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role" "ecs_execution" {
  name = "${var.app_name}-ecs-execution-${var.environment}"

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

resource "aws_iam_role_policy_attachment" "ecs_execution" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_execution_secrets" {
  name = "${var.app_name}-ecs-execution-secrets"
  role = aws_iam_role.ecs_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.app_name}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = aws_kms_key.main.arn
      }
    ]
  })
}

# ==============================================================================
# S3 - Asset Storage
# ==============================================================================

resource "aws_s3_bucket" "assets" {
  bucket = "${var.app_name}-assets-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name = "${var.app_name}-assets-${var.environment}"
  }
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.main.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket = aws_s3_bucket.assets.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle rule to clean up old test data
resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 30
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# ==============================================================================
# ECS CLUSTER
# ==============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "disabled"  # Disabled in staging for cost
  }

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  # Use Spot for staging to save ~70%
  default_capacity_provider_strategy {
    base              = 0
    weight            = 100
    capacity_provider = "FARGATE_SPOT"
  }
}

# ==============================================================================
# ALB - Application Load Balancer
# ==============================================================================

resource "aws_lb" "main" {
  name               = "${var.app_name}-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [module.vpc.alb_security_group_id]
  subnets            = module.vpc.public_subnet_ids

  enable_deletion_protection = false  # Allow deletion in staging

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

resource "aws_lb_target_group" "api" {
  name        = "${var.app_name}-api-${var.environment}"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = "/health"
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${var.app_name}-api-${var.environment}"
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ==============================================================================
# ACM - SSL/TLS Certificate for Staging
# ==============================================================================

resource "aws_acm_certificate" "main" {
  domain_name       = "${var.staging_subdomain}.api.${var.domain}"
  validation_method = "DNS"

  subject_alternative_names = [
    "${var.staging_subdomain}.${var.domain}",
    "${var.staging_subdomain}.dpp.${var.domain}",
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# ==============================================================================
# ECS SERVICES - Task Definitions
# ==============================================================================

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.app_name}-api-${var.environment}"
  retention_in_days = 7  # Shorter retention in staging
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.app_name}-worker-${var.environment}"
  retention_in_days = 7
}

resource "aws_ecs_task_definition" "api" {
  family                   = "${var.app_name}-api-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "api"
      image = "${data.aws_ecr_repository.api.repository_url}:staging"  # Use staging tag

      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "staging" },
        { name = "PORT", value = "3000" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "KMS_KEY_ID", value = aws_kms_key.main.id },
        { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.items.name },
        { name = "SQS_QUEUE_URL", value = aws_sqs_queue.events.url },
        { name = "REDIS_HOST", value = aws_elasticache_cluster.main.cache_nodes[0].address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "REDIS_TLS", value = "true" },  # TLS enabled
        { name = "S3_BUCKET", value = aws_s3_bucket.assets.id },
        { name = "LOG_LEVEL", value = "debug" },  # Verbose logging in staging
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${module.staging_db.password_secret_arn}:connection_string::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.api.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "api"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${var.app_name}-api-${var.environment}"
  }
}

resource "aws_ecs_task_definition" "worker" {
  family                   = "${var.app_name}-worker-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name  = "worker"
      image = "${data.aws_ecr_repository.worker.repository_url}:staging"

      environment = [
        { name = "NODE_ENV", value = "staging" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "KMS_KEY_ID", value = aws_kms_key.main.id },
        { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.items.name },
        { name = "SQS_QUEUE_URL", value = aws_sqs_queue.events.url },
        { name = "REDIS_HOST", value = aws_elasticache_cluster.main.cache_nodes[0].address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "REDIS_TLS", value = "true" },
        { name = "LOG_LEVEL", value = "debug" },
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${module.staging_db.password_secret_arn}:connection_string::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.worker.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "worker"
        }
      }
    }
  ])

  tags = {
    Name = "${var.app_name}-worker-${var.environment}"
  }
}

# ==============================================================================
# ECS SERVICES
# ==============================================================================

resource "aws_ecs_service" "api" {
  name            = "api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.api.arn
  desired_count   = 1  # Single instance in staging
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnet_ids
    security_groups  = [module.vpc.app_security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3000
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Use Spot capacity
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  tags = {
    Name = "${var.app_name}-api-${var.environment}"
  }
}

resource "aws_ecs_service" "worker" {
  name            = "worker"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.worker.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnet_ids
    security_groups  = [module.vpc.app_security_group_id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  # Use Spot capacity
  capacity_provider_strategy {
    capacity_provider = "FARGATE_SPOT"
    weight            = 100
  }

  tags = {
    Name = "${var.app_name}-worker-${var.environment}"
  }
}

# ==============================================================================
# OUTPUTS
# ==============================================================================

output "vpc_id" {
  value = module.vpc.vpc_id
}

output "alb_dns_name" {
  value = aws_lb.main.dns_name
}

output "api_endpoint" {
  value = "https://${var.staging_subdomain}.api.${var.domain}"
}

output "database_endpoint" {
  value     = module.staging_db.endpoint
  sensitive = true
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "dynamodb_table" {
  value = aws_dynamodb_table.items.name
}

output "sqs_queue_url" {
  value = aws_sqs_queue.events.url
}

output "kms_key_id" {
  value = aws_kms_key.main.id
}

output "certificate_arn" {
  value = aws_acm_certificate.main.arn
}

output "certificate_validation_records" {
  description = "DNS records required for certificate validation"
  value = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name  = dvo.resource_record_name
      type  = dvo.resource_record_type
      value = dvo.resource_record_value
    }
  }
}

# ==============================================================================
# ESTIMATED MONTHLY COST (Staging)
# ==============================================================================
#
# Component                    | Production   | Staging      | Savings
# -----------------------------|--------------|--------------|----------
# RDS (db.t4g.small, Multi-AZ) | ~€45/month   | ~€13/month   | 70%
# ElastiCache (t4g.micro)      | ~€12/month   | ~€12/month   | -
# ECS Fargate                  | ~€30/month   | ~€9/month    | 70% (Spot)
# NAT Instance                 | ~€4/month    | ~€4/month    | -
# ALB                          | ~€22/month   | ~€22/month   | -
# DynamoDB                     | Pay per use  | Pay per use  | -
# CloudWatch Logs              | ~€5/month    | ~€2/month    | 60%
# S3/SQS/KMS                   | ~€5/month    | ~€3/month    | 40%
# -----------------------------|--------------|--------------|----------
# TOTAL ESTIMATE               | ~€123/month  | ~€65/month   | 47%
#
# Note: Staging uses Fargate Spot and single-AZ to reduce costs
# while maintaining functional parity with production.

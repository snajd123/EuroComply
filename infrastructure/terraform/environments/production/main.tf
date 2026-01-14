# infrastructure/terraform/environments/production/main.tf

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
    key            = "production/terraform.tfstate"
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
  default = "production"
}

variable "app_name" {
  type    = string
  default = "eurocomply"
}

variable "domain" {
  type    = string
  default = "eurocomply.eu"
}

# ==============================================================================
# VPC
# ==============================================================================

module "vpc" {
  source = "../../modules/vpc"

  name               = "${var.app_name}-${var.environment}"
  cidr               = "10.0.0.0/16"
  availability_zones = ["${var.aws_region}a", "${var.aws_region}b"]

  public_subnets   = ["10.0.1.0/24", "10.0.2.0/24"]
  private_subnets  = ["10.0.10.0/24", "10.0.11.0/24"]
  database_subnets = ["10.0.20.0/24", "10.0.21.0/24"]

  # Use NAT Instance to save ~€30/month
  enable_nat_instance = true
  nat_instance_type   = "t4g.nano"
}

# ==============================================================================
# KMS - Encryption Key
# ==============================================================================

resource "aws_kms_key" "main" {
  description             = "KMS key for ${var.app_name} ${var.environment}"
  deletion_window_in_days = 30
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
# RDS - Growth Cell Database
# ==============================================================================

module "growth_cell" {
  source = "../../modules/rds"

  identifier    = "${var.app_name}-growth-cell-1"
  engine        = "postgres"
  engine_version = "15.4"

  instance_class        = "db.t4g.small"  # 2 vCPU, 2GB RAM - good for ~200 tenants
  allocated_storage     = 50
  max_allocated_storage = 200

  multi_az = true  # High availability

  db_name  = "eurocomply"
  username = "eurocomply_admin"

  vpc_id                 = module.vpc.vpc_id
  subnet_group_name      = module.vpc.db_subnet_group_name
  vpc_security_group_ids = [module.vpc.database_security_group_id]

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  performance_insights_enabled = true
  kms_key_id                   = aws_kms_key.main.arn

  deletion_protection = true
}

# ==============================================================================
# ELASTICACHE - Redis (with encryption)
# ==============================================================================

# Custom parameter group for Redis
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7"
  name   = "${var.app_name}-${var.environment}-redis7"

  description = "Redis 7 parameter group for ${var.app_name} ${var.environment}"

  # Memory management
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"
  }

  # Enable lazy freeing for better performance during key eviction
  parameter {
    name  = "lazyfree-lazy-eviction"
    value = "yes"
  }
}

# Redis auth token (password) stored in Secrets Manager
resource "random_password" "redis_auth" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}|:,.<>?"
}

resource "aws_secretsmanager_secret" "redis_auth" {
  name        = "${var.app_name}/redis-auth-token-${var.environment}"
  description = "Redis AUTH token for ${var.app_name} ${var.environment}"
  kms_key_id  = aws_kms_key.main.arn
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  secret_id     = aws_secretsmanager_secret.redis_auth.id
  secret_string = random_password.redis_auth.result
}

resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.app_name}-${var.environment}"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t4g.micro"
  num_cache_nodes      = 1  # Single node to start, add HA later
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name

  subnet_group_name  = module.vpc.elasticache_subnet_group_name
  security_group_ids = [module.vpc.cache_security_group_id]

  # Encryption at rest
  # Note: Uses service-managed encryption (AES-256)
  # KMS CMK encryption requires replication group (aws_elasticache_replication_group)
  at_rest_encryption_enabled = true

  # Encryption in transit (TLS)
  transit_encryption_enabled = true

  snapshot_retention_limit = 1
  snapshot_window          = "05:00-06:00"

  # Auto minor version upgrade for security patches
  auto_minor_version_upgrade = true

  # Maintenance window for updates
  maintenance_window = "sun:05:00-sun:06:00"

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

# ==============================================================================
# DYNAMODB - Items Table
# ==============================================================================

resource "aws_dynamodb_table" "items" {
  name         = "${var.app_name}-items-${var.environment}"
  billing_mode = "PAY_PER_REQUEST"  # On-demand, pay per request

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
    enabled = true
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
  message_retention_seconds  = 1209600  # 14 days
  receive_wait_time_seconds  = 20       # Long polling

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
  name                        = "${var.app_name}-events-dlq-${var.environment}.fifo"
  fifo_queue                  = true
  message_retention_seconds   = 1209600
  kms_master_key_id           = aws_kms_key.main.id

  tags = {
    Name = "${var.app_name}-events-dlq-${var.environment}"
  }
}

# ==============================================================================
# ECR - Container Registry
# ==============================================================================

resource "aws_ecr_repository" "api" {
  name                 = "${var.app_name}-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }

  tags = {
    Name = "${var.app_name}-api"
  }
}

resource "aws_ecr_repository" "worker" {
  name                 = "${var.app_name}-worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.main.arn
  }

  tags = {
    Name = "${var.app_name}-worker"
  }
}

# ECR Lifecycle Policy
resource "aws_ecr_lifecycle_policy" "api" {
  repository = aws_ecr_repository.api.name

  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Keep last 10 images"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = 10
        }
        action = {
          type = "expire"
        }
      }
    ]
  })
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
        Resource = [
          "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:${var.app_name}/*",
          aws_secretsmanager_secret.redis_auth.arn
        ]
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

# ==============================================================================
# ECS CLUSTER
# ==============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${var.app_name}-${var.environment}"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = "FARGATE"
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

  enable_deletion_protection = true

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
# ACM - SSL/TLS Certificate
# ==============================================================================

resource "aws_acm_certificate" "main" {
  domain_name       = "api.${var.domain}"
  validation_method = "DNS"

  subject_alternative_names = [
    "*.${var.domain}",  # Wildcard for subdomains
    var.domain,         # Apex domain
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.app_name}-${var.environment}"
  }
}

# Note: DNS validation requires creating CNAME records in Route53 or your DNS provider
# You can find the validation records in the AWS Console or by running:
#   terraform output certificate_validation_records
#
# For automation, use Route53:
#   1. Create Route53 hosted zone for eurocomply.eu
#   2. Uncomment the aws_route53_record resources below
#   3. Update nameservers at your domain registrar

# Uncomment if using Route53 for DNS:
# resource "aws_route53_zone" "main" {
#   name = var.domain
# }
#
# resource "aws_route53_record" "cert_validation" {
#   for_each = {
#     for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
#       name   = dvo.resource_record_name
#       record = dvo.resource_record_value
#       type   = dvo.resource_record_type
#     }
#   }
#
#   allow_overwrite = true
#   name            = each.value.name
#   records         = [each.value.record]
#   ttl             = 60
#   type            = each.value.type
#   zone_id         = aws_route53_zone.main.zone_id
# }
#
# resource "aws_acm_certificate_validation" "main" {
#   certificate_arn         = aws_acm_certificate.main.arn
#   validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
# }

# ==============================================================================
# ALB - HTTPS Listener
# ==============================================================================

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"  # TLS 1.3 + 1.2
  certificate_arn   = aws_acm_certificate.main.arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# Note: Certificate must be validated before HTTPS listener will work
# Validation options:
#   1. DNS validation (recommended): Add CNAME records to your DNS
#   2. Email validation: Respond to validation email sent to domain admin
#
# Check certificate status:
#   aws acm describe-certificate --certificate-arn <arn>

# ==============================================================================
# ECS SERVICES - Task Definitions
# ==============================================================================

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/${var.app_name}-api-${var.environment}"
  retention_in_days = 30
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/ecs/${var.app_name}-worker-${var.environment}"
  retention_in_days = 30
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
      image = "${aws_ecr_repository.api.repository_url}:latest"
      
      portMappings = [
        {
          containerPort = 3000
          protocol      = "tcp"
        }
      ]

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "PORT", value = "3000" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "KMS_KEY_ID", value = aws_kms_key.main.id },
        { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.items.name },
        { name = "SQS_QUEUE_URL", value = aws_sqs_queue.events.url },
        { name = "REDIS_HOST", value = aws_elasticache_cluster.main.cache_nodes[0].address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "REDIS_TLS", value = "true" },  # TLS encryption enabled
        { name = "S3_BUCKET", value = aws_s3_bucket.assets.id },
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${module.growth_cell.password_secret_arn}:connection_string::"
        },
        {
          name      = "REDIS_AUTH_TOKEN"
          valueFrom = aws_secretsmanager_secret.redis_auth.arn
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
      image = "${aws_ecr_repository.worker.repository_url}:latest"

      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "KMS_KEY_ID", value = aws_kms_key.main.id },
        { name = "DYNAMODB_TABLE", value = aws_dynamodb_table.items.name },
        { name = "SQS_QUEUE_URL", value = aws_sqs_queue.events.url },
        { name = "REDIS_HOST", value = aws_elasticache_cluster.main.cache_nodes[0].address },
        { name = "REDIS_PORT", value = "6379" },
        { name = "REDIS_TLS", value = "true" },  # TLS encryption enabled
      ]

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${module.growth_cell.password_secret_arn}:connection_string::"
        },
        {
          name      = "REDIS_AUTH_TOKEN"
          valueFrom = aws_secretsmanager_secret.redis_auth.arn
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
  desired_count   = 2  # 2 tasks for HA
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

  tags = {
    Name = "${var.app_name}-api-${var.environment}"
  }

  lifecycle {
    ignore_changes = [desired_count]  # Allow autoscaling to manage
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

  tags = {
    Name = "${var.app_name}-worker-${var.environment}"
  }
}

# ==============================================================================
# CLOUDWATCH ALARMS
# ==============================================================================

resource "aws_sns_topic" "alerts" {
  name = "${var.app_name}-alerts-${var.environment}"
}

resource "aws_cloudwatch_metric_alarm" "api_cpu" {
  alarm_name          = "${var.app_name}-api-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/ECS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "API CPU utilization high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ClusterName = aws_ecs_cluster.main.name
    ServiceName = aws_ecs_service.api.name
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${var.app_name}-rds-cpu-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 80
  alarm_description   = "RDS CPU utilization high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = module.growth_cell.identifier
  }
}

resource "aws_cloudwatch_metric_alarm" "rds_connections" {
  alarm_name          = "${var.app_name}-rds-connections-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = 150  # Alert before hitting max (200)
  alarm_description   = "RDS connections high"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    DBInstanceIdentifier = module.growth_cell.identifier
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

output "ecr_api_url" {
  value = aws_ecr_repository.api.repository_url
}

output "ecr_worker_url" {
  value = aws_ecr_repository.worker.repository_url
}

output "database_endpoint" {
  value     = module.growth_cell.endpoint
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
  description = "ARN of the ACM certificate for HTTPS"
  value       = aws_acm_certificate.main.arn
}

output "certificate_validation_records" {
  description = "DNS records required for certificate validation - add these to your DNS provider"
  value = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      value  = dvo.resource_record_value
    }
  }
}

output "redis_auth_secret_arn" {
  description = "ARN of the Redis AUTH token secret"
  value       = aws_secretsmanager_secret.redis_auth.arn
  sensitive   = true
}

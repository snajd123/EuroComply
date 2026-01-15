# infrastructure/terraform/modules/pgbouncer/main.tf
#
# PgBouncer Connection Pooler for PostgreSQL
# Deployed as ECS Fargate service in transaction mode

variable "name" {
  description = "Name prefix for resources"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for ECS tasks"
  type        = list(string)
}

variable "ecs_cluster_id" {
  description = "ECS cluster ID"
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "execution_role_arn" {
  description = "ECS execution role ARN"
  type        = string
}

variable "task_role_arn" {
  description = "ECS task role ARN"
  type        = string
}

variable "rds_endpoint" {
  description = "RDS endpoint (host:port)"
  type        = string
}

variable "rds_host" {
  description = "RDS host (without port)"
  type        = string
}

variable "rds_port" {
  description = "RDS port"
  type        = number
  default     = 5432
}

variable "database_name" {
  description = "Database name"
  type        = string
}

variable "database_username" {
  description = "Database master username"
  type        = string
}

variable "database_password_secret_arn" {
  description = "Secrets Manager ARN containing database password"
  type        = string
}

variable "kms_key_arn" {
  description = "KMS key ARN for encryption"
  type        = string
}

variable "app_security_group_id" {
  description = "Security group ID for application (to allow inbound)"
  type        = string
}

variable "database_security_group_id" {
  description = "Security group ID for database (to allow outbound)"
  type        = string
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

# PgBouncer configuration
variable "pool_mode" {
  description = "Pool mode: session, transaction, or statement"
  type        = string
  default     = "transaction"
}

variable "default_pool_size" {
  description = "Default number of server connections per user/database pair"
  type        = number
  default     = 20
}

variable "min_pool_size" {
  description = "Minimum number of server connections to keep open"
  type        = number
  default     = 5
}

variable "reserve_pool_size" {
  description = "Additional connections for reserve pool"
  type        = number
  default     = 5
}

variable "max_client_conn" {
  description = "Maximum number of client connections"
  type        = number
  default     = 1000
}

variable "max_db_connections" {
  description = "Maximum number of connections per database"
  type        = number
  default     = 50
}

variable "cpu" {
  description = "CPU units for Fargate task"
  type        = number
  default     = 256
}

variable "memory" {
  description = "Memory (MB) for Fargate task"
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of PgBouncer tasks"
  type        = number
  default     = 2
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

# ==============================================================================
# SECURITY GROUP
# ==============================================================================

resource "aws_security_group" "pgbouncer" {
  name        = "${var.name}-pgbouncer"
  description = "Security group for PgBouncer"
  vpc_id      = var.vpc_id

  # Allow inbound from application
  ingress {
    description     = "PgBouncer from application"
    from_port       = 6432
    to_port         = 6432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  # Allow outbound to RDS
  egress {
    description     = "PostgreSQL to RDS"
    from_port       = var.rds_port
    to_port         = var.rds_port
    protocol        = "tcp"
    security_groups = [var.database_security_group_id]
  }

  # Allow outbound HTTPS for secrets/ECR
  egress {
    description = "HTTPS for AWS services"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = "${var.name}-pgbouncer"
  })
}

# Allow RDS security group to accept connections from PgBouncer
resource "aws_security_group_rule" "rds_from_pgbouncer" {
  type                     = "ingress"
  from_port                = var.rds_port
  to_port                  = var.rds_port
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.pgbouncer.id
  security_group_id        = var.database_security_group_id
  description              = "PostgreSQL from PgBouncer"
}

# ==============================================================================
# SERVICE DISCOVERY
# ==============================================================================

resource "aws_service_discovery_private_dns_namespace" "pgbouncer" {
  name        = "${var.name}.internal"
  description = "Private DNS namespace for ${var.name}"
  vpc         = var.vpc_id

  tags = var.tags
}

resource "aws_service_discovery_service" "pgbouncer" {
  name = "pgbouncer"

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.pgbouncer.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }

  tags = var.tags
}

# ==============================================================================
# CLOUDWATCH LOGS
# ==============================================================================

resource "aws_cloudwatch_log_group" "pgbouncer" {
  name              = "/ecs/${var.name}-pgbouncer-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# ==============================================================================
# ECS TASK DEFINITION
# ==============================================================================

resource "aws_ecs_task_definition" "pgbouncer" {
  family                   = "${var.name}-pgbouncer-${var.environment}"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = var.execution_role_arn
  task_role_arn            = var.task_role_arn

  container_definitions = jsonencode([
    {
      name  = "pgbouncer"
      image = "edoburu/pgbouncer:1.21.0-p2"  # Well-maintained PgBouncer image

      portMappings = [
        {
          containerPort = 6432
          protocol      = "tcp"
        }
      ]

      environment = [
        # Database connection
        { name = "DB_HOST", value = var.rds_host },
        { name = "DB_PORT", value = tostring(var.rds_port) },
        { name = "DB_NAME", value = var.database_name },
        { name = "DB_USER", value = var.database_username },

        # PgBouncer settings
        { name = "POOL_MODE", value = var.pool_mode },
        { name = "DEFAULT_POOL_SIZE", value = tostring(var.default_pool_size) },
        { name = "MIN_POOL_SIZE", value = tostring(var.min_pool_size) },
        { name = "RESERVE_POOL_SIZE", value = tostring(var.reserve_pool_size) },
        { name = "MAX_CLIENT_CONN", value = tostring(var.max_client_conn) },
        { name = "MAX_DB_CONNECTIONS", value = tostring(var.max_db_connections) },

        # Logging
        { name = "LOG_CONNECTIONS", value = "1" },
        { name = "LOG_DISCONNECTIONS", value = "1" },
        { name = "LOG_POOLER_ERRORS", value = "1" },
        { name = "STATS_PERIOD", value = "60" },

        # Important for Prisma compatibility
        { name = "IGNORE_STARTUP_PARAMETERS", value = "extra_float_digits" },

        # Admin access (for monitoring)
        { name = "ADMIN_USERS", value = "pgbouncer_admin" },
        { name = "STATS_USERS", value = "pgbouncer_stats" },
      ]

      secrets = [
        {
          name      = "DB_PASSWORD"
          valueFrom = "${var.database_password_secret_arn}:password::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.pgbouncer.name
          "awslogs-region"        = data.aws_region.current.name
          "awslogs-stream-prefix" = "pgbouncer"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "pg_isready -h localhost -p 6432 -U ${var.database_username} || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 30
      }
    }
  ])

  tags = merge(var.tags, {
    Name = "${var.name}-pgbouncer-${var.environment}"
  })
}

data "aws_region" "current" {}

# ==============================================================================
# ECS SERVICE
# ==============================================================================

resource "aws_ecs_service" "pgbouncer" {
  name            = "pgbouncer"
  cluster         = var.ecs_cluster_id
  task_definition = aws_ecs_task_definition.pgbouncer.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [aws_security_group.pgbouncer.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.pgbouncer.arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  tags = merge(var.tags, {
    Name = "${var.name}-pgbouncer-${var.environment}"
  })

  lifecycle {
    ignore_changes = [desired_count]
  }
}

# ==============================================================================
# OUTPUTS
# ==============================================================================

output "endpoint" {
  description = "PgBouncer endpoint (host:port)"
  value       = "pgbouncer.${var.name}.internal:6432"
}

output "host" {
  description = "PgBouncer host"
  value       = "pgbouncer.${var.name}.internal"
}

output "port" {
  description = "PgBouncer port"
  value       = 6432
}

output "security_group_id" {
  description = "PgBouncer security group ID"
  value       = aws_security_group.pgbouncer.id
}

output "service_discovery_namespace_id" {
  description = "Service discovery namespace ID"
  value       = aws_service_discovery_private_dns_namespace.pgbouncer.id
}

output "connection_string" {
  description = "Connection string for applications (without password)"
  value       = "postgresql://${var.database_username}@pgbouncer.${var.name}.internal:6432/${var.database_name}?pgbouncer=true"
}

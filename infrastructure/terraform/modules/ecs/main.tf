# ECS Module for EuroComply
# Creates ECS Fargate cluster, service, and task definition

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

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

variable "target_group_arn" {
  type = string
}

variable "container_name" {
  type = string
}

variable "container_image" {
  type = string
}

variable "container_port" {
  type    = number
  default = 3000
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "environment_variables" {
  type = list(object({
    name  = string
    value = string
  }))
  default = []
}

variable "secrets" {
  type = list(object({
    name      = string
    valueFrom = string
  }))
  default = []
}

variable "secrets_arns" {
  type    = list(string)
  default = []
}

variable "container_insights" {
  type    = bool
  default = false
}

variable "log_retention_days" {
  type    = number
  default = 30
}

variable "kms_key_arn" {
  description = "KMS key ARN for encrypting CloudWatch log groups"
  type        = string
  default     = null
}

variable "enable_autoscaling" {
  type    = bool
  default = false
}

variable "min_capacity" {
  type    = number
  default = 1
}

variable "max_capacity" {
  type    = number
  default = 4
}

variable "rds_resource_id" {
  description = "RDS resource ID for IAM authentication (e.g., db-ABCDEFGH)"
  type        = string
  default     = ""
}

variable "db_username" {
  description = "Database username for IAM authentication"
  type        = string
  default     = ""
}

variable "aws_account_id" {
  description = "AWS account ID for IAM policy scoping"
  type        = string
  default     = ""
}

# Hardcoded for AWS European Sovereign Cloud
# Data sources don't work due to Terraform provider limitations
locals {
  name_prefix = "${var.project}-${var.environment}"
  partition   = "aws-eusc"
}

# =============================================================================
# ECS Cluster
# =============================================================================
resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

# =============================================================================
# CloudWatch Log Group
# =============================================================================
resource "aws_cloudwatch_log_group" "ecs" {
  name              = "/ecs/${local.name_prefix}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_arn

  tags = {
    Name = "${local.name_prefix}-ecs-logs"
  }
}

# =============================================================================
# IAM Roles
# =============================================================================

# Task Execution Role (for pulling images, writing logs)
resource "aws_iam_role" "execution" {
  name = "${local.name_prefix}-ecs-execution"

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

  tags = {
    Name = "${local.name_prefix}-ecs-execution"
  }
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  count = length(var.secrets_arns) > 0 ? 1 : 0
  name  = "secrets-access"
  role  = aws_iam_role.execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = var.secrets_arns
      }
    ]
  })
}

# Task Role (for application permissions)
resource "aws_iam_role" "task" {
  name = "${local.name_prefix}-ecs-task"

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

  tags = {
    Name = "${local.name_prefix}-ecs-task"
  }
}

# IAM policy for RDS IAM authentication (most secure - no passwords)
# Scoped to specific region, account, RDS instance, and database user
resource "aws_iam_role_policy" "task_rds_connect" {
  count = var.rds_resource_id != "" ? 1 : 0
  name  = "rds-iam-connect"
  role  = aws_iam_role.task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["rds-db:connect"]
        Resource = "arn:${local.partition}:rds-db:${var.aws_region}:${var.aws_account_id}:dbuser:${var.rds_resource_id}/${var.db_username}"
      }
    ]
  })
}

# =============================================================================
# Task Definition
# =============================================================================
resource "aws_ecs_task_definition" "main" {
  family                   = "${local.name_prefix}-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  container_definitions = jsonencode([
    {
      name      = var.container_name
      image     = var.container_image
      essential = true

      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      environment = var.environment_variables
      secrets     = var.secrets

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${var.container_port}/health || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])

  tags = {
    Name = "${local.name_prefix}-api"
  }
}

# =============================================================================
# ECS Service
# =============================================================================
resource "aws_ecs_service" "main" {
  name            = "${local.name_prefix}-api"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.private_subnet_ids
    security_groups  = [var.security_group_id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = var.container_name
    container_port   = var.container_port
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [desired_count]
  }

  tags = {
    Name = "${local.name_prefix}-api"
  }
}

# =============================================================================
# Auto Scaling
# =============================================================================
resource "aws_appautoscaling_target" "ecs" {
  count = var.enable_autoscaling ? 1 : 0

  max_capacity       = var.max_capacity
  min_capacity       = var.min_capacity
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.main.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "ecs_cpu" {
  count = var.enable_autoscaling ? 1 : 0

  name               = "${local.name_prefix}-cpu-scaling"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.ecs[0].resource_id
  scalable_dimension = aws_appautoscaling_target.ecs[0].scalable_dimension
  service_namespace  = aws_appautoscaling_target.ecs[0].service_namespace

  target_tracking_scaling_policy_configuration {
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
    target_value       = 70.0
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
  }
}

# =============================================================================
# Outputs
# =============================================================================
output "cluster_id" {
  value = aws_ecs_cluster.main.id
}

output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_id" {
  value = aws_ecs_service.main.id
}

output "service_name" {
  value = aws_ecs_service.main.name
}

output "task_definition_arn" {
  value = aws_ecs_task_definition.main.arn
}

output "execution_role_arn" {
  value = aws_iam_role.execution.arn
}

output "task_role_arn" {
  value = aws_iam_role.task.arn
}

output "log_group_name" {
  value = aws_cloudwatch_log_group.ecs.name
}

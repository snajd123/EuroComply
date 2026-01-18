# walt.id Community Stack Module
# Deploys walt.id SSI Kit as internal ECS service for DID/VC operations
# with persistent EFS storage for DIDs and keys

locals {
  name_prefix = "${var.project}-${var.environment}"
  partition   = "aws-eusc"

  # walt.id SSI Kit - pinned version for reproducibility
  # Update this version deliberately, not automatically
  waltid_image = "waltid/ssikit:1.2312.1"
}

# =============================================================================
# EFS File System for Persistent Data
# =============================================================================
resource "aws_efs_file_system" "waltid" {
  creation_token = "${local.name_prefix}-waltid-data"
  encrypted      = true

  performance_mode = "generalPurpose"
  throughput_mode  = "bursting"

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }

  tags = {
    Name = "${local.name_prefix}-waltid-data"
  }
}

# Mount targets in each private subnet
resource "aws_efs_mount_target" "waltid" {
  count           = length(var.private_subnet_ids)
  file_system_id  = aws_efs_file_system.waltid.id
  subnet_id       = var.private_subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

# Security group for EFS (allows NFS from walt.id security group)
resource "aws_security_group" "efs" {
  name        = "${local.name_prefix}-waltid-efs"
  description = "Security group for walt.id EFS mount targets"
  vpc_id      = var.vpc_id

  ingress {
    description     = "NFS from walt.id tasks"
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [var.security_group_id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-waltid-efs"
  }
}

# Access point for walt.id data directory
resource "aws_efs_access_point" "waltid" {
  file_system_id = aws_efs_file_system.waltid.id

  posix_user {
    gid = 1000
    uid = 1000
  }

  root_directory {
    path = "/waltid-data"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "0755"
    }
  }

  tags = {
    Name = "${local.name_prefix}-waltid-data"
  }
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

# Task Execution Role (for pulling images, writing logs)
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

  tags = {
    Name = "${local.name_prefix}-waltid-execution"
  }
}

resource "aws_iam_role_policy_attachment" "waltid_execution" {
  role       = aws_iam_role.waltid_execution.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Task Role (for application permissions - EFS access for walt.id)
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

  tags = {
    Name = "${local.name_prefix}-waltid-task"
  }
}

# Allow task role to access EFS
resource "aws_iam_role_policy" "waltid_efs" {
  name = "${local.name_prefix}-waltid-efs"
  role = aws_iam_role.waltid_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite",
          "elasticfilesystem:ClientRootAccess"
        ]
        Resource = aws_efs_file_system.waltid.arn
        Condition = {
          StringEquals = {
            "elasticfilesystem:AccessPointArn" = aws_efs_access_point.waltid.arn
          }
        }
      }
    ]
  })
}

# =============================================================================
# Service Discovery - Internal DNS
# =============================================================================
resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "${var.environment}.eurocomply.internal"
  description = "Private DNS namespace for EuroComply ${var.environment}"
  vpc         = var.vpc_id

  tags = {
    Name = "${local.name_prefix}-dns-namespace"
  }
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
    # failure_threshold is deprecated (always 1) - AWS removed support
  }

  tags = {
    Name = "${local.name_prefix}-waltid-discovery"
  }
}

# =============================================================================
# ECS Task Definition
# =============================================================================
# walt.id SSI Kit runs all services in one container with different ports:
# - Port 7000: Core API (DID operations)
# - Port 7001: Signatory (VC signing)
# - Port 7002: Custodian (Key management)
# - Port 7003: Auditor (VC verification)
resource "aws_ecs_task_definition" "waltid" {
  family                   = "${local.name_prefix}-waltid"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.waltid_execution.arn
  task_role_arn            = aws_iam_role.waltid_task.arn

  # EFS volume for persistent data
  volume {
    name = "waltid-data"

    efs_volume_configuration {
      file_system_id     = aws_efs_file_system.waltid.id
      transit_encryption = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.waltid.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "waltid"
      image     = local.waltid_image
      essential = true
      command   = ["serve", "-b", "0.0.0.0"]

      portMappings = [
        { containerPort = 7000, protocol = "tcp" }, # Core API
        { containerPort = 7001, protocol = "tcp" }, # Signatory
        { containerPort = 7002, protocol = "tcp" }, # Custodian
        { containerPort = 7003, protocol = "tcp" }, # Auditor
      ]

      environment = [
        { name = "WALTID_DATA_ROOT", value = "/data" }
      ]

      # Mount EFS volume to /data for persistent storage
      mountPoints = [
        {
          sourceVolume  = "waltid-data"
          containerPath = "/data"
          readOnly      = false
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

  depends_on = [aws_efs_mount_target.waltid]
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

  # Service discovery for internal DNS resolution
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

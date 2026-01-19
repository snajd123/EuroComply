# Security Groups Module for EuroComply
# Creates security groups for ALB, ECS, RDS, and ElastiCache

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "app_port" {
  type    = number
  default = 3000
}

variable "vpc_endpoints_security_group_id" {
  description = "Security group ID for VPC endpoints (for restricted egress)"
  type        = string
  default     = null
}

locals {
  name_prefix = "${var.project}-${var.environment}"
}

# =============================================================================
# ALB Security Group
# =============================================================================
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Security group for Application Load Balancer"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTP from anywhere"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-alb-sg"
  }
}

# =============================================================================
# ECS Security Group
# =============================================================================
resource "aws_security_group" "ecs" {
  name        = "${local.name_prefix}-ecs-sg"
  description = "Security group for ECS tasks"
  vpc_id      = var.vpc_id

  ingress {
    description     = "App port from ALB"
    from_port       = var.app_port
    to_port         = var.app_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-ecs-sg"
  }
}

# =============================================================================
# RDS Security Group
# =============================================================================
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Security group for RDS PostgreSQL"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from ECS"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }
}

# RDS egress rules - restricted to VPC endpoints when available
# If VPC endpoints are not configured, allow broad HTTPS (fallback for bootstrapping)
resource "aws_security_group_rule" "rds_egress_vpc_endpoints" {
  count = var.vpc_endpoints_security_group_id != null ? 1 : 0

  type                     = "egress"
  from_port                = 443
  to_port                  = 443
  protocol                 = "tcp"
  security_group_id        = aws_security_group.rds.id
  source_security_group_id = var.vpc_endpoints_security_group_id
  description              = "HTTPS to VPC endpoints only"
}

resource "aws_security_group_rule" "rds_egress_fallback" {
  count = var.vpc_endpoints_security_group_id == null ? 1 : 0

  type              = "egress"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.rds.id
  cidr_blocks       = ["0.0.0.0/0"]
  description       = "HTTPS to AWS services (fallback - configure VPC endpoints for production)"
}

# =============================================================================
# ElastiCache Security Group
# =============================================================================
resource "aws_security_group" "elasticache" {
  name        = "${local.name_prefix}-elasticache-sg"
  description = "Security group for ElastiCache Redis"
  vpc_id      = var.vpc_id

  ingress {
    description     = "Redis from ECS"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # No egress rules needed - Redis only responds to incoming connections
  # Security groups are stateful, so response traffic is automatically allowed

  tags = {
    Name = "${local.name_prefix}-elasticache-sg"
  }
}

# =============================================================================
# walt.id Security Group
# =============================================================================
resource "aws_security_group" "waltid" {
  name        = "${local.name_prefix}-waltid-sg"
  description = "Security group for walt.id SSI services"
  vpc_id      = var.vpc_id

  # walt.id Core API (DID operations)
  ingress {
    description     = "Core API from ECS"
    from_port       = 7000
    to_port         = 7000
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # walt.id Signatory (VC signing)
  ingress {
    description     = "Signatory from ECS"
    from_port       = 7001
    to_port         = 7001
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # walt.id Custodian (Key management)
  ingress {
    description     = "Custodian from ECS"
    from_port       = 7002
    to_port         = 7002
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  # walt.id Auditor (VC verification)
  ingress {
    description     = "Auditor from ECS"
    from_port       = 7003
    to_port         = 7003
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

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

# =============================================================================
# Outputs
# =============================================================================
output "alb_security_group_id" {
  value = aws_security_group.alb.id
}

output "ecs_security_group_id" {
  value = aws_security_group.ecs.id
}

output "rds_security_group_id" {
  value = aws_security_group.rds.id
}

output "elasticache_security_group_id" {
  value = aws_security_group.elasticache.id
}

output "waltid_security_group_id" {
  value       = aws_security_group.waltid.id
  description = "Security group ID for walt.id SSI services"
}

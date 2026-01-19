# KMS Module for EuroComply
# Creates customer-managed KMS keys for encryption
# Provides better control, auditing, and compliance vs AWS-managed keys

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

variable "enable_key_rotation" {
  description = "Enable automatic key rotation (annually)"
  type        = bool
  default     = true
}

variable "deletion_window_days" {
  description = "Days to wait before deleting a key (7-30)"
  type        = number
  default     = 30

  validation {
    condition     = var.deletion_window_days >= 7 && var.deletion_window_days <= 30
    error_message = "deletion_window_days must be between 7 and 30"
  }
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  partition   = "aws-eusc"
}

data "aws_caller_identity" "current" {}

# =============================================================================
# Primary Encryption Key (for RDS, Secrets Manager, general encryption)
# =============================================================================
resource "aws_kms_key" "primary" {
  description              = "Primary encryption key for ${local.name_prefix}"
  deletion_window_in_days  = var.deletion_window_days
  enable_key_rotation      = var.enable_key_rotation
  is_enabled               = true
  multi_region             = false
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage                = "ENCRYPT_DECRYPT"

  # Simplified policy for AWS European Sovereign Cloud compatibility
  # Root account access only - services use IAM roles to access keys
  # This avoids invalid service principal errors in sovereign cloud
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${local.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${local.name_prefix}-primary-key"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "primary" {
  name          = "alias/${local.name_prefix}-primary"
  target_key_id = aws_kms_key.primary.key_id
}

# =============================================================================
# ECR Encryption Key (separate for container image encryption)
# =============================================================================
resource "aws_kms_key" "ecr" {
  description              = "ECR encryption key for ${local.name_prefix}"
  deletion_window_in_days  = var.deletion_window_days
  enable_key_rotation      = var.enable_key_rotation
  is_enabled               = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage                = "ENCRYPT_DECRYPT"

  # Simplified policy for AWS European Sovereign Cloud compatibility
  # Root account access allows delegation via IAM policies
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${local.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${local.name_prefix}-ecr-key"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "ecr" {
  name          = "alias/${local.name_prefix}-ecr"
  target_key_id = aws_kms_key.ecr.key_id
}

# =============================================================================
# ElastiCache Encryption Key
# =============================================================================
resource "aws_kms_key" "elasticache" {
  description              = "ElastiCache encryption key for ${local.name_prefix}"
  deletion_window_in_days  = var.deletion_window_days
  enable_key_rotation      = var.enable_key_rotation
  is_enabled               = true
  customer_master_key_spec = "SYMMETRIC_DEFAULT"
  key_usage                = "ENCRYPT_DECRYPT"

  # Simplified policy for AWS European Sovereign Cloud compatibility
  # Root account access allows delegation via IAM policies
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "EnableRootAccountAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:${local.partition}:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      }
    ]
  })

  tags = {
    Name        = "${local.name_prefix}-elasticache-key"
    Environment = var.environment
  }
}

resource "aws_kms_alias" "elasticache" {
  name          = "alias/${local.name_prefix}-elasticache"
  target_key_id = aws_kms_key.elasticache.key_id
}

# =============================================================================
# Outputs
# =============================================================================
output "primary_key_arn" {
  description = "ARN of the primary KMS key (for RDS, Secrets Manager)"
  value       = aws_kms_key.primary.arn
}

output "primary_key_id" {
  description = "ID of the primary KMS key"
  value       = aws_kms_key.primary.key_id
}

output "ecr_key_arn" {
  description = "ARN of the ECR KMS key"
  value       = aws_kms_key.ecr.arn
}

output "elasticache_key_arn" {
  description = "ARN of the ElastiCache KMS key"
  value       = aws_kms_key.elasticache.arn
}

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

variable "aws_region" {
  description = "AWS region for region-specific service principals"
  type        = string
  default     = "eusc-de-east-1"
}

locals {
  name_prefix = "${var.project}-${var.environment}"
  partition   = "aws-eusc"
  # AWS European Sovereign Cloud uses .amazonaws.eu domain
  service_domain = "amazonaws.eu"
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

  # AWS European Sovereign Cloud KMS key policy
  # Uses .amazonaws.eu service principals for sovereign cloud compatibility
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
      },
      {
        Sid    = "AllowRDSEncryption"
        Effect = "Allow"
        Principal = {
          Service = "rds.${local.service_domain}"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
          "kms:CreateGrant"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "AllowSecretsManagerEncryption"
        Effect = "Allow"
        Principal = {
          Service = "secretsmanager.${local.service_domain}"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "AllowLogsEncryption"
        Effect = "Allow"
        Principal = {
          Service = "logs.${var.aws_region}.${local.service_domain}"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:${local.partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:*"
          }
        }
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

  # AWS European Sovereign Cloud KMS key policy
  # Uses .amazonaws.eu service principals for sovereign cloud compatibility
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
      },
      {
        Sid    = "AllowECREncryption"
        Effect = "Allow"
        Principal = {
          Service = "ecr.${local.service_domain}"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
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

  # AWS European Sovereign Cloud KMS key policy
  # Uses .amazonaws.eu service principals for sovereign cloud compatibility
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
      },
      {
        Sid    = "AllowElastiCacheEncryption"
        Effect = "Allow"
        Principal = {
          Service = "elasticache.${local.service_domain}"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey",
          "kms:CreateGrant"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "kms:CallerAccount" = data.aws_caller_identity.current.account_id
          }
        }
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

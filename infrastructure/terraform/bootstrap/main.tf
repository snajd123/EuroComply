# infrastructure/terraform/bootstrap/main.tf
#
# Bootstrap Terraform configuration to create the initial resources
# required for Terraform state management. Run this ONCE before
# running the main infrastructure configurations.
#
# Usage:
#   cd infrastructure/terraform/bootstrap
#   terraform init
#   terraform apply
#
# After running bootstrap, you can run the environment configurations.

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Bootstrap uses local state (no remote backend yet)
  # After bootstrap, state can be migrated to S3 if desired
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project   = "eurocomply"
      ManagedBy = "terraform-bootstrap"
    }
  }
}

# ==============================================================================
# VARIABLES
# ==============================================================================

variable "aws_region" {
  description = "AWS region for bootstrap resources"
  type        = string
  default     = "eu-central-1"
}

variable "project_name" {
  description = "Project name used in resource naming"
  type        = string
  default     = "eurocomply"
}

variable "state_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  type        = string
  default     = "eurocomply-terraform-state"
}

variable "lock_table_name" {
  description = "Name of the DynamoDB table for Terraform locks"
  type        = string
  default     = "terraform-locks"
}

# ==============================================================================
# S3 BUCKET - Terraform State Storage
# ==============================================================================

resource "aws_s3_bucket" "terraform_state" {
  bucket = var.state_bucket_name

  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name        = var.state_bucket_name
    Purpose     = "terraform-state"
    Environment = "all"
  }
}

# Enable versioning for state file history and recovery
resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

# Enable server-side encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle policy to clean up old state versions
resource "aws_s3_bucket_lifecycle_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    id     = "cleanup-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
  }
}

# ==============================================================================
# DYNAMODB TABLE - Terraform State Locking
# ==============================================================================

resource "aws_dynamodb_table" "terraform_locks" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  # Enable point-in-time recovery
  point_in_time_recovery {
    enabled = true
  }

  tags = {
    Name        = var.lock_table_name
    Purpose     = "terraform-locks"
    Environment = "all"
  }
}

# ==============================================================================
# KMS KEY - Encryption for Terraform State (Optional)
# ==============================================================================

resource "aws_kms_key" "terraform" {
  description             = "KMS key for Terraform state encryption"
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
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:GenerateDataKey*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-terraform-key"
    Purpose = "terraform-state-encryption"
  }
}

resource "aws_kms_alias" "terraform" {
  name          = "alias/${var.project_name}-terraform"
  target_key_id = aws_kms_key.terraform.key_id
}

data "aws_caller_identity" "current" {}

# ==============================================================================
# IAM - CI/CD Role for Terraform Operations
# ==============================================================================

resource "aws_iam_role" "terraform_ci" {
  name = "${var.project_name}-terraform-ci"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          # Update this with your CI/CD provider's OIDC ARN
          # For GitHub Actions:
          Federated = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringLike = {
            # Update with your repository
            "token.actions.githubusercontent.com:sub" = "repo:your-org/eurocomply:*"
          }
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = {
    Name    = "${var.project_name}-terraform-ci"
    Purpose = "ci-cd-terraform"
  }
}

# Attach AdministratorAccess for Terraform operations
# In production, you may want to use a more restrictive policy
resource "aws_iam_role_policy_attachment" "terraform_ci_admin" {
  role       = aws_iam_role.terraform_ci.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# ==============================================================================
# OUTPUTS
# ==============================================================================

output "state_bucket_name" {
  description = "Name of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "state_bucket_arn" {
  description = "ARN of the S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.arn
}

output "lock_table_name" {
  description = "Name of the DynamoDB table for Terraform locks"
  value       = aws_dynamodb_table.terraform_locks.name
}

output "lock_table_arn" {
  description = "ARN of the DynamoDB table for Terraform locks"
  value       = aws_dynamodb_table.terraform_locks.arn
}

output "kms_key_arn" {
  description = "ARN of the KMS key for state encryption"
  value       = aws_kms_key.terraform.arn
}

output "ci_role_arn" {
  description = "ARN of the IAM role for CI/CD Terraform operations"
  value       = aws_iam_role.terraform_ci.arn
}

output "backend_config" {
  description = "Backend configuration to use in environment configs"
  value       = <<-EOT
    terraform {
      backend "s3" {
        bucket         = "${aws_s3_bucket.terraform_state.id}"
        key            = "<environment>/terraform.tfstate"
        region         = "${var.aws_region}"
        encrypt        = true
        dynamodb_table = "${aws_dynamodb_table.terraform_locks.name}"
      }
    }
  EOT
}

# EuroComply Bootstrap - AWS European Sovereign Cloud
# Creates foundational resources for Terraform state management
#
# Run this ONCE to create:
# - S3 bucket for Terraform state
# - DynamoDB table for state locking
# - OIDC provider for GitHub Actions
# - IAM role for GitHub Actions
#
# Usage:
#   cd infrastructure/terraform/bootstrap
#   terraform init
#   terraform apply

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
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
    sts            = "https://sts.eusc-de-east-1.amazonaws.eu"
    iam            = "https://iam.eusc-de-east-1.amazonaws.eu"
    s3             = "https://s3.eusc-de-east-1.amazonaws.eu"
    dynamodb       = "https://dynamodb.eusc-de-east-1.amazonaws.eu"
    ecr            = "https://ecr.eusc-de-east-1.amazonaws.eu"
    secretsmanager = "https://secretsmanager.eusc-de-east-1.amazonaws.eu"
  }

  default_tags {
    tags = {
      Project         = "eurocomply"
      ManagedBy       = "terraform"
      Purpose         = "bootstrap"
      DataSovereignty = "eu-sovereign"
    }
  }
}

# =============================================================================
# S3 Bucket for Terraform State
# =============================================================================
resource "aws_s3_bucket" "terraform_state" {
  bucket = "eurocomply-terraform-state"

  # Prevent accidental deletion
  lifecycle {
    prevent_destroy = true
  }

  tags = {
    Name = "EuroComply Terraform State"
  }
}

resource "aws_s3_bucket_versioning" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "terraform_state" {
  bucket = aws_s3_bucket.terraform_state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# =============================================================================
# DynamoDB Table for State Locking
# =============================================================================
resource "aws_dynamodb_table" "terraform_locks" {
  name         = "eurocomply-terraform-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = {
    Name = "EuroComply Terraform Locks"
  }
}

# =============================================================================
# GitHub Actions OIDC Provider
# =============================================================================
resource "aws_iam_openid_connect_provider" "github_actions" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = ["sts.amazonaws.com"]

  # GitHub's OIDC thumbprint (GitHub Actions)
  # Note: AWS no longer requires thumbprint validation for GitHub OIDC
  # but the field is required. Using GitHub's current root CA thumbprint.
  thumbprint_list = ["1c58a3a8518e8759bf075b76b750d4f2df264fcd"]

  tags = {
    Name = "GitHub Actions OIDC"
  }
}

# =============================================================================
# GitHub Actions IAM Role
# =============================================================================
data "aws_caller_identity" "current" {}

resource "aws_iam_role" "github_actions" {
  name = "github-actions-eurocomply"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github_actions.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            # Restrict to snajd123 GitHub account repos
            "token.actions.githubusercontent.com:sub" = "repo:snajd123/*:*"
          }
        }
      }
    ]
  })

  tags = {
    Name = "GitHub Actions Role"
  }
}

# ECR permissions for GitHub Actions
resource "aws_iam_role_policy" "github_actions_ecr" {
  name = "ecr-push-pull"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecr:GetAuthorizationToken"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:PutImage",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:ListImages"
        ]
        Resource = "arn:aws-eusc:ecr:eusc-de-east-1:${data.aws_caller_identity.current.account_id}:repository/eurocomply-*"
      }
    ]
  })
}

# Terraform state permissions for GitHub Actions
resource "aws_iam_role_policy" "github_actions_terraform_state" {
  name = "terraform-state"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "TerraformStateS3"
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.terraform_state.arn,
          "${aws_s3_bucket.terraform_state.arn}/*"
        ]
      },
      {
        Sid    = "TerraformStateLocking"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem"
        ]
        Resource = aws_dynamodb_table.terraform_locks.arn
      }
    ]
  })
}

# Infrastructure deployment permissions for GitHub Actions
# Split into multiple policies to stay under 10KB limit per policy

# Policy 1: Network (VPC, EC2, ELB)
resource "aws_iam_role_policy" "github_actions_deploy_network" {
  name = "terraform-deploy-network"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "EC2Read"
        Effect   = "Allow"
        Action   = ["ec2:Describe*", "ec2:Get*"]
        Resource = "*"
      },
      {
        Sid    = "EC2Write"
        Effect = "Allow"
        Action = [
          "ec2:CreateVpc", "ec2:DeleteVpc", "ec2:ModifyVpcAttribute",
          "ec2:CreateSubnet", "ec2:DeleteSubnet",
          "ec2:CreateRouteTable", "ec2:DeleteRouteTable", "ec2:CreateRoute", "ec2:DeleteRoute",
          "ec2:AssociateRouteTable", "ec2:DisassociateRouteTable",
          "ec2:CreateInternetGateway", "ec2:DeleteInternetGateway", "ec2:AttachInternetGateway", "ec2:DetachInternetGateway",
          "ec2:CreateNatGateway", "ec2:DeleteNatGateway", "ec2:AllocateAddress", "ec2:ReleaseAddress",
          "ec2:CreateSecurityGroup", "ec2:DeleteSecurityGroup",
          "ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress",
          "ec2:AuthorizeSecurityGroupEgress", "ec2:RevokeSecurityGroupEgress",
          "ec2:CreateTags", "ec2:DeleteTags", "ec2:CreateNetworkInterface", "ec2:DeleteNetworkInterface",
          "ec2:CreateFlowLogs", "ec2:DeleteFlowLogs"
        ]
        Resource = "*"
      },
      {
        Sid      = "ELB"
        Effect   = "Allow"
        Action   = ["elasticloadbalancing:*"]
        Resource = "*"
      }
    ]
  })
}

# Policy 2: Compute (ECS, Lambda)
resource "aws_iam_role_policy" "github_actions_deploy_compute" {
  name = "terraform-deploy-compute"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "ECS"
        Effect   = "Allow"
        Action   = ["ecs:*"]
        Resource = "*"
      },
      {
        Sid      = "Lambda"
        Effect   = "Allow"
        Action   = ["lambda:*"]
        Resource = "arn:aws-eusc:lambda:eusc-de-east-1:${data.aws_caller_identity.current.account_id}:function:eurocomply-*"
      },
      {
        Sid      = "AutoScaling"
        Effect   = "Allow"
        Action   = ["application-autoscaling:*"]
        Resource = "*"
      }
    ]
  })
}

# Policy 3: Data (RDS, ElastiCache, Secrets)
resource "aws_iam_role_policy" "github_actions_deploy_data" {
  name = "terraform-deploy-data"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "RDS"
        Effect   = "Allow"
        Action   = ["rds:*"]
        Resource = "*"
      },
      {
        Sid      = "ElastiCache"
        Effect   = "Allow"
        Action   = ["elasticache:*"]
        Resource = "*"
      },
      {
        Sid      = "SecretsManager"
        Effect   = "Allow"
        Action   = ["secretsmanager:*"]
        Resource = "arn:aws-eusc:secretsmanager:eusc-de-east-1:${data.aws_caller_identity.current.account_id}:secret:eurocomply/*"
      }
    ]
  })
}

# Policy 4: Supporting (Logs, IAM, ServiceDiscovery, EFS, Route53)
resource "aws_iam_role_policy" "github_actions_deploy_supporting" {
  name = "terraform-deploy-supporting"
  role = aws_iam_role.github_actions.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "CloudWatchLogs"
        Effect   = "Allow"
        Action   = ["logs:*"]
        Resource = "*"
      },
      {
        Sid      = "IAM"
        Effect   = "Allow"
        Action   = ["iam:GetRole", "iam:CreateRole", "iam:DeleteRole", "iam:GetRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy", "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PassRole", "iam:ListAttachedRolePolicies", "iam:ListRolePolicies", "iam:TagRole", "iam:UntagRole", "iam:ListInstanceProfilesForRole"]
        Resource = "arn:aws-eusc:iam::${data.aws_caller_identity.current.account_id}:role/eurocomply-*"
      },
      {
        Sid      = "ServiceDiscovery"
        Effect   = "Allow"
        Action   = ["servicediscovery:*"]
        Resource = "*"
      },
      {
        Sid      = "Route53"
        Effect   = "Allow"
        Action   = ["route53:CreateHostedZone", "route53:DeleteHostedZone", "route53:GetHostedZone", "route53:ListHostedZones", "route53:ChangeResourceRecordSets", "route53:ListResourceRecordSets", "route53:GetChange"]
        Resource = "*"
      },
      {
        Sid      = "EFS"
        Effect   = "Allow"
        Action   = ["elasticfilesystem:*"]
        Resource = "*"
      }
    ]
  })
}

# =============================================================================
# ECR Repository
# =============================================================================
resource "aws_ecr_repository" "api" {
  name                 = "eurocomply-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
  }

  tags = {
    Name = "EuroComply API"
  }
}

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

# =============================================================================
# Outputs
# =============================================================================
output "terraform_state_bucket" {
  description = "S3 bucket for Terraform state"
  value       = aws_s3_bucket.terraform_state.id
}

output "terraform_locks_table" {
  description = "DynamoDB table for Terraform state locking"
  value       = aws_dynamodb_table.terraform_locks.id
}

output "github_actions_role_arn" {
  description = "IAM role ARN for GitHub Actions"
  value       = aws_iam_role.github_actions.arn
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.api.repository_url
}

output "aws_account_id" {
  description = "AWS Account ID"
  value       = data.aws_caller_identity.current.account_id
}

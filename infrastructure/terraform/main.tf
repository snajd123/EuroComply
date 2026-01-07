# ===========================================
# EuroComply AWS Infrastructure
# ===========================================
# Region: eu-central-1 (Frankfurt) for GDPR compliance
# ===========================================

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }

  # Uncomment to use S3 backend for state storage
  # backend "s3" {
  #   bucket         = "eurocomply-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "eu-central-1"
  #   encrypt        = true
  #   dynamodb_table = "eurocomply-terraform-locks"
  # }
}

# ===========================================
# AWS Provider Configuration
# ===========================================

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "EuroComply"
      Environment = var.environment
      ManagedBy   = "Terraform"
      GDPRRegion  = "EU"
    }
  }
}

# ===========================================
# Data Sources
# ===========================================

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# ===========================================
# Random Resources
# ===========================================

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_id" "suffix" {
  byte_length = 4
}

# ===========================================
# Local Variables
# ===========================================

locals {
  name_prefix = "eurocomply-${var.environment}"

  azs = slice(data.aws_availability_zones.available.names, 0, 3)

  common_tags = {
    Project     = "EuroComply"
    Environment = var.environment
  }
}

variable "project" {
  description = "Project name"
  type        = string
  default     = "eurocomply"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "staging"
}

variable "aws_region" {
  description = "AWS European Sovereign Cloud region"
  type        = string
  default     = "eusc-de-east-1"
}

# VPC
variable "vpc_cidr" {
  description = "VPC CIDR block"
  type        = string
  default     = "10.0.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones"
  type        = number
  default     = 2
}

# Application
variable "app_port" {
  description = "Application port"
  type        = number
  default     = 3000
}

variable "certificate_arn" {
  description = "ACM certificate ARN for HTTPS. Required - must be provided via terraform.tfvars or CI/CD."
  type        = string
  # No default - this is a required environment-specific value
}

# Database (t4g = Graviton instances for Sovereign Cloud)
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 20
}

# Redis (t4g = Graviton instances for Sovereign Cloud)
variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

# ECS
variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = number
  default     = 256
}

variable "ecs_memory" {
  description = "ECS task memory in MB"
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 1
}

# Secrets (passed via environment or tfvars)
variable "clerk_secret_key" {
  description = "Clerk secret key. Required - must be set in Secrets Manager or passed via CI/CD. Never commit actual values."
  type        = string
  sensitive   = true
  # No default - this is a required secret that must be explicitly provided

  validation {
    condition     = !can(regex("^placeholder", var.clerk_secret_key))
    error_message = "clerk_secret_key cannot be a placeholder value. Set the actual secret in AWS Secrets Manager or pass via CI/CD."
  }
}

variable "clerk_webhook_secret" {
  description = "Clerk webhook signing secret for verifying webhook payloads. Get this from Clerk Dashboard > Webhooks."
  type        = string
  sensitive   = true
  default     = "" # Optional - webhooks won't work without it but app will still run
}

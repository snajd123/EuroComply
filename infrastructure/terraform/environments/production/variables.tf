variable "project" {
  description = "Project name"
  type        = string
  default     = "eurocomply"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
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
  default     = "10.1.0.0/16" # Different CIDR from staging for potential peering
}

variable "az_count" {
  description = "Number of availability zones"
  type        = number
  default     = 3 # More AZs for production HA
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
  # No default - required for production
}

# Database (Production-grade instances)
variable "db_instance_class" {
  description = "RDS instance class (production-grade)"
  type        = string
  default     = "db.t4g.medium" # Larger for production
}

variable "db_allocated_storage" {
  description = "RDS allocated storage in GB"
  type        = number
  default     = 100 # Larger for production
}

variable "backup_retention_period" {
  description = "Database backup retention in days (30+ recommended for production)"
  type        = number
  default     = 30
}

variable "enable_secret_rotation" {
  description = "Enable automatic secret rotation for database credentials"
  type        = bool
  default     = true # Enabled for production
}

variable "secret_rotation_days" {
  description = "Number of days between automatic secret rotations"
  type        = number
  default     = 30
}

# Redis (Production-grade instances)
variable "redis_node_type" {
  description = "ElastiCache node type (production-grade)"
  type        = string
  default     = "cache.t4g.medium" # Larger for production
}

# ECS (Production-grade)
variable "ecs_cpu" {
  description = "ECS task CPU units"
  type        = number
  default     = 512 # Higher for production
}

variable "ecs_memory" {
  description = "ECS task memory in MB"
  type        = number
  default     = 1024 # Higher for production
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks (2+ for production HA)"
  type        = number
  default     = 2 # Multiple tasks for production HA
}

# Secrets
variable "clerk_secret_key" {
  description = "Clerk secret key. Required - must be set in Secrets Manager or passed via CI/CD."
  type        = string
  sensitive   = true

  validation {
    condition     = !can(regex("^placeholder", var.clerk_secret_key))
    error_message = "clerk_secret_key cannot be a placeholder value. Set the actual secret in AWS Secrets Manager or pass via CI/CD."
  }
}

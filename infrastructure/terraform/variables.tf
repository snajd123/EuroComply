# ===========================================
# Input Variables
# ===========================================

# -----------------------------
# General
# -----------------------------

variable "aws_region" {
  description = "AWS region for resources (use EU for GDPR)"
  type        = string
  default     = "eu-central-1" # Frankfurt
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production."
  }
}

variable "domain_name" {
  description = "Primary domain name for the application"
  type        = string
  default     = "eurocomply.io"
}

# -----------------------------
# VPC Configuration
# -----------------------------

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

# -----------------------------
# Database Configuration
# -----------------------------

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "db_allocated_storage" {
  description = "Allocated storage in GB"
  type        = number
  default     = 100
}

variable "db_name" {
  description = "Database name"
  type        = string
  default     = "eurocomply"
}

variable "db_username" {
  description = "Database master username"
  type        = string
  default     = "eurocomply_admin"
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment"
  type        = bool
  default     = true
}

variable "db_create_read_replica" {
  description = "Create a read replica"
  type        = bool
  default     = true
}

# -----------------------------
# ElastiCache Configuration
# -----------------------------

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.medium"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes"
  type        = number
  default     = 2
}

# -----------------------------
# ECS Configuration
# -----------------------------

variable "ecs_task_cpu" {
  description = "CPU units for ECS task (256, 512, 1024, 2048, 4096)"
  type        = number
  default     = 512
}

variable "ecs_task_memory" {
  description = "Memory for ECS task in MB"
  type        = number
  default     = 1024
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2
}

variable "ecs_min_count" {
  description = "Minimum number of ECS tasks for auto-scaling"
  type        = number
  default     = 1
}

variable "ecs_max_count" {
  description = "Maximum number of ECS tasks for auto-scaling"
  type        = number
  default     = 10
}

variable "container_port" {
  description = "Port the container listens on"
  type        = number
  default     = 3000
}

# -----------------------------
# Application Configuration
# -----------------------------

variable "api_image" {
  description = "Docker image for the API"
  type        = string
  default     = "" # Will use ECR image
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 30
}

# -----------------------------
# SSL/Domain Configuration
# -----------------------------

variable "create_ssl_certificate" {
  description = "Create ACM SSL certificate"
  type        = bool
  default     = true
}

variable "route53_zone_id" {
  description = "Route53 hosted zone ID (optional)"
  type        = string
  default     = ""
}

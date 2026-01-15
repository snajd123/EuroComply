# infrastructure/terraform/environments/production/variables.tf
#
# All configurable variables for the production environment.
# Override defaults via terraform.tfvars or environment variables.

# ==============================================================================
# GENERAL
# ==============================================================================

variable "aws_region" {
  description = "AWS region for deployment"
  type        = string
  default     = "eu-central-1"
}

variable "environment" {
  description = "Environment name (production, staging, development)"
  type        = string
  default     = "production"
}

variable "app_name" {
  description = "Application name used in resource naming"
  type        = string
  default     = "eurocomply"
}

variable "domain" {
  description = "Primary domain for the application"
  type        = string
  default     = "eurocomply.eu"
}

# ==============================================================================
# NETWORKING
# ==============================================================================

variable "vpc_cidr" {
  description = "CIDR block for the VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.10.0/24", "10.0.11.0/24"]
}

variable "database_subnet_cidrs" {
  description = "CIDR blocks for database subnets"
  type        = list(string)
  default     = ["10.0.20.0/24", "10.0.21.0/24"]
}

variable "availability_zone_count" {
  description = "Number of availability zones to use"
  type        = number
  default     = 2
}

variable "nat_instance_type" {
  description = "Instance type for NAT instance (cost optimization)"
  type        = string
  default     = "t4g.nano"
}

variable "enable_nat_instance" {
  description = "Use NAT instance instead of NAT Gateway (saves ~€30/month)"
  type        = bool
  default     = true
}

# ==============================================================================
# DATABASE (RDS)
# ==============================================================================

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.small"
}

variable "db_allocated_storage" {
  description = "Initial storage allocation in GB"
  type        = number
  default     = 50  # Matches Architecture docs
}

variable "db_max_allocated_storage" {
  description = "Maximum storage for autoscaling in GB"
  type        = number
  default     = 100
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 7
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = true  # Matches Architecture docs - required for HA
}

variable "db_deletion_protection" {
  description = "Enable deletion protection for RDS"
  type        = bool
  default     = true
}

# ==============================================================================
# CACHE (ElastiCache Redis)
# ==============================================================================

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t4g.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in the cluster"
  type        = number
  default     = 1
}

variable "redis_snapshot_retention_days" {
  description = "Number of days to retain Redis snapshots"
  type        = number
  default     = 1
}

variable "redis_engine_version" {
  description = "Redis engine version"
  type        = string
  default     = "7.1"
}

# ==============================================================================
# KMS
# ==============================================================================

variable "kms_deletion_window_days" {
  description = "Waiting period before KMS key deletion"
  type        = number
  default     = 30
}

# ==============================================================================
# SQS QUEUES
# ==============================================================================

variable "sqs_message_retention_seconds" {
  description = "SQS message retention period in seconds (default: 14 days)"
  type        = number
  default     = 1209600  # 14 days
}

variable "sqs_visibility_timeout_seconds" {
  description = "SQS visibility timeout in seconds"
  type        = number
  default     = 300  # 5 minutes
}

variable "sqs_dlq_max_receive_count" {
  description = "Number of receives before message moves to DLQ"
  type        = number
  default     = 3
}

# ==============================================================================
# ECS
# ==============================================================================

variable "api_cpu" {
  description = "CPU units for API task (1024 = 1 vCPU)"
  type        = number
  default     = 256  # 0.25 vCPU - matches Architecture docs
}

variable "api_memory" {
  description = "Memory for API task in MB"
  type        = number
  default     = 1024
}

variable "api_desired_count" {
  description = "Desired number of API tasks"
  type        = number
  default     = 2
}

variable "api_min_count" {
  description = "Minimum number of API tasks for autoscaling"
  type        = number
  default     = 2
}

variable "api_max_count" {
  description = "Maximum number of API tasks for autoscaling"
  type        = number
  default     = 10
}

variable "worker_cpu" {
  description = "CPU units for worker task"
  type        = number
  default     = 256
}

variable "worker_memory" {
  description = "Memory for worker task in MB"
  type        = number
  default     = 512
}

variable "worker_min_count" {
  description = "Minimum number of worker tasks (can be 0 to scale to zero)"
  type        = number
  default     = 0
}

variable "worker_max_count" {
  description = "Maximum number of worker tasks for burst processing"
  type        = number
  default     = 20
}

variable "pgbouncer_desired_count" {
  description = "Number of PgBouncer instances for connection pooling"
  type        = number
  default     = 2  # HA: 2 instances across AZs
}

# ==============================================================================
# AUTOSCALING
# ==============================================================================

variable "api_scale_up_cpu_threshold" {
  description = "CPU percentage to trigger API scale up"
  type        = number
  default     = 70
}

variable "api_scale_down_cpu_threshold" {
  description = "CPU percentage to trigger API scale down"
  type        = number
  default     = 30
}

variable "worker_queue_depth_threshold" {
  description = "SQS queue depth to trigger worker scale up"
  type        = number
  default     = 100
}

# ==============================================================================
# LOGGING
# ==============================================================================

variable "log_retention_days" {
  description = "CloudWatch log retention period in days"
  type        = number
  default     = 30
}

variable "security_log_retention_days" {
  description = "Retention period for security-related logs"
  type        = number
  default     = 90
}

# ==============================================================================
# TAGGING
# ==============================================================================

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}

variable "cost_center" {
  description = "Cost center for billing allocation"
  type        = string
  default     = "platform"
}

variable "owner" {
  description = "Team or person responsible for these resources"
  type        = string
  default     = "platform-team"
}

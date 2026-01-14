# EuroComply Monitoring Module - Variables
# Configurable thresholds for scaling alerts

variable "environment" {
  description = "Environment name (production, staging)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "eu-west-1"
}

# SNS Topic for alerts
variable "alert_topic_arn" {
  description = "ARN of the SNS topic for alerts"
  type        = string
}

# Slack configuration
variable "slack_webhook_secret_arn" {
  description = "ARN of the Secrets Manager secret containing Slack webhook URL"
  type        = string
}

variable "slack_channel" {
  description = "Slack channel for alerts (without #)"
  type        = string
  default     = "eurocomply-alerts"
}

# Resource identifiers
variable "rds_instance_id" {
  description = "RDS instance identifier for database cell"
  type        = string
}

variable "elasticache_cluster_id" {
  description = "ElastiCache cluster identifier"
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster name"
  type        = string
}

variable "ecs_api_service_name" {
  description = "ECS API service name"
  type        = string
}

variable "ecs_worker_service_name" {
  description = "ECS bulk worker service name"
  type        = string
}

variable "sqs_bulk_queue_name" {
  description = "SQS bulk processing queue name"
  type        = string
}

variable "sqs_dlq_name" {
  description = "SQS dead letter queue name"
  type        = string
}

variable "nat_instance_id" {
  description = "NAT instance ID (leave empty if using NAT Gateway)"
  type        = string
  default     = ""
}

variable "dynamodb_table_name" {
  description = "DynamoDB table name for item storage"
  type        = string
  default     = "eurocomply-items"
}

# Tenant count thresholds
variable "tenant_count_warning" {
  description = "Tenant count warning threshold (plan for new cell)"
  type        = number
  default     = 150
}

variable "tenant_count_critical" {
  description = "Tenant count critical threshold (urgent: add new cell)"
  type        = number
  default     = 180
}

# RDS thresholds
variable "rds_cpu_warning" {
  description = "RDS CPU warning threshold (%)"
  type        = number
  default     = 60
}

variable "rds_cpu_critical" {
  description = "RDS CPU critical threshold (%)"
  type        = number
  default     = 75
}

variable "rds_connections_warning" {
  description = "RDS connections warning threshold"
  type        = number
  default     = 120
}

variable "rds_connections_critical" {
  description = "RDS connections critical threshold"
  type        = number
  default     = 150
}

# Redis thresholds
variable "redis_memory_warning" {
  description = "Redis memory warning threshold (%)"
  type        = number
  default     = 70
}

variable "redis_memory_critical" {
  description = "Redis memory critical threshold (%)"
  type        = number
  default     = 85
}

variable "redis_evictions_warning" {
  description = "Redis evictions per hour warning threshold"
  type        = number
  default     = 10
}

variable "redis_evictions_critical" {
  description = "Redis evictions per hour critical threshold"
  type        = number
  default     = 100
}

# NAT thresholds (bytes per hour)
variable "nat_bandwidth_warning" {
  description = "NAT bandwidth warning threshold (GB/hour)"
  type        = number
  default     = 4
}

variable "nat_bandwidth_critical" {
  description = "NAT bandwidth critical threshold (GB/hour)"
  type        = number
  default     = 8
}

# ECS thresholds
variable "api_max_tasks" {
  description = "Maximum API tasks (for near-max alert)"
  type        = number
  default     = 10
}

variable "worker_max_tasks" {
  description = "Maximum bulk worker tasks (for near-max alert)"
  type        = number
  default     = 20
}

# DLQ thresholds
variable "dlq_warning" {
  description = "DLQ message count warning threshold"
  type        = number
  default     = 1
}

variable "dlq_critical" {
  description = "DLQ message count critical threshold"
  type        = number
  default     = 10
}

# DynamoDB thresholds
variable "dynamodb_throttle_warning" {
  description = "DynamoDB throttled requests warning threshold (per minute)"
  type        = number
  default     = 1
}

variable "dynamodb_throttle_critical" {
  description = "DynamoDB throttled requests critical threshold (per minute)"
  type        = number
  default     = 10
}

# Database connection string for tenant count Lambda
variable "database_secret_arn" {
  description = "ARN of the Secrets Manager secret containing database credentials"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID for Lambda functions"
  type        = string
}

variable "private_subnet_ids" {
  description = "Private subnet IDs for Lambda functions"
  type        = list(string)
}

variable "lambda_security_group_id" {
  description = "Security group ID for Lambda functions"
  type        = string
}

# S3 Storage abuse detection
variable "s3_bucket_name" {
  description = "S3 bucket name for storage abuse monitoring"
  type        = string
  default     = ""
}

variable "storage_abuse_threshold_gb" {
  description = "Storage abuse alert threshold - GB uploaded in 24 hours"
  type        = number
  default     = 50
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}

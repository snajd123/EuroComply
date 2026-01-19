# walt.id Module Variables

variable "project" {
  type        = string
  description = "Project name"
}

variable "environment" {
  type        = string
  description = "Environment name (staging, production)"
}

variable "aws_region" {
  type        = string
  description = "AWS region"
}

variable "vpc_id" {
  type        = string
  description = "VPC ID for service discovery namespace"
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "Private subnet IDs for ECS tasks"
}

variable "security_group_id" {
  type        = string
  description = "Security group ID for walt.id service"
}

variable "ecs_cluster_id" {
  type        = string
  description = "Existing ECS cluster ID to deploy walt.id services"
}

variable "cpu" {
  type        = number
  default     = 512
  description = "CPU units for walt.id task (1 vCPU = 1024)"
}

variable "memory" {
  type        = number
  default     = 1024
  description = "Memory in MB for walt.id task"
}

variable "log_retention_days" {
  type        = number
  default     = 30
  description = "CloudWatch log retention in days"
}

variable "kms_key_arn" {
  type        = string
  default     = null
  description = "KMS key ARN for encrypting CloudWatch log groups"
}

variable "enable_backup" {
  type        = bool
  default     = false
  description = "Enable AWS Backup for EFS (recommended for production)"
}

variable "backup_retention_days" {
  type        = number
  default     = 30
  description = "Number of days to retain EFS backups"
}

variable "waltid_image" {
  type        = string
  default     = "waltid/ssikit"
  description = "walt.id SSI Kit Docker image repository"
}

variable "waltid_image_tag" {
  type        = string
  default     = "1.2312.1"
  description = "walt.id SSI Kit Docker image tag. Update deliberately after testing."
}

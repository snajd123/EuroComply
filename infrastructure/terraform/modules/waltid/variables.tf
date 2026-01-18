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

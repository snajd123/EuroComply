# ===========================================
# Outputs
# ===========================================

# -----------------------------
# VPC
# -----------------------------

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

# -----------------------------
# Database
# -----------------------------

output "rds_endpoint" {
  description = "RDS primary endpoint"
  value       = aws_db_instance.main.endpoint
}

output "rds_read_replica_endpoint" {
  description = "RDS read replica endpoint"
  value       = var.db_create_read_replica ? aws_db_instance.read_replica[0].endpoint : null
}

output "db_credentials_secret_arn" {
  description = "ARN of database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
}

# -----------------------------
# Redis
# -----------------------------

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_replication_group.main.port
}

# -----------------------------
# ECS
# -----------------------------

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = aws_ecs_service.api.name
}

output "ecr_repository_url" {
  description = "ECR repository URL"
  value       = aws_ecr_repository.api.repository_url
}

# -----------------------------
# Load Balancer
# -----------------------------

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB hosted zone ID"
  value       = aws_lb.main.zone_id
}

output "api_url" {
  description = "API URL (via ALB)"
  value       = "https://${aws_lb.main.dns_name}"
}

# -----------------------------
# S3
# -----------------------------

output "assets_bucket_name" {
  description = "Assets S3 bucket name"
  value       = aws_s3_bucket.assets.id
}

output "logs_bucket_name" {
  description = "Logs S3 bucket name"
  value       = aws_s3_bucket.logs.id
}

# -----------------------------
# SQS
# -----------------------------

output "jobs_queue_url" {
  description = "SQS jobs queue URL"
  value       = aws_sqs_queue.jobs.url
}

# -----------------------------
# SSL Certificate
# -----------------------------

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = var.create_ssl_certificate ? aws_acm_certificate.main[0].arn : null
}

# -----------------------------
# Connection Info
# -----------------------------

output "connection_info" {
  description = "Connection information for the application"
  value = {
    database_host = aws_db_instance.main.address
    redis_host    = aws_elasticache_replication_group.main.primary_endpoint_address
    api_endpoint  = "https://${aws_lb.main.dns_name}"
    region        = var.aws_region
  }
}

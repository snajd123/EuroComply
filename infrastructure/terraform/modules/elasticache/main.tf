# ElastiCache Module for EuroComply
# Creates Redis cluster for caching and session storage with AUTH enabled

variable "project" {
  type = string
}

variable "environment" {
  type = string
}

variable "private_subnet_ids" {
  type = list(string)
}

variable "security_group_id" {
  type = string
}

variable "node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "num_cache_nodes" {
  type    = number
  default = 1
}

variable "enable_auth" {
  description = "Enable Redis AUTH token authentication"
  type        = bool
  default     = true
}

locals {
  name_prefix = "${var.project}-${var.environment}"
}

# =============================================================================
# Redis AUTH Token (stored in Secrets Manager)
# =============================================================================
resource "random_password" "redis_auth" {
  count   = var.enable_auth ? 1 : 0
  length  = 64
  special = false # ElastiCache auth token only supports alphanumeric
}

resource "aws_secretsmanager_secret" "redis_auth" {
  count       = var.enable_auth ? 1 : 0
  name        = "${var.project}/${var.environment}/redis-auth-token"
  description = "Redis AUTH token for ${local.name_prefix}"

  tags = {
    Name        = "${local.name_prefix}-redis-auth"
    Environment = var.environment
  }
}

resource "aws_secretsmanager_secret_version" "redis_auth" {
  count     = var.enable_auth ? 1 : 0
  secret_id = aws_secretsmanager_secret.redis_auth[0].id
  secret_string = jsonencode({
    auth_token = random_password.redis_auth[0].result
  })
}

# =============================================================================
# Subnet Group
# =============================================================================
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis-subnet"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${local.name_prefix}-redis-subnet"
  }
}

# =============================================================================
# Redis Replication Group (required for AUTH and transit encryption)
# =============================================================================
resource "aws_elasticache_replication_group" "main" {
  replication_group_id = "${local.name_prefix}-redis"
  description          = "Redis cluster for ${local.name_prefix}"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.node_type
  num_cache_clusters   = var.num_cache_nodes
  port                 = 6379
  parameter_group_name = "default.redis7"

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]

  # Enable AUTH and encryption (required for AUTH)
  auth_token                 = var.enable_auth ? random_password.redis_auth[0].result : null
  transit_encryption_enabled = var.enable_auth
  at_rest_encryption_enabled = true

  # Automatic failover requires multi-AZ (only for production)
  automatic_failover_enabled = var.environment == "production" && var.num_cache_nodes > 1

  snapshot_retention_limit = var.environment == "production" ? 7 : 0

  tags = {
    Name = "${local.name_prefix}-redis"
  }

  lifecycle {
    ignore_changes = [auth_token]
  }
}

# =============================================================================
# Outputs
# =============================================================================
output "redis_cluster_id" {
  description = "Redis replication group ID"
  value       = aws_elasticache_replication_group.main.id
}

output "redis_endpoint" {
  description = "Redis primary endpoint address"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
}

output "redis_port" {
  description = "Redis port"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_url" {
  description = "Redis connection URL (without auth token - use secret for auth)"
  value       = var.enable_auth ? "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}" : "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}"
}

output "redis_auth_secret_arn" {
  description = "ARN of the Secrets Manager secret containing Redis AUTH token"
  value       = var.enable_auth ? aws_secretsmanager_secret.redis_auth[0].arn : null
}

output "transit_encryption_enabled" {
  description = "Whether transit encryption (TLS) is enabled"
  value       = var.enable_auth
}

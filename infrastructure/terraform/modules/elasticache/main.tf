# ElastiCache Module for EuroComply
# Creates Redis cluster for caching and session storage

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

locals {
  name_prefix = "${var.project}-${var.environment}"
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
# Redis Cluster
# =============================================================================
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${local.name_prefix}-redis"
  engine               = "redis"
  node_type            = var.node_type
  num_cache_nodes      = var.num_cache_nodes
  parameter_group_name = "default.redis7"
  engine_version       = "7.1"
  port                 = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [var.security_group_id]

  snapshot_retention_limit = var.environment == "production" ? 7 : 0

  tags = {
    Name = "${local.name_prefix}-redis"
  }
}

# =============================================================================
# Outputs
# =============================================================================
output "redis_cluster_id" {
  value = aws_elasticache_cluster.main.id
}

output "redis_endpoint" {
  value = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "redis_port" {
  value = aws_elasticache_cluster.main.port
}

output "redis_url" {
  value = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:${aws_elasticache_cluster.main.port}"
}

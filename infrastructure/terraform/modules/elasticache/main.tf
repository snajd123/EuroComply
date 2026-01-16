# ElastiCache Module for EuroComply
# Creates Redis cluster for caching and session storage

# =============================================================================
# ElastiCache Subnet Group
# =============================================================================
resource "aws_elasticache_subnet_group" "main" {
  name        = "${var.project}-${var.environment}-redis-subnet"
  description = "Redis subnet group for ${var.project}"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}

# =============================================================================
# ElastiCache Parameter Group
# =============================================================================
resource "aws_elasticache_parameter_group" "main" {
  name        = "${var.project}-${var.environment}-redis-params"
  family      = "redis7"
  description = "Redis parameter group for ${var.project}"

  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}

# =============================================================================
# ElastiCache Redis Cluster
# =============================================================================
resource "aws_elasticache_cluster" "main" {
  cluster_id           = "${var.project}-${var.environment}-redis"
  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_nodes      = 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.main.name
  subnet_group_name    = aws_elasticache_subnet_group.main.name
  security_group_ids   = [var.security_group_id]

  # Maintenance
  maintenance_window = "sun:05:00-sun:06:00"

  # Snapshots (for non-production, disable to save costs)
  snapshot_retention_limit = var.environment == "production" ? 7 : 0

  tags = {
    Name        = "${var.project}-${var.environment}-redis"
    Environment = var.environment
    Project     = var.project
  }
}

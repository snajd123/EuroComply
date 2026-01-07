# ===========================================
# RDS PostgreSQL Database
# ===========================================

# -----------------------------
# RDS Parameter Group
# -----------------------------

resource "aws_db_parameter_group" "main" {
  family = "postgres16"
  name   = "${local.name_prefix}-pg16-params"

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries > 1 second
  }

  tags = {
    Name = "${local.name_prefix}-pg16-params"
  }
}

# -----------------------------
# RDS Primary Instance
# -----------------------------

resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  # Engine
  engine               = "postgres"
  engine_version       = "16.3"
  instance_class       = var.db_instance_class
  parameter_group_name = aws_db_parameter_group.main.name

  # Storage
  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 2
  storage_type          = "gp3"
  storage_encrypted     = true

  # Database
  db_name  = var.db_name
  username = var.db_username
  password = random_password.db_password.result
  port     = 5432

  # Network
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  # Backup
  backup_retention_period = 30
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  # Deletion protection (enable in production)
  deletion_protection       = var.environment == "production"
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name_prefix}-final-snapshot" : null

  # Performance Insights
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  # Logging
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}

# -----------------------------
# RDS Read Replica (optional)
# -----------------------------

resource "aws_db_instance" "read_replica" {
  count = var.db_create_read_replica ? 1 : 0

  identifier = "${local.name_prefix}-postgres-replica"

  # Replica configuration
  replicate_source_db = aws_db_instance.main.identifier
  instance_class      = var.db_instance_class

  # Storage
  storage_encrypted = true

  # Network
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false

  # No backup for replica (handled by primary)
  backup_retention_period = 0

  # Deletion protection
  deletion_protection = var.environment == "production"
  skip_final_snapshot = true

  # Performance Insights
  performance_insights_enabled          = true
  performance_insights_retention_period = 7

  tags = {
    Name = "${local.name_prefix}-postgres-replica"
  }
}

# infrastructure/terraform/modules/rds/main.tf

variable "identifier" {
  type = string
}

variable "engine" {
  type    = string
  default = "postgres"
}

variable "engine_version" {
  type    = string
  default = "15.4"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.small"
}

variable "allocated_storage" {
  type    = number
  default = 50
}

variable "max_allocated_storage" {
  type    = number
  default = 200
}

variable "multi_az" {
  type    = bool
  default = true
}

variable "db_name" {
  type = string
}

variable "username" {
  type = string
}

variable "vpc_id" {
  type = string
}

variable "subnet_group_name" {
  type = string
}

variable "vpc_security_group_ids" {
  type = list(string)
}

variable "backup_retention_period" {
  type    = number
  default = 7
}

variable "backup_window" {
  type    = string
  default = "03:00-04:00"
}

variable "maintenance_window" {
  type    = string
  default = "Mon:04:00-Mon:05:00"
}

variable "performance_insights_enabled" {
  type    = bool
  default = true
}

variable "kms_key_id" {
  type    = string
  default = null
}

variable "deletion_protection" {
  type    = bool
  default = true
}

# Generate random password
resource "random_password" "master" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store password in Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name        = "${var.identifier}-password"
  description = "Master password for ${var.identifier}"
  kms_key_id  = var.kms_key_id
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = var.username
    password = random_password.master.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    database = var.db_name
  })
}

# Parameter Group with optimized settings
resource "aws_db_parameter_group" "main" {
  family = "postgres15"
  name   = var.identifier

  # Performance settings
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000"  # Log queries over 1 second
  }

  # Connection settings
  parameter {
    name  = "max_connections"
    value = "200"
  }

  tags = {
    Name = var.identifier
  }
}

# RDS Instance
resource "aws_db_instance" "main" {
  identifier = var.identifier

  engine         = var.engine
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_id

  db_name  = var.db_name
  username = var.username
  password = random_password.master.result

  multi_az               = var.multi_az
  db_subnet_group_name   = var.subnet_group_name
  vpc_security_group_ids = var.vpc_security_group_ids
  publicly_accessible    = false

  parameter_group_name = aws_db_parameter_group.main.name

  backup_retention_period = var.backup_retention_period
  backup_window           = var.backup_window
  maintenance_window      = var.maintenance_window
  copy_tags_to_snapshot   = true

  performance_insights_enabled          = var.performance_insights_enabled
  performance_insights_retention_period = 7
  performance_insights_kms_key_id       = var.kms_key_id

  deletion_protection      = var.deletion_protection
  skip_final_snapshot      = false
  final_snapshot_identifier = "${var.identifier}-final"

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = {
    Name = var.identifier
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Outputs
output "identifier" {
  value = aws_db_instance.main.identifier
}

output "endpoint" {
  value = aws_db_instance.main.endpoint
}

output "address" {
  value = aws_db_instance.main.address
}

output "port" {
  value = aws_db_instance.main.port
}

output "password_secret_arn" {
  value = aws_secretsmanager_secret.db_password.arn
}

output "connection_string" {
  value     = "postgresql://${var.username}:${random_password.master.result}@${aws_db_instance.main.endpoint}/${var.db_name}"
  sensitive = true
}

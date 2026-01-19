# RDS Module for EuroComply
# Creates PostgreSQL RDS instance with Secrets Manager credentials

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

variable "project" {
  description = "Project name used for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (e.g., staging, production)"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for RDS subnet group"
  type        = list(string)
}

variable "security_group_id" {
  description = "Security group ID for RDS instance"
  type        = string
}

variable "instance_class" {
  description = "RDS instance class (e.g., db.t4g.micro, db.t4g.small)"
  type        = string
  default     = "db.t4g.micro"
}

variable "allocated_storage" {
  description = "Allocated storage in GB for RDS instance"
  type        = number
  default     = 20
}

variable "multi_az" {
  description = "Enable Multi-AZ deployment for high availability"
  type        = bool
  default     = false
}

variable "backup_retention_period" {
  description = "Number of days to retain automated backups (14 for staging, 30+ for production)"
  type        = number
  default     = 14
}

variable "enable_secret_rotation" {
  description = "Enable automatic secret rotation for database credentials"
  type        = bool
  default     = false
}

variable "secret_rotation_days" {
  description = "Number of days between automatic secret rotations"
  type        = number
  default     = 30
}

variable "kms_key_arn" {
  description = "ARN of KMS key for encryption. Uses AWS-managed key if not provided."
  type        = string
  default     = null
}

locals {
  name_prefix = "${var.project}-${var.environment}"
}

# =============================================================================
# Custom Parameter Group (security-focused settings)
# =============================================================================
resource "aws_db_parameter_group" "main" {
  name   = "${local.name_prefix}-postgres-params"
  family = "postgres15"

  # Log connection events for security auditing
  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  # Log DDL statements for audit trail
  parameter {
    name  = "log_statement"
    value = "ddl"
  }

  # Log slow queries (> 1 second) for performance monitoring
  parameter {
    name  = "log_min_duration_statement"
    value = "1000"
  }

  # Enable checkpoints logging for crash recovery diagnostics
  parameter {
    name  = "log_checkpoints"
    value = "1"
  }

  # Enforce SSL connections
  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  tags = {
    Name = "${local.name_prefix}-postgres-params"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# =============================================================================
# DB Subnet Group
# =============================================================================
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet"
  subnet_ids = var.private_subnet_ids

  tags = {
    Name = "${local.name_prefix}-db-subnet"
  }
}

# =============================================================================
# Random Password
# =============================================================================
resource "random_password" "db" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# =============================================================================
# Secrets Manager
# =============================================================================
resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${var.project}/${var.environment}/database"
  description = "RDS PostgreSQL credentials for ${var.project} ${var.environment}"

  tags = {
    Name = "${local.name_prefix}-db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "eurocomply"
    password = random_password.db.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    database = aws_db_instance.main.db_name
    engine   = "postgres"
  })
}

# =============================================================================
# Secret Rotation (optional, for production)
# Uses AWS-managed rotation Lambda for RDS PostgreSQL
# =============================================================================
resource "aws_secretsmanager_secret_rotation" "db_credentials" {
  count = var.enable_secret_rotation ? 1 : 0

  secret_id           = aws_secretsmanager_secret.db_credentials.id
  rotation_lambda_arn = aws_lambda_function.secret_rotation[0].arn

  rotation_rules {
    automatically_after_days = var.secret_rotation_days
  }

  depends_on = [aws_lambda_permission.secret_rotation]
}

# Build rotation Lambda package
resource "null_resource" "build_rotation_lambda" {
  count = var.enable_secret_rotation ? 1 : 0

  triggers = {
    source_hash       = filemd5("${path.module}/../../../lambda/rds-secret-rotation/lambda_function.py")
    requirements_hash = filemd5("${path.module}/../../../lambda/rds-secret-rotation/requirements.txt")
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../../../lambda/rds-secret-rotation
      rm -rf package lambda.zip
      pip install -r requirements.txt -t package --platform manylinux2014_x86_64 --only-binary=:all: --quiet
      cp lambda_function.py package/
      cd package && zip -r ../lambda.zip . -q
    EOT
  }
}

# Lambda for secret rotation (single-user rotation strategy)
resource "aws_lambda_function" "secret_rotation" {
  count = var.enable_secret_rotation ? 1 : 0

  function_name = "${local.name_prefix}-rds-secret-rotation"
  description   = "Rotates RDS PostgreSQL credentials"
  role          = aws_iam_role.secret_rotation[0].arn
  handler       = "lambda_function.lambda_handler"
  runtime       = "python3.11"
  timeout       = 30
  memory_size   = 128

  filename         = "${path.module}/../../../lambda/rds-secret-rotation/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/rds-secret-rotation/lambda_function.py")

  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      SECRETS_MANAGER_ENDPOINT = "https://secretsmanager.eusc-de-east-1.amazonaws.eu"
    }
  }

  depends_on = [null_resource.build_rotation_lambda]

  tags = {
    Name = "${local.name_prefix}-rds-secret-rotation"
  }
}

resource "aws_iam_role" "secret_rotation" {
  count = var.enable_secret_rotation ? 1 : 0
  name  = "${local.name_prefix}-secret-rotation"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "secret_rotation" {
  count = var.enable_secret_rotation ? 1 : 0
  name  = "secret-rotation-policy"
  role  = aws_iam_role.secret_rotation[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage"
        ]
        Resource = aws_secretsmanager_secret.db_credentials.arn
      },
      {
        Effect   = "Allow"
        Action   = ["secretsmanager:GetRandomPassword"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws-eusc:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_permission" "secret_rotation" {
  count = var.enable_secret_rotation ? 1 : 0

  statement_id  = "AllowSecretsManagerInvocation"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.secret_rotation[0].function_name
  principal     = "secretsmanager.amazonaws.com"
}

# =============================================================================
# RDS Instance
# =============================================================================
resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  engine         = "postgres"
  engine_version = "15"
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 2
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = var.kms_key_arn # Uses AWS-managed key if null

  db_name  = "eurocomply"
  username = "eurocomply"
  password = random_password.db.result

  # Enable IAM authentication (most secure - no passwords needed)
  iam_database_authentication_enabled = true

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]
  parameter_group_name   = aws_db_parameter_group.main.name

  backup_retention_period = var.backup_retention_period
  backup_window           = "03:00-04:00"
  maintenance_window      = "Mon:04:00-Mon:05:00"

  auto_minor_version_upgrade = true
  deletion_protection        = var.environment == "production"
  skip_final_snapshot        = var.environment != "production"
  final_snapshot_identifier  = var.environment == "production" ? "${local.name_prefix}-final-snapshot" : null

  performance_insights_enabled = var.environment == "production"

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}

# =============================================================================
# Outputs
# =============================================================================
output "db_instance_id" {
  value = aws_db_instance.main.id
}

output "db_instance_address" {
  value = aws_db_instance.main.address
}

output "db_instance_port" {
  value = aws_db_instance.main.port
}

output "db_name" {
  value = aws_db_instance.main.db_name
}

output "db_username" {
  value = aws_db_instance.main.username
}

output "db_credentials_secret_arn" {
  value = aws_secretsmanager_secret.db_credentials.arn
}

output "db_resource_id" {
  description = "RDS resource ID for IAM authentication policy"
  value       = aws_db_instance.main.resource_id
}

# =============================================================================
# Migration User Credentials (for CI/CD Prisma migrations)
# =============================================================================
resource "aws_secretsmanager_secret" "migrate_credentials" {
  count       = var.setup_iam_auth ? 1 : 0
  name        = "${var.project}/${var.environment}/database-migrate"
  description = "RDS PostgreSQL migration user credentials for ${var.project} ${var.environment}"

  tags = {
    Name = "${local.name_prefix}-db-migrate-credentials"
  }
}

# Initial placeholder - Lambda will populate with actual credentials
resource "aws_secretsmanager_secret_version" "migrate_credentials" {
  count     = var.setup_iam_auth ? 1 : 0
  secret_id = aws_secretsmanager_secret.migrate_credentials[0].id
  secret_string = jsonencode({
    username = "eurocomply_migrate"
    password = "placeholder-will-be-set-by-lambda"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    database = aws_db_instance.main.db_name
    engine   = "postgres"
  })

  lifecycle {
    # Lambda manages the actual credentials - don't overwrite on apply
    ignore_changes = [secret_string]
  }
}

# =============================================================================
# Three-User Database Architecture Setup Lambda
# Creates: eurocomply_app (IAM auth), eurocomply_migrate (password auth)
# Fixes: PostgreSQL 15+ schema permissions, PAM authentication conflicts
# =============================================================================

variable "setup_iam_auth" {
  description = "Whether to set up IAM authentication via Lambda"
  type        = bool
  default     = false
}

variable "lambda_subnet_ids" {
  description = "Subnet IDs for Lambda (same as RDS for connectivity)"
  type        = list(string)
  default     = []
}

variable "lambda_security_group_id" {
  description = "Security group ID for Lambda (must allow access to RDS)"
  type        = string
  default     = ""
}

# Lambda execution role
resource "aws_iam_role" "iam_setup_lambda" {
  count = var.setup_iam_auth ? 1 : 0
  name  = "${local.name_prefix}-rds-iam-setup-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })
}

resource "aws_iam_role_policy" "iam_setup_lambda" {
  count = var.setup_iam_auth ? 1 : 0
  name  = "lambda-permissions"
  role  = aws_iam_role.iam_setup_lambda[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws-eusc:logs:*:*:*"
      },
      {
        # Read master credentials
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.db_credentials.arn
      },
      {
        # Write migration user credentials (Lambda generates and stores password)
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue"
        ]
        Resource = aws_secretsmanager_secret.migrate_credentials[0].arn
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      },
      {
        # Allow IAM token auth for master user (recovery scenario)
        # Needed when master user already has rds_iam granted from previous run
        Effect   = "Allow"
        Action   = ["rds-db:connect"]
        Resource = "arn:${local.partition}:rds-db:*:*:dbuser:${aws_db_instance.main.resource_id}/${aws_db_instance.main.username}"
      }
    ]
  })
}

# Partition for ARN (aws, aws-cn, aws-eusc, etc.)
locals {
  partition = data.aws_partition.current.partition
}

data "aws_partition" "current" {}

# Build Lambda package with dependencies
resource "null_resource" "build_iam_setup_lambda" {
  count = var.setup_iam_auth ? 1 : 0

  triggers = {
    source_hash       = filemd5("${path.module}/../../../lambda/rds-iam-setup/index.py")
    requirements_hash = filemd5("${path.module}/../../../lambda/rds-iam-setup/requirements.txt")
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../../../lambda/rds-iam-setup
      rm -rf package lambda.zip
      # Download dependencies for Python 3.11 (Lambda runtime version)
      pip download -r requirements.txt -d /tmp/psycopg2-download --platform manylinux2014_x86_64 --python-version 3.11 --only-binary=:all: --quiet
      mkdir -p package
      # Extract wheel files
      for whl in /tmp/psycopg2-download/*.whl; do
        unzip -q -o "$whl" -d package
      done
      cp index.py package/
      cd package && zip -r ../lambda.zip . -q -x "*.pyc" -x "__pycache__/*"
      rm -rf /tmp/psycopg2-download
    EOT
  }
}

# Lambda function
# Note: lambda.zip must be pre-built with dependencies using:
#   cd lambda/rds-iam-setup && pip download psycopg2-binary -d package --platform manylinux2014_x86_64 --python-version 311 --only-binary=:all:
#   cd package && unzip *.whl && rm *.whl && cp ../index.py . && zip -r ../lambda.zip .
resource "aws_lambda_function" "iam_setup" {
  count = var.setup_iam_auth ? 1 : 0

  function_name = "${local.name_prefix}-rds-iam-setup"
  role          = aws_iam_role.iam_setup_lambda[0].arn
  handler       = "index.handler"
  runtime       = "python3.11"
  timeout       = 30
  memory_size   = 256

  filename         = "${path.module}/../../../lambda/rds-iam-setup/lambda.zip"
  source_code_hash = filebase64sha256("${path.module}/../../../lambda/rds-iam-setup/lambda.zip")

  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      DB_SECRET_ARN            = aws_secretsmanager_secret.db_credentials.arn
      MIGRATE_SECRET_ARN       = aws_secretsmanager_secret.migrate_credentials[0].arn
      # Use password auth for master user (default for fresh deployments)
      # Only set to "true" if master user already has rds_iam granted (recovery scenario)
      USE_IAM_AUTH_FOR_MASTER  = "false"
    }
  }

  depends_on = [
    aws_db_instance.main,
    aws_secretsmanager_secret_version.migrate_credentials,
    null_resource.build_iam_setup_lambda
  ]

  tags = {
    Name = "${local.name_prefix}-rds-iam-setup"
  }
}

# Invoke Lambda to set up IAM auth
resource "aws_lambda_invocation" "iam_setup" {
  count = var.setup_iam_auth ? 1 : 0

  function_name = aws_lambda_function.iam_setup[0].function_name
  input = jsonencode({
    # Include a trigger to allow re-invocation when needed
    db_instance_id = aws_db_instance.main.id
  })

  depends_on = [aws_lambda_function.iam_setup]

  # Removed ignore_changes to detect Lambda errors on subsequent applies
  # If re-invocation is undesired, use a separate trigger mechanism
}

# Verify Lambda execution succeeded
resource "null_resource" "verify_iam_setup" {
  count = var.setup_iam_auth ? 1 : 0

  triggers = {
    lambda_result = aws_lambda_invocation.iam_setup[0].result
  }

  provisioner "local-exec" {
    command = <<-EOT
      RESULT='${aws_lambda_invocation.iam_setup[0].result}'
      echo "Lambda result: $RESULT"

      # Check if result contains error
      if echo "$RESULT" | grep -qi "error"; then
        echo "ERROR: IAM setup Lambda returned an error"
        exit 1
      fi

      # Check for success indicator
      if echo "$RESULT" | grep -qi "success\|granted"; then
        echo "IAM authentication setup completed successfully"
        exit 0
      fi

      echo "WARNING: Could not verify Lambda result, check logs"
    EOT
  }

  depends_on = [aws_lambda_invocation.iam_setup]
}

output "iam_setup_result" {
  description = "Result of IAM authentication setup"
  value       = var.setup_iam_auth ? jsondecode(aws_lambda_invocation.iam_setup[0].result) : null
}

# =============================================================================
# Three-User Architecture Outputs
# =============================================================================

output "db_app_username" {
  description = "Application database username (IAM token auth, DML only)"
  value       = "eurocomply_app"
}

output "db_migrate_username" {
  description = "Migration database username (password auth, schema owner)"
  value       = "eurocomply_migrate"
}

output "db_migrate_credentials_secret_arn" {
  description = "ARN of migration user credentials secret"
  value       = var.setup_iam_auth ? aws_secretsmanager_secret.migrate_credentials[0].arn : null
}

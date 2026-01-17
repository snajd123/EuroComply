# RDS Module for EuroComply
# Creates PostgreSQL RDS instance with Secrets Manager credentials

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

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "backup_retention_period" {
  type    = number
  default = 7
}

locals {
  name_prefix = "${var.project}-${var.environment}"
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
  })
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

  db_name  = "eurocomply"
  username = "eurocomply"
  password = random_password.db.result

  # Enable IAM authentication (most secure - no passwords needed)
  iam_database_authentication_enabled = true

  multi_az               = var.multi_az
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.security_group_id]

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
# IAM Authentication Setup Lambda
# Grants rds_iam role to database user (required for IAM auth)
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
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = aws_secretsmanager_secret.db_credentials.arn
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

# Build Lambda package with dependencies
resource "null_resource" "build_iam_setup_lambda" {
  count = var.setup_iam_auth ? 1 : 0

  triggers = {
    source_hash = filemd5("${path.module}/../../../lambda/rds-iam-setup/index.py")
    requirements_hash = filemd5("${path.module}/../../../lambda/rds-iam-setup/requirements.txt")
  }

  provisioner "local-exec" {
    command = <<-EOT
      cd ${path.module}/../../../lambda/rds-iam-setup
      rm -rf package lambda.zip
      pip install -r requirements.txt -t package --platform manylinux2014_x86_64 --only-binary=:all: --quiet
      cp index.py package/
      cd package && zip -r ../lambda.zip . -q
    EOT
  }
}

# Package Lambda code
data "archive_file" "iam_setup_lambda" {
  count       = var.setup_iam_auth ? 1 : 0
  type        = "zip"
  source_file = "${path.module}/../../../lambda/rds-iam-setup/index.py"
  output_path = "${path.module}/../../../lambda/rds-iam-setup-source.zip"
}

# Lambda function
resource "aws_lambda_function" "iam_setup" {
  count = var.setup_iam_auth ? 1 : 0

  function_name = "${local.name_prefix}-rds-iam-setup"
  role          = aws_iam_role.iam_setup_lambda[0].arn
  handler       = "index.handler"
  runtime       = "python3.11"
  timeout       = 30
  memory_size   = 256

  filename         = "${path.module}/../../../lambda/rds-iam-setup/lambda.zip"
  source_code_hash = data.archive_file.iam_setup_lambda[0].output_base64sha256

  vpc_config {
    subnet_ids         = var.lambda_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      DB_SECRET_ARN = aws_secretsmanager_secret.db_credentials.arn
    }
  }

  depends_on = [
    aws_db_instance.main,
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
  input         = jsonencode({})

  depends_on = [aws_lambda_function.iam_setup]

  lifecycle {
    # Only run once - don't re-invoke on subsequent applies
    ignore_changes = [input]
  }
}

output "iam_setup_result" {
  description = "Result of IAM authentication setup"
  value       = var.setup_iam_auth ? jsondecode(aws_lambda_invocation.iam_setup[0].result) : null
}

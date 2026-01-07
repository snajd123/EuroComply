# ===========================================
# AWS Secrets Manager
# ===========================================

# -----------------------------
# Database Credentials
# -----------------------------

resource "aws_secretsmanager_secret" "db_credentials" {
  name        = "${local.name_prefix}/database"
  description = "Database credentials for EuroComply"

  tags = {
    Name = "${local.name_prefix}-db-credentials"
  }
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id

  secret_string = jsonencode({
    username          = var.db_username
    password          = random_password.db_password.result
    host              = aws_db_instance.main.address
    port              = aws_db_instance.main.port
    database          = var.db_name
    connection_string = "postgresql://${var.db_username}:${random_password.db_password.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${var.db_name}?sslmode=require"
  })
}

# -----------------------------
# Application Secrets
# -----------------------------

resource "aws_secretsmanager_secret" "app_secrets" {
  name        = "${local.name_prefix}/application"
  description = "Application secrets for EuroComply"

  tags = {
    Name = "${local.name_prefix}-app-secrets"
  }
}

resource "aws_secretsmanager_secret_version" "app_secrets" {
  secret_id = aws_secretsmanager_secret.app_secrets.id

  secret_string = jsonencode({
    jwt_secret = random_password.jwt_secret.result
    # Add more secrets as needed:
    # shopify_api_key    = ""
    # shopify_api_secret = ""
  })
}

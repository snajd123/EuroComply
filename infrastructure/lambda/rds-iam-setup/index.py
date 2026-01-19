"""
RDS IAM Authentication Setup Lambda

This Lambda function grants the rds_iam role to the database user,
enabling IAM-based authentication (passwordless, most secure).

Runs once per environment during infrastructure setup.
"""

import json
import logging
import re
import boto3
import psycopg2
from psycopg2 import sql
import os

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Strict allowlist pattern for database usernames
# Only lowercase letters, numbers, and underscores, must start with letter
USERNAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]{0,62}$')


class LambdaError(Exception):
    """Base exception for Lambda errors with structured response."""
    def __init__(self, message: str, status_code: int = 500, error_type: str = "INTERNAL_ERROR"):
        self.message = message
        self.status_code = status_code
        self.error_type = error_type
        super().__init__(self.message)

    def to_response(self) -> dict:
        return {
            'statusCode': self.status_code,
            'body': json.dumps({
                'error': self.error_type,
                'message': self.message
            })
        }


class ConfigurationError(LambdaError):
    """Raised when required configuration is missing."""
    def __init__(self, message: str):
        super().__init__(message, status_code=400, error_type="CONFIGURATION_ERROR")


class ValidationError(LambdaError):
    """Raised when input validation fails."""
    def __init__(self, message: str):
        super().__init__(message, status_code=400, error_type="VALIDATION_ERROR")


class SecretsManagerError(LambdaError):
    """Raised when Secrets Manager operations fail."""
    def __init__(self, message: str):
        super().__init__(message, status_code=500, error_type="SECRETS_ERROR")


class DatabaseError(LambdaError):
    """Raised when database operations fail."""
    def __init__(self, message: str):
        super().__init__(message, status_code=500, error_type="DATABASE_ERROR")


def handler(event, context):
    """Grant rds_iam role to database user for IAM authentication."""
    logger.info("Starting RDS IAM setup")

    try:
        # Validate configuration
        secret_arn = os.environ.get('DB_SECRET_ARN')
        if not secret_arn:
            raise ConfigurationError('DB_SECRET_ARN environment variable not set')

        # Get database credentials from Secrets Manager
        logger.info("Retrieving database credentials from Secrets Manager")
        secret = _get_database_secret(secret_arn)

        db_user = secret['username']

        # Validate username against strict allowlist pattern to prevent SQL injection
        if not USERNAME_PATTERN.match(db_user):
            raise ValidationError(
                'Invalid username format. Must match pattern: lowercase letters, '
                'numbers, underscores only, start with letter, max 63 chars'
            )

        # Grant rds_iam role
        logger.info(f"Granting rds_iam role to user: {db_user}")
        _grant_rds_iam_role(secret)

        logger.info(f"Successfully granted rds_iam role to {db_user}")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'message': f'Successfully granted rds_iam role to {db_user}',
                'iam_auth_enabled': True
            })
        }

    except LambdaError as e:
        logger.error(f"{e.error_type}: {e.message}")
        return e.to_response()
    except Exception as e:
        logger.exception("Unexpected error occurred")
        return LambdaError(f"Unexpected error: {str(e)}").to_response()


def _get_database_secret(secret_arn: str) -> dict:
    """Retrieve database credentials from Secrets Manager."""
    secrets_client = boto3.client('secretsmanager')

    try:
        secret_response = secrets_client.get_secret_value(SecretId=secret_arn)
        return json.loads(secret_response['SecretString'])
    except Exception as e:
        raise SecretsManagerError(f'Failed to get secret: {str(e)}')


def _grant_rds_iam_role(secret: dict) -> None:
    """Connect to database and grant rds_iam role to user."""
    db_host = secret['host']
    db_port = secret['port']
    db_name = secret['database']
    db_user = secret['username']
    db_pass = secret['password']

    conn = None
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            dbname=db_name,
            user=db_user,
            password=db_pass,
            sslmode='require'
        )
        conn.autocommit = True
        cursor = conn.cursor()

        # Grant rds_iam role to the user
        # Use psycopg2.sql for safe identifier quoting (GRANT doesn't support parameterized role names)
        grant_query = sql.SQL("GRANT rds_iam TO {};").format(sql.Identifier(db_user))
        cursor.execute(grant_query)

        # Verify the grant
        cursor.execute("""
            SELECT r.rolname
            FROM pg_roles r
            JOIN pg_auth_members m ON r.oid = m.roleid
            JOIN pg_roles u ON m.member = u.oid
            WHERE u.rolname = %s AND r.rolname = 'rds_iam';
        """, (db_user,))

        result = cursor.fetchone()
        cursor.close()

        if not result:
            raise DatabaseError('Failed to verify rds_iam grant')

    except psycopg2.Error as e:
        raise DatabaseError(f'Database operation failed: {str(e)}')
    finally:
        if conn:
            conn.close()

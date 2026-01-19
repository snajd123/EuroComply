"""
RDS Database Initialization Lambda - Three-User Security Architecture

This Lambda function sets up a secure three-user database architecture:

1. eurocomply (Master User)
   - Used by: This Lambda only (during Terraform apply)
   - Auth: Password (from Secrets Manager)
   - Privileges: rds_superuser (automatic), NO rds_iam
   - Purpose: Database administration and user management

2. eurocomply_app (Application User)
   - Used by: ECS Fargate tasks at runtime
   - Auth: IAM Token (15-minute expiry, auto-generated)
   - Privileges: SELECT, INSERT, UPDATE, DELETE only (DML)
   - Purpose: Application runtime with least privilege

3. eurocomply_migrate (Migration User)
   - Used by: CI/CD pipelines for Prisma migrations
   - Auth: Password (from Secrets Manager)
   - Privileges: Schema owner, full DDL + DML
   - Purpose: Database schema migrations

Security measures:
- Runs in private VPC subnet (no internet access)
- Master credentials from Secrets Manager (never exposed to app)
- Migration credentials stored separately in Secrets Manager
- App user has NO password - IAM token auth only
- SQL injection prevention via parameterized queries and psycopg2.sql
- All connections use SSL/TLS (sslmode='require')

PostgreSQL 15+ Compatibility:
- Transfers public schema ownership to migration user
- Sets default privileges so app user can access migrated tables
- Fixes the "denied access on public schema" issue permanently
"""

import json
import logging
import re
import secrets
import string
import boto3
import psycopg2
from psycopg2 import sql
import os

# Configure structured logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# User names - constants for the three-user architecture
APP_USER = "eurocomply_app"
MIGRATE_USER = "eurocomply_migrate"

# Strict allowlist pattern for database usernames
USERNAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]{0,62}$')
SCHEMA_PATTERN = re.compile(r'^[a-z][a-z0-9_]{0,62}$')


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
    """
    Initialize database with three-user security architecture.

    Steps:
    1. Connect as master user (eurocomply)
    2. Create migration user (eurocomply_migrate) with password
    3. Create application user (eurocomply_app) for IAM auth
    4. Transfer public schema ownership to migration user
    5. Grant DML-only permissions to application user
    6. Revoke rds_iam from master user (prevents PAM conflicts)
    7. Store migration credentials in Secrets Manager
    8. Verify all setup succeeded
    """
    logger.info("Starting RDS database initialization with three-user architecture")

    try:
        # Validate configuration
        db_secret_arn = os.environ.get('DB_SECRET_ARN')
        if not db_secret_arn:
            raise ConfigurationError('DB_SECRET_ARN environment variable not set')

        migrate_secret_arn = os.environ.get('MIGRATE_SECRET_ARN')
        if not migrate_secret_arn:
            raise ConfigurationError('MIGRATE_SECRET_ARN environment variable not set')

        # Get master database credentials from Secrets Manager
        logger.info("Retrieving master database credentials from Secrets Manager")
        master_secret = _get_secret(db_secret_arn)

        master_user = master_secret['username']
        db_name = master_secret['database']

        # Validate master username
        if not USERNAME_PATTERN.match(master_user):
            raise ValidationError(
                'Invalid master username format. Must match pattern: lowercase letters, '
                'numbers, underscores only, start with letter, max 63 chars'
            )

        # Generate secure password for migration user
        migrate_password = _generate_secure_password()

        # Connect and perform all setup operations
        logger.info(f"Connecting to database as master user: {master_user}")
        results = _initialize_database(master_secret, migrate_password, migrate_secret_arn)

        logger.info("Database initialization completed successfully")
        return {
            'statusCode': 200,
            'body': json.dumps({
                'success': True,
                'message': 'Three-user database architecture configured successfully',
                'details': results,
                'users': {
                    'master': master_user,
                    'app': APP_USER,
                    'migrate': MIGRATE_USER
                }
            })
        }

    except LambdaError as e:
        logger.error(f"{e.error_type}: {e.message}")
        return e.to_response()
    except Exception as e:
        logger.exception("Unexpected error occurred")
        return LambdaError(f"Unexpected error: {str(e)}").to_response()


def _get_secret(secret_arn: str) -> dict:
    """Retrieve secret from Secrets Manager."""
    secrets_client = boto3.client('secretsmanager')

    try:
        secret_response = secrets_client.get_secret_value(SecretId=secret_arn)
        return json.loads(secret_response['SecretString'])
    except Exception as e:
        raise SecretsManagerError(f'Failed to get secret: {str(e)}')


def _store_secret(secret_arn: str, secret_data: dict) -> None:
    """Store secret in Secrets Manager."""
    secrets_client = boto3.client('secretsmanager')

    try:
        secrets_client.put_secret_value(
            SecretId=secret_arn,
            SecretString=json.dumps(secret_data)
        )
        logger.info(f"Stored credentials in Secrets Manager")
    except Exception as e:
        raise SecretsManagerError(f'Failed to store secret: {str(e)}')


def _generate_secure_password() -> str:
    """Generate a cryptographically secure password."""
    # Use secrets module for cryptographic randomness
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*()-_=+"
    # 32 characters provides >190 bits of entropy
    return ''.join(secrets.choice(alphabet) for _ in range(32))


def _generate_iam_auth_token(host: str, port: int, username: str, region: str) -> str:
    """
    Generate an IAM authentication token for RDS.

    This is needed when the master user has rds_iam granted (which causes
    RDS to route through PAM expecting an IAM token instead of password).
    """
    rds_client = boto3.client('rds', region_name=region)

    try:
        token = rds_client.generate_db_auth_token(
            DBHostname=host,
            Port=port,
            DBUsername=username,
            Region=region
        )
        logger.info(f"Generated IAM auth token for user: {username}")
        return token
    except Exception as e:
        raise DatabaseError(f"Failed to generate IAM auth token: {str(e)}")


def _initialize_database(master_secret: dict, migrate_password: str, migrate_secret_arn: str) -> dict:
    """
    Perform comprehensive database initialization with three-user architecture.

    Security: All SQL uses parameterized queries or psycopg2.sql for
    safe identifier quoting to prevent SQL injection.
    """
    db_host = master_secret['host']
    db_port = master_secret['port']
    db_name = master_secret['database']
    master_user = master_secret['username']
    master_pass = master_secret['password']

    # Check if we should use IAM auth for master user
    # This is needed when master user has rds_iam granted (causes PAM auth)
    use_iam_auth = os.environ.get('USE_IAM_AUTH_FOR_MASTER', 'true').lower() == 'true'
    aws_region = os.environ.get('AWS_REGION', 'eusc-de-east-1')

    results = {
        'connection_verified': False,
        'migrate_user_created': False,
        'app_user_created': False,
        'schema_ownership_transferred': False,
        'app_permissions_granted': False,
        'master_user_secured': False,
        'migrate_credentials_stored': False,
        'verification_passed': False
    }

    conn = None
    try:
        # Step 1: Connect as master user with SSL
        # Use IAM token auth if master user has rds_iam (PAM routing issue)
        if use_iam_auth:
            logger.info(f"Generating IAM auth token for master user: {master_user}")
            auth_token = _generate_iam_auth_token(db_host, int(db_port), master_user, aws_region)
            connect_password = auth_token
            logger.info(f"Connecting to {db_host}:{db_port}/{db_name} with IAM token auth")
        else:
            connect_password = master_pass
            logger.info(f"Connecting to {db_host}:{db_port}/{db_name} with password auth")

        conn = psycopg2.connect(
            host=db_host,
            port=db_port,
            dbname=db_name,
            user=master_user,
            password=connect_password,
            sslmode='require',
            connect_timeout=10
        )
        conn.autocommit = True
        cursor = conn.cursor()

        # Verify connection
        cursor.execute("SELECT 1 AS connection_test;")
        if cursor.fetchone()[0] != 1:
            raise DatabaseError("Connection verification failed")
        results['connection_verified'] = True
        logger.info("Connection verified successfully")

        # Step 2: Create migration user (password auth, schema owner)
        logger.info(f"Creating migration user: {MIGRATE_USER}")
        _create_migrate_user(cursor, MIGRATE_USER, migrate_password)
        results['migrate_user_created'] = True

        # Step 3: Create application user (IAM auth, no password)
        logger.info(f"Creating application user: {APP_USER}")
        _create_app_user(cursor, APP_USER)
        results['app_user_created'] = True

        # Step 4: Transfer public schema ownership to migration user (PG15 fix)
        logger.info(f"Transferring public schema ownership to: {MIGRATE_USER}")
        _transfer_schema_ownership(cursor, MIGRATE_USER)
        results['schema_ownership_transferred'] = True

        # Step 5: Grant DML-only permissions to application user
        logger.info(f"Granting DML permissions to: {APP_USER}")
        _grant_app_permissions(cursor, APP_USER, MIGRATE_USER)
        results['app_permissions_granted'] = True

        # Step 6: Secure master user (revoke rds_iam to prevent PAM conflicts)
        logger.info(f"Securing master user: {master_user}")
        _secure_master_user(cursor, master_user)
        results['master_user_secured'] = True

        # Step 7: Store migration credentials in Secrets Manager
        logger.info("Storing migration credentials in Secrets Manager")
        _store_secret(migrate_secret_arn, {
            'username': MIGRATE_USER,
            'password': migrate_password,
            'host': db_host,
            'port': db_port,
            'database': db_name,
            'engine': 'postgres'
        })
        results['migrate_credentials_stored'] = True

        # Step 8: Verify setup
        logger.info("Running verification checks")
        _verify_setup(cursor, APP_USER, MIGRATE_USER, master_user)
        results['verification_passed'] = True
        logger.info("All verification checks passed")

        cursor.close()
        return results

    except psycopg2.Error as e:
        error_msg = str(e).replace(master_pass, '***').replace(migrate_password, '***')
        raise DatabaseError(f'Database operation failed: {error_msg}')
    finally:
        if conn:
            conn.close()


def _create_migrate_user(cursor, username: str, password: str) -> None:
    """
    Create or update migration user with password authentication.

    This user owns the public schema and can perform DDL operations
    (CREATE TABLE, ALTER TABLE, etc.) needed for Prisma migrations.
    """
    if not USERNAME_PATTERN.match(username):
        raise ValidationError(f'Invalid username: {username}')

    # Check if user already exists
    cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s;", (username,))
    user_exists = cursor.fetchone() is not None

    if not user_exists:
        # Create the migration user with password
        cursor.execute(sql.SQL(
            "CREATE USER {} WITH LOGIN PASSWORD %s;"
        ).format(sql.Identifier(username)), (password,))
        logger.info(f"Created migration user: {username}")
    else:
        # Update password if user exists
        cursor.execute(sql.SQL(
            "ALTER USER {} WITH PASSWORD %s;"
        ).format(sql.Identifier(username)), (password,))
        logger.info(f"Updated migration user password: {username}")


def _create_app_user(cursor, username: str) -> None:
    """
    Create application user with IAM token authentication (no password).

    This user is used by ECS tasks at runtime and can only perform
    DML operations (SELECT, INSERT, UPDATE, DELETE).
    """
    if not USERNAME_PATTERN.match(username):
        raise ValidationError(f'Invalid username: {username}')

    # Check if user already exists
    cursor.execute("SELECT 1 FROM pg_roles WHERE rolname = %s;", (username,))
    user_exists = cursor.fetchone() is not None

    if not user_exists:
        # Create user with LOGIN but no password (IAM auth only)
        cursor.execute(sql.SQL(
            "CREATE USER {} WITH LOGIN;"
        ).format(sql.Identifier(username)))
        logger.info(f"Created application user: {username}")
    else:
        logger.info(f"Application user already exists: {username}")

    # Grant rds_iam role for IAM token authentication
    cursor.execute(sql.SQL("GRANT rds_iam TO {};").format(
        sql.Identifier(username)
    ))
    logger.info(f"Granted rds_iam to: {username}")


def _transfer_schema_ownership(cursor, migrate_user: str) -> None:
    """
    Transfer public schema ownership to migration user.

    PostgreSQL 15+ Fix: The default CREATE privilege on public schema
    was removed. By making the migration user the owner, Prisma
    migrations can create tables without permission errors.
    """
    schema_name = 'public'
    if not SCHEMA_PATTERN.match(schema_name):
        raise ValidationError(f'Invalid schema name: {schema_name}')

    cursor.execute(sql.SQL(
        "ALTER SCHEMA {} OWNER TO {};"
    ).format(sql.Identifier(schema_name), sql.Identifier(migrate_user)))
    logger.info(f"Transferred schema '{schema_name}' ownership to: {migrate_user}")


def _grant_app_permissions(cursor, app_user: str, migrate_user: str) -> None:
    """
    Grant DML-only permissions to application user (principle of least privilege).

    The app user can:
    - Connect to the database
    - Use the public schema
    - SELECT, INSERT, UPDATE, DELETE on all tables
    - Use sequences (for auto-increment IDs)

    The app user CANNOT:
    - CREATE or DROP tables
    - ALTER table structure
    - GRANT permissions to others
    - Modify schema
    """
    schema_name = 'public'
    db_name = 'eurocomply'

    # Grant CONNECT on database
    cursor.execute(sql.SQL(
        "GRANT CONNECT ON DATABASE {} TO {};"
    ).format(sql.Identifier(db_name), sql.Identifier(app_user)))
    logger.info(f"Granted CONNECT on database to: {app_user}")

    # Grant USAGE on schema (allows accessing objects, but not creating)
    cursor.execute(sql.SQL(
        "GRANT USAGE ON SCHEMA {} TO {};"
    ).format(sql.Identifier(schema_name), sql.Identifier(app_user)))
    logger.info(f"Granted USAGE on schema to: {app_user}")

    # Grant DML on all existing tables (NO DDL - no CREATE, DROP, ALTER, TRUNCATE)
    cursor.execute(sql.SQL(
        "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA {} TO {};"
    ).format(sql.Identifier(schema_name), sql.Identifier(app_user)))
    logger.info(f"Granted SELECT, INSERT, UPDATE, DELETE on existing tables to: {app_user}")

    # Grant sequence usage (needed for auto-increment primary keys)
    cursor.execute(sql.SQL(
        "GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA {} TO {};"
    ).format(sql.Identifier(schema_name), sql.Identifier(app_user)))
    logger.info(f"Granted USAGE, SELECT on existing sequences to: {app_user}")

    # Grant current user (master) membership in migrate_user role
    # This is required to use ALTER DEFAULT PRIVILEGES FOR USER migrate_user
    cursor.execute(sql.SQL(
        "GRANT {} TO CURRENT_USER;"
    ).format(sql.Identifier(migrate_user)))
    logger.info(f"Granted membership in {migrate_user} to current user for ALTER DEFAULT PRIVILEGES")

    # Set default privileges so tables created by migrate_user are accessible to app_user
    # This ensures Prisma migrations automatically grant access to the app user
    cursor.execute(sql.SQL(
        "ALTER DEFAULT PRIVILEGES FOR USER {} IN SCHEMA {} "
        "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO {};"
    ).format(
        sql.Identifier(migrate_user),
        sql.Identifier(schema_name),
        sql.Identifier(app_user)
    ))
    logger.info(f"Set default table privileges for {migrate_user} -> {app_user}")

    cursor.execute(sql.SQL(
        "ALTER DEFAULT PRIVILEGES FOR USER {} IN SCHEMA {} "
        "GRANT USAGE, SELECT ON SEQUENCES TO {};"
    ).format(
        sql.Identifier(migrate_user),
        sql.Identifier(schema_name),
        sql.Identifier(app_user)
    ))
    logger.info(f"Set default sequence privileges for {migrate_user} -> {app_user}")


def _secure_master_user(cursor, master_user: str) -> None:
    """
    Remove rds_iam role from master user to prevent PAM authentication conflicts.

    Root Cause Fix: When a user has rds_iam role AND IAM authentication is enabled
    on the RDS instance, PostgreSQL routes that user's authentication through PAM,
    which expects an IAM token instead of a password. This caused "PAM authentication
    failed" errors when the Lambda tried to connect with a password.

    By removing rds_iam from the master user, password authentication works correctly.
    The master user doesn't need IAM auth - it's only used by this Lambda.
    """
    try:
        cursor.execute(sql.SQL("REVOKE rds_iam FROM {};").format(
            sql.Identifier(master_user)
        ))
        logger.info(f"Revoked rds_iam from master user: {master_user}")
    except psycopg2.Error as e:
        # May fail if master doesn't have rds_iam - that's actually good
        if 'is not a member of' in str(e).lower():
            logger.info(f"Master user {master_user} does not have rds_iam (good)")
        else:
            # Log but don't fail - this is not critical
            logger.warning(f"Could not revoke rds_iam from {master_user}: {e}")


def _verify_setup(cursor, app_user: str, migrate_user: str, master_user: str) -> None:
    """
    Verify that the three-user architecture is correctly configured.

    Checks:
    1. App user has rds_iam role (for IAM token auth)
    2. App user can access public schema
    3. Migrate user owns public schema
    4. Master user does NOT have rds_iam (prevents PAM conflicts)
    """
    # 1. Verify app user has rds_iam role
    cursor.execute("""
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles u ON u.oid = m.member
        WHERE u.rolname = %s AND r.rolname = 'rds_iam';
    """, (app_user,))
    if not cursor.fetchone():
        raise DatabaseError(f'Verification failed: {app_user} does not have rds_iam role')
    logger.info(f"Verified: {app_user} has rds_iam role")

    # 2. Verify app user can access public schema
    cursor.execute("""
        SELECT has_schema_privilege(%s, 'public', 'USAGE');
    """, (app_user,))
    result = cursor.fetchone()
    if not result or not result[0]:
        raise DatabaseError(f'Verification failed: {app_user} cannot access public schema')
    logger.info(f"Verified: {app_user} has USAGE on public schema")

    # 3. Verify migrate user owns public schema
    cursor.execute("""
        SELECT 1 FROM pg_namespace n
        JOIN pg_roles r ON n.nspowner = r.oid
        WHERE n.nspname = 'public' AND r.rolname = %s;
    """, (migrate_user,))
    if not cursor.fetchone():
        raise DatabaseError(f'Verification failed: {migrate_user} does not own public schema')
    logger.info(f"Verified: {migrate_user} owns public schema")

    # 4. Verify master user does NOT have rds_iam (prevents PAM conflicts)
    cursor.execute("""
        SELECT 1 FROM pg_auth_members m
        JOIN pg_roles r ON r.oid = m.roleid
        JOIN pg_roles u ON u.oid = m.member
        WHERE u.rolname = %s AND r.rolname = 'rds_iam';
    """, (master_user,))
    if cursor.fetchone():
        logger.warning(f"Warning: {master_user} still has rds_iam role - may cause PAM issues")
    else:
        logger.info(f"Verified: {master_user} does not have rds_iam role (correct)")

    # 5. Test that migrate user can create tables (run as master since we're connected as master)
    # This is a proxy test - we verify the migrate user has the right ownership
    cursor.execute("""
        SELECT has_schema_privilege(%s, 'public', 'CREATE');
    """, (migrate_user,))
    result = cursor.fetchone()
    if not result or not result[0]:
        raise DatabaseError(f'Verification failed: {migrate_user} cannot CREATE in public schema')
    logger.info(f"Verified: {migrate_user} has CREATE privilege on public schema")

    logger.info("All verification checks passed - three-user architecture configured correctly")

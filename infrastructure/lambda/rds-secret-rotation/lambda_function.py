"""
RDS PostgreSQL Secret Rotation Lambda
Implements single-user rotation strategy for Secrets Manager.

Based on AWS Secrets Manager rotation template:
https://docs.aws.amazon.com/secretsmanager/latest/userguide/rotating-secrets-lambda-function-overview.html
"""
import boto3
import json
import logging
import os
import re
import psycopg2
from psycopg2 import sql

logger = logging.getLogger()
logger.setLevel(logging.INFO)

# PostgreSQL username pattern: lowercase letter followed by alphanumeric/underscore (max 63 chars)
# Security: Validates username format to prevent injection attacks
USERNAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]{0,62}$')

def lambda_handler(event, context):
    """
    Secrets Manager rotation Lambda handler.

    Args:
        event: Lambda event with SecretId, ClientRequestToken, and Step
        context: Lambda context
    """
    arn = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']

    # Get Secrets Manager client with custom endpoint for Sovereign Cloud
    endpoint_url = os.environ.get('SECRETS_MANAGER_ENDPOINT')
    if endpoint_url:
        service_client = boto3.client('secretsmanager', endpoint_url=endpoint_url)
    else:
        service_client = boto3.client('secretsmanager')

    # Verify secret exists and rotation is enabled
    metadata = service_client.describe_secret(SecretId=arn)
    if not metadata['RotationEnabled']:
        raise ValueError(f"Secret {arn} is not enabled for rotation")

    versions = metadata['VersionIdsToStages']
    if token not in versions:
        raise ValueError(f"Secret version {token} has no stage for rotation")

    if "AWSCURRENT" in versions[token]:
        logger.info(f"Secret version {token} already set as AWSCURRENT")
        return
    elif "AWSPENDING" not in versions[token]:
        raise ValueError(f"Secret version {token} not set as AWSPENDING")

    # Execute the appropriate rotation step
    if step == "createSecret":
        create_secret(service_client, arn, token)
    elif step == "setSecret":
        set_secret(service_client, arn, token)
    elif step == "testSecret":
        test_secret(service_client, arn, token)
    elif step == "finishSecret":
        finish_secret(service_client, arn, token)
    else:
        raise ValueError(f"Invalid step: {step}")


def create_secret(service_client, arn, token):
    """Create a new version of the secret with a new password."""
    # Get current secret
    current_dict = get_secret_dict(service_client, arn, "AWSCURRENT")

    # Generate new password
    passwd = service_client.get_random_password(
        PasswordLength=32,
        ExcludeCharacters='/@"\'\\',
        RequireEachIncludedType=True
    )
    current_dict['password'] = passwd['RandomPassword']

    # Put new secret version
    service_client.put_secret_value(
        SecretId=arn,
        ClientRequestToken=token,
        SecretString=json.dumps(current_dict),
        VersionStages=['AWSPENDING']
    )
    logger.info(f"Created new secret version {token}")


def set_secret(service_client, arn, token):
    """Set the password in the database."""
    # Get pending secret
    pending_dict = get_secret_dict(service_client, arn, "AWSPENDING", token)
    current_dict = get_secret_dict(service_client, arn, "AWSCURRENT")

    # Security: Validate username format to prevent injection
    username = pending_dict['username']
    if not USERNAME_PATTERN.match(username):
        raise ValueError(f"Invalid username format: must match pattern {USERNAME_PATTERN.pattern}")

    # Connect with current credentials and set new password
    conn = get_connection(current_dict)
    try:
        with conn.cursor() as cursor:
            # Security: Use psycopg2.sql for safe identifier quoting
            # Identifiers (usernames) must use sql.Identifier(), not %s placeholder
            cursor.execute(
                sql.SQL("ALTER USER {} WITH PASSWORD %s").format(sql.Identifier(username)),
                (pending_dict['password'],)
            )
            conn.commit()
        logger.info("Successfully set password in database")
    finally:
        conn.close()


def test_secret(service_client, arn, token):
    """Test that the new password works."""
    pending_dict = get_secret_dict(service_client, arn, "AWSPENDING", token)

    # Test connection with new credentials
    conn = get_connection(pending_dict)
    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT 1")
        logger.info("Successfully tested new credentials")
    finally:
        conn.close()


def finish_secret(service_client, arn, token):
    """Finish the rotation by marking the new version as current."""
    metadata = service_client.describe_secret(SecretId=arn)

    # Find current version
    current_version = None
    for version_id, stages in metadata['VersionIdsToStages'].items():
        if "AWSCURRENT" in stages:
            if version_id == token:
                logger.info(f"Version {token} already current")
                return
            current_version = version_id
            break

    # Move AWSCURRENT to new version
    service_client.update_secret_version_stage(
        SecretId=arn,
        VersionStage="AWSCURRENT",
        MoveToVersionId=token,
        RemoveFromVersionId=current_version
    )
    logger.info(f"Successfully rotated secret, new version: {token}")


def get_secret_dict(service_client, arn, stage, token=None):
    """Get secret value as dictionary."""
    kwargs = {'SecretId': arn, 'VersionStage': stage}
    if token:
        kwargs['VersionId'] = token

    response = service_client.get_secret_value(**kwargs)
    return json.loads(response['SecretString'])


def get_connection(secret_dict):
    """Create PostgreSQL connection from secret dictionary."""
    return psycopg2.connect(
        host=secret_dict['host'],
        port=secret_dict.get('port', 5432),
        user=secret_dict['username'],
        password=secret_dict['password'],
        database=secret_dict.get('database', 'postgres'),
        sslmode='require',
        connect_timeout=5
    )

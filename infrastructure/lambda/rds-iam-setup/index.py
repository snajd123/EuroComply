"""
RDS IAM Authentication Setup Lambda

This Lambda function grants the rds_iam role to the database user,
enabling IAM-based authentication (passwordless, most secure).

Runs once per environment during infrastructure setup.
"""

import json
import re
import boto3
import psycopg2
from psycopg2 import sql
import os


# Strict allowlist pattern for database usernames
# Only lowercase letters, numbers, and underscores, must start with letter
USERNAME_PATTERN = re.compile(r'^[a-z][a-z0-9_]{0,62}$')


def handler(event, context):
    """Grant rds_iam role to database user for IAM authentication."""

    secret_arn = os.environ.get('DB_SECRET_ARN')
    if not secret_arn:
        return {
            'statusCode': 400,
            'body': json.dumps({'error': 'DB_SECRET_ARN environment variable not set'})
        }

    # Get database credentials from Secrets Manager
    secrets_client = boto3.client('secretsmanager')

    try:
        secret_response = secrets_client.get_secret_value(SecretId=secret_arn)
        secret = json.loads(secret_response['SecretString'])
    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Failed to get secret: {str(e)}'})
        }

    db_host = secret['host']
    db_port = secret['port']
    db_name = secret['database']
    db_user = secret['username']
    db_pass = secret['password']

    # Validate username against strict allowlist pattern to prevent SQL injection
    if not USERNAME_PATTERN.match(db_user):
        return {
            'statusCode': 400,
            'body': json.dumps({
                'error': f'Invalid username format. Must match pattern: lowercase letters, numbers, underscores only, start with letter, max 63 chars'
            })
        }

    # Connect to the database
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
        conn.close()

        if result:
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'message': f'Successfully granted rds_iam role to {db_user}',
                    'iam_auth_enabled': True
                })
            }
        else:
            return {
                'statusCode': 500,
                'body': json.dumps({
                    'error': 'Failed to verify rds_iam grant'
                })
            }

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({'error': f'Database operation failed: {str(e)}'})
        }

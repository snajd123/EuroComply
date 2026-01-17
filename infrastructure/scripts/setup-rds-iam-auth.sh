#!/bin/bash
# Setup RDS IAM Authentication
# This script grants the rds_iam role to the database user, enabling IAM-based authentication.
#
# SECURITY: This script uses credentials from AWS Secrets Manager and never exposes them.
# Run this ONCE per environment after RDS is created.
#
# Prerequisites:
#   - AWS CLI configured with appropriate credentials
#   - Network access to RDS (run from VPC or via VPN/bastion)
#   - psql client installed
#
# Usage:
#   ./setup-rds-iam-auth.sh <environment>
#   Example: ./setup-rds-iam-auth.sh staging

set -euo pipefail

ENVIRONMENT="${1:-staging}"
PROJECT="eurocomply"
AWS_REGION="${AWS_REGION:-eusc-de-east-1}"

echo "Setting up RDS IAM authentication for $PROJECT-$ENVIRONMENT..."

# Get database credentials from Secrets Manager
SECRET_ARN=$(aws secretsmanager list-secrets \
  --region "$AWS_REGION" \
  --query "SecretList[?Name=='$PROJECT/$ENVIRONMENT/database'].ARN" \
  --output text)

if [ -z "$SECRET_ARN" ]; then
  echo "ERROR: Could not find secret for $PROJECT/$ENVIRONMENT/database"
  exit 1
fi

echo "Retrieving credentials from Secrets Manager..."
SECRET=$(aws secretsmanager get-secret-value \
  --region "$AWS_REGION" \
  --secret-id "$SECRET_ARN" \
  --query 'SecretString' \
  --output text)

DB_HOST=$(echo "$SECRET" | jq -r '.host')
DB_PORT=$(echo "$SECRET" | jq -r '.port')
DB_NAME=$(echo "$SECRET" | jq -r '.database')
DB_USER=$(echo "$SECRET" | jq -r '.username')
DB_PASS=$(echo "$SECRET" | jq -r '.password')

echo "Connecting to $DB_HOST:$DB_PORT/$DB_NAME..."

# Grant rds_iam role to the database user
PGPASSWORD="$DB_PASS" psql \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  -c "GRANT rds_iam TO $DB_USER;"

echo ""
echo "SUCCESS: RDS IAM authentication is now enabled for user '$DB_USER'"
echo ""
echo "The application can now connect to RDS using IAM tokens instead of passwords."
echo "No password is stored anywhere - tokens are generated on-demand and expire after 15 minutes."

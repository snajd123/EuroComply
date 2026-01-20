#!/bin/bash
# =============================================================================
# Prisma Studio for Staging Database
# =============================================================================
# Securely connects to the staging RDS database through SSH tunnel
# and launches Prisma Studio for visual database exploration.
#
# Prerequisites:
# - AWS CLI v2 installed
# - AWS credentials configured with access to staging
# - jq installed for JSON parsing
# - SSH client
#
# Usage:
#   ./scripts/db-studio.sh [environment]
#
# Examples:
#   ./scripts/db-studio.sh          # Defaults to staging
#   ./scripts/db-studio.sh staging
# =============================================================================

set -e

# Configuration
ENVIRONMENT="${1:-staging}"
PROJECT="eurocomply"
REGION="eusc-de-east-1"
LOCAL_PORT=15432
STUDIO_PORT=5555
SSH_KEY_FILE="/tmp/bastion-key-$$"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

cleanup() {
    log_info "Cleaning up..."
    if [ -n "$SSH_PID" ] && kill -0 "$SSH_PID" 2>/dev/null; then
        kill "$SSH_PID" 2>/dev/null || true
    fi
    if [ -n "$STUDIO_PID" ] && kill -0 "$STUDIO_PID" 2>/dev/null; then
        kill "$STUDIO_PID" 2>/dev/null || true
    fi
    # Securely remove SSH key
    if [ -f "$SSH_KEY_FILE" ]; then
        rm -f "$SSH_KEY_FILE"
    fi
    log_info "Cleanup complete"
}

trap cleanup EXIT

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v aws &> /dev/null; then
        log_error "AWS CLI not found. Please install it: https://aws.amazon.com/cli/"
        exit 1
    fi

    if ! command -v ssh &> /dev/null; then
        log_error "SSH client not found."
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_error "jq not found. Please install it: brew install jq (Mac) or apt install jq (Linux)"
        exit 1
    fi

    log_success "All prerequisites met"
}

# Get Terraform outputs
get_terraform_outputs() {
    log_info "Getting infrastructure details from Terraform..."

    TERRAFORM_DIR="infrastructure/terraform/environments/${ENVIRONMENT}"

    if [ ! -d "$TERRAFORM_DIR" ]; then
        log_error "Terraform directory not found: $TERRAFORM_DIR"
        exit 1
    fi

    cd "$TERRAFORM_DIR"

    # Get outputs
    BASTION_IP=$(terraform output -raw bastion_public_ip 2>/dev/null || echo "")
    RDS_ENDPOINT=$(terraform output -raw rds_endpoint 2>/dev/null || echo "")
    SSH_KEY_SECRET_ARN=$(terraform output -raw bastion_ssh_key_secret_arn 2>/dev/null || echo "")
    DB_SECRET_ARN=$(terraform output -raw db_credentials_secret_arn 2>/dev/null || echo "")

    cd - > /dev/null

    if [ -z "$BASTION_IP" ]; then
        log_error "Bastion public IP not found. Have you deployed the bastion module?"
        exit 1
    fi

    if [ -z "$RDS_ENDPOINT" ]; then
        log_error "RDS endpoint not found in Terraform outputs"
        exit 1
    fi

    if [ -z "$SSH_KEY_SECRET_ARN" ]; then
        log_error "SSH key secret ARN not found in Terraform outputs"
        exit 1
    fi

    log_success "Got infrastructure details"
    log_info "  Bastion IP: $BASTION_IP"
    log_info "  RDS: $RDS_ENDPOINT"
}

# Get SSH key from Secrets Manager
get_ssh_key() {
    log_info "Fetching SSH key from Secrets Manager..."

    SSH_KEY=$(aws secretsmanager get-secret-value \
        --secret-id "$SSH_KEY_SECRET_ARN" \
        --region "$REGION" \
        --endpoint-url "https://secretsmanager.${REGION}.amazonaws.eu" \
        --query 'SecretString' \
        --output text 2>/dev/null || echo "")

    if [ -z "$SSH_KEY" ]; then
        log_error "Could not fetch SSH key from Secrets Manager"
        exit 1
    fi

    # Write key to temp file with secure permissions
    echo "$SSH_KEY" > "$SSH_KEY_FILE"
    chmod 600 "$SSH_KEY_FILE"

    log_success "Got SSH key"
}

# Get database credentials from Secrets Manager
get_db_credentials() {
    log_info "Fetching database credentials from Secrets Manager..."

    # Use the migrate user credentials (has full access for viewing)
    SECRET_ID="${PROJECT}/${ENVIRONMENT}/database-migrate"

    CREDENTIALS=$(aws secretsmanager get-secret-value \
        --secret-id "$SECRET_ID" \
        --region "$REGION" \
        --endpoint-url "https://secretsmanager.${REGION}.amazonaws.eu" \
        --query 'SecretString' \
        --output text 2>/dev/null || echo "")

    if [ -z "$CREDENTIALS" ]; then
        log_error "Could not fetch credentials from Secrets Manager"
        log_info "Make sure you have access to: $SECRET_ID"
        exit 1
    fi

    DB_USER=$(echo "$CREDENTIALS" | jq -r '.username')
    DB_PASS=$(echo "$CREDENTIALS" | jq -r '.password')
    DB_NAME=$(echo "$CREDENTIALS" | jq -r '.dbname // "eurocomply"')

    log_success "Got database credentials"
}

# Start SSH tunnel
start_ssh_tunnel() {
    log_info "Starting SSH tunnel..."
    log_info "  Local port: $LOCAL_PORT -> RDS: $RDS_ENDPOINT:5432"

    # Extract just the hostname from the endpoint
    RDS_HOST=$(echo "$RDS_ENDPOINT" | cut -d: -f1)

    # Start SSH tunnel in background
    ssh -i "$SSH_KEY_FILE" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        -o LogLevel=ERROR \
        -N \
        -L "$LOCAL_PORT:$RDS_HOST:5432" \
        "ec2-user@$BASTION_IP" &

    SSH_PID=$!

    # Wait for tunnel to establish
    log_info "Waiting for tunnel to establish..."
    for i in {1..30}; do
        if nc -z localhost $LOCAL_PORT 2>/dev/null; then
            log_success "SSH tunnel established"
            return 0
        fi
        sleep 1
    done

    log_error "Timeout waiting for SSH tunnel"
    exit 1
}

# Start Prisma Studio
start_prisma_studio() {
    log_info "Starting Prisma Studio..."

    # Build the DATABASE_URL
    export DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@localhost:${LOCAL_PORT}/${DB_NAME}?sslmode=require"

    # Change to project root
    cd "$(dirname "$0")/.."

    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  Prisma Studio is starting...${NC}"
    echo -e "${GREEN}  Open: http://localhost:${STUDIO_PORT}${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop${NC}"
    echo ""

    # Run Prisma Studio
    npx prisma studio --port $STUDIO_PORT --browser none
}

# Main
main() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║  EuroComply Database Studio                ║${NC}"
    echo -e "${BLUE}║  Environment: ${ENVIRONMENT}                         ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════╝${NC}"
    echo ""

    check_prerequisites
    get_terraform_outputs
    get_ssh_key
    get_db_credentials
    start_ssh_tunnel
    start_prisma_studio
}

main

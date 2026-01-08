#!/bin/bash
set -e

# EuroComply AWS Deployment Script
# Usage: ./deploy.sh [staging|production]

ENVIRONMENT=${1:-production}
REGION=${AWS_REGION:-eu-central-1}
STACK_NAME="eurocomply-${ENVIRONMENT}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}EuroComply AWS Deployment${NC}"
echo -e "${GREEN}Environment: ${ENVIRONMENT}${NC}"
echo -e "${GREEN}Region: ${REGION}${NC}"
echo -e "${GREEN}========================================${NC}"

# Check for required tools
check_requirements() {
    echo -e "\n${YELLOW}Checking requirements...${NC}"

    if ! command -v aws &> /dev/null; then
        echo -e "${RED}AWS CLI not found. Please install: https://aws.amazon.com/cli/${NC}"
        exit 1
    fi

    if ! command -v docker &> /dev/null; then
        echo -e "${RED}Docker not found. Please install Docker${NC}"
        exit 1
    fi

    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        echo -e "${RED}AWS credentials not configured. Run 'aws configure'${NC}"
        exit 1
    fi

    echo -e "${GREEN}All requirements met!${NC}"
}

# Deploy CloudFormation stack
deploy_infrastructure() {
    echo -e "\n${YELLOW}Deploying infrastructure...${NC}"

    # Check if secrets are provided
    if [ -z "$DB_PASSWORD" ]; then
        echo -e "${RED}DB_PASSWORD environment variable required${NC}"
        echo "Export it: export DB_PASSWORD='your-secure-password'"
        exit 1
    fi

    if [ -z "$JWT_SECRET" ]; then
        echo -e "${RED}JWT_SECRET environment variable required${NC}"
        echo "Export it: export JWT_SECRET='your-32-char-min-secret'"
        exit 1
    fi

    aws cloudformation deploy \
        --template-file ../cloudformation/main.yaml \
        --stack-name $STACK_NAME \
        --parameter-overrides \
            Environment=$ENVIRONMENT \
            DBPassword=$DB_PASSWORD \
            JWTSecret=$JWT_SECRET \
        --capabilities CAPABILITY_NAMED_IAM \
        --region $REGION \
        --no-fail-on-empty-changeset

    echo -e "${GREEN}Infrastructure deployed successfully!${NC}"
}

# Get stack outputs
get_outputs() {
    echo -e "\n${YELLOW}Getting stack outputs...${NC}"

    ECR_URI=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --query "Stacks[0].Outputs[?OutputKey=='ECRRepositoryUri'].OutputValue" \
        --output text \
        --region $REGION)

    ALB_DNS=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --query "Stacks[0].Outputs[?OutputKey=='ALBDNSName'].OutputValue" \
        --output text \
        --region $REGION)

    ECS_CLUSTER=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --query "Stacks[0].Outputs[?OutputKey=='ECSClusterName'].OutputValue" \
        --output text \
        --region $REGION)

    ECS_SERVICE=$(aws cloudformation describe-stacks \
        --stack-name $STACK_NAME \
        --query "Stacks[0].Outputs[?OutputKey=='ECSServiceName'].OutputValue" \
        --output text \
        --region $REGION)

    echo -e "${GREEN}ECR Repository: ${ECR_URI}${NC}"
    echo -e "${GREEN}ALB DNS: ${ALB_DNS}${NC}"
    echo -e "${GREEN}ECS Cluster: ${ECS_CLUSTER}${NC}"
    echo -e "${GREEN}ECS Service: ${ECS_SERVICE}${NC}"
}

# Build and push Docker image
build_and_push() {
    echo -e "\n${YELLOW}Building and pushing Docker image...${NC}"

    AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

    # Login to ECR
    aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

    # Build image
    cd ../../../
    docker build -f docker/Dockerfile -t eurocomply-api:latest .

    # Tag and push
    docker tag eurocomply-api:latest ${ECR_URI}:latest
    docker tag eurocomply-api:latest ${ECR_URI}:$(git rev-parse --short HEAD)

    docker push ${ECR_URI}:latest
    docker push ${ECR_URI}:$(git rev-parse --short HEAD)

    echo -e "${GREEN}Docker image pushed successfully!${NC}"
}

# Update ECS service
update_service() {
    echo -e "\n${YELLOW}Updating ECS service...${NC}"

    aws ecs update-service \
        --cluster $ECS_CLUSTER \
        --service $ECS_SERVICE \
        --force-new-deployment \
        --region $REGION

    echo -e "${GREEN}ECS service update initiated!${NC}"
    echo -e "${YELLOW}Waiting for deployment to complete...${NC}"

    aws ecs wait services-stable \
        --cluster $ECS_CLUSTER \
        --services $ECS_SERVICE \
        --region $REGION

    echo -e "${GREEN}Deployment complete!${NC}"
}

# Run database migrations
run_migrations() {
    echo -e "\n${YELLOW}Running database migrations...${NC}"

    # Get task ARN from running service
    TASK_ARN=$(aws ecs list-tasks \
        --cluster $ECS_CLUSTER \
        --service-name $ECS_SERVICE \
        --query 'taskArns[0]' \
        --output text \
        --region $REGION)

    if [ "$TASK_ARN" != "None" ] && [ -n "$TASK_ARN" ]; then
        echo -e "${GREEN}Running migrations via ECS Exec...${NC}"
        aws ecs execute-command \
            --cluster $ECS_CLUSTER \
            --task $TASK_ARN \
            --container api \
            --interactive \
            --command "npx prisma migrate deploy" \
            --region $REGION
    else
        echo -e "${YELLOW}No running tasks found. Migrations will run on container start.${NC}"
    fi
}

# Main deployment flow
main() {
    check_requirements
    deploy_infrastructure
    get_outputs
    build_and_push
    update_service

    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}Deployment Complete!${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo -e "\nAPI URL: http://${ALB_DNS}"
    echo -e "\n${YELLOW}Next steps:${NC}"
    echo -e "1. Configure your domain DNS to point to: ${ALB_DNS}"
    echo -e "2. Create an ACM certificate for HTTPS"
    echo -e "3. Update the CloudFormation stack with the certificate ARN"
    echo -e "4. Run database migrations if needed"
}

# Handle script arguments
case "$1" in
    --infrastructure-only)
        check_requirements
        deploy_infrastructure
        get_outputs
        ;;
    --deploy-only)
        check_requirements
        get_outputs
        build_and_push
        update_service
        ;;
    --migrate)
        check_requirements
        get_outputs
        run_migrations
        ;;
    *)
        main
        ;;
esac

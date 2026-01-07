# EuroComply AWS Infrastructure Setup

This guide walks you through deploying EuroComply to AWS using Terraform.

## Prerequisites

1. **AWS Account** with admin access
2. **AWS CLI** installed and configured
3. **Terraform** v1.5+ installed
4. **Docker** installed (for building images)

### Install Prerequisites

```bash
# macOS
brew install awscli terraform docker

# Ubuntu/Debian
sudo apt update
sudo apt install awscli terraform docker.io

# Verify installations
aws --version
terraform --version
docker --version
```

---

## Step 1: Configure AWS Credentials

```bash
# Configure AWS CLI with your credentials
aws configure

# Enter:
# - AWS Access Key ID
# - AWS Secret Access Key
# - Default region: eu-central-1
# - Default output format: json

# Verify configuration
aws sts get-caller-identity
```

---

## Step 2: Create Terraform State Bucket (Optional but Recommended)

For production, store Terraform state in S3:

```bash
# Create S3 bucket for state
aws s3 mb s3://eurocomply-terraform-state --region eu-central-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket eurocomply-terraform-state \
  --versioning-configuration Status=Enabled

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name eurocomply-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region eu-central-1
```

Then uncomment the backend configuration in `terraform/main.tf`.

---

## Step 3: Configure Variables

```bash
cd infrastructure/terraform

# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit with your settings
nano terraform.tfvars
```

**Minimum changes required:**
```hcl
domain_name = "your-domain.com"
environment = "production"  # or "dev" for testing
```

---

## Step 4: Initialize Terraform

```bash
terraform init
```

Expected output:
```
Terraform has been successfully initialized!
```

---

## Step 5: Review the Plan

```bash
terraform plan
```

This shows all resources that will be created:
- VPC with public/private subnets
- RDS PostgreSQL (Multi-AZ)
- ElastiCache Redis cluster
- ECS Fargate cluster
- Application Load Balancer
- S3 buckets
- Secrets Manager secrets
- IAM roles and policies

---

## Step 6: Deploy Infrastructure

```bash
terraform apply
```

Type `yes` when prompted.

**This takes 15-20 minutes** (RDS and ElastiCache are slow to provision).

---

## Step 7: Build and Push Docker Image

After infrastructure is deployed:

```bash
# Get ECR repository URL from outputs
ECR_URL=$(terraform output -raw ecr_repository_url)

# Login to ECR
aws ecr get-login-password --region eu-central-1 | \
  docker login --username AWS --password-stdin $ECR_URL

# Go to project root
cd ../..

# Build the API image
docker build -t eurocomply-api -f docker/Dockerfile .

# Tag for ECR
docker tag eurocomply-api:latest $ECR_URL:latest

# Push to ECR
docker push $ECR_URL:latest
```

---

## Step 8: Run Database Migrations

```bash
# Get database connection string from Secrets Manager
DB_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id eurocomply-production/database \
  --query SecretString --output text | jq -r .connection_string)

# Run Prisma migrations (from project root)
DATABASE_URL=$DB_SECRET npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

---

## Step 9: Deploy ECS Service

Force a new deployment to pull the latest image:

```bash
cd infrastructure/terraform

# Get cluster and service names
CLUSTER=$(terraform output -raw ecs_cluster_name)
SERVICE=$(terraform output -raw ecs_service_name)

# Force new deployment
aws ecs update-service \
  --cluster $CLUSTER \
  --service $SERVICE \
  --force-new-deployment
```

---

## Step 10: Configure DNS (Optional)

If you have a domain:

1. Get the ALB DNS name:
   ```bash
   terraform output alb_dns_name
   ```

2. In your DNS provider, create a CNAME record:
   ```
   api.yourdomain.com -> [ALB DNS name]
   ```

3. Validate SSL certificate in AWS Console (ACM) or via Route53.

---

## Step 11: Verify Deployment

```bash
# Get API URL
API_URL=$(terraform output -raw api_url)

# Health check
curl $API_URL/health

# Expected response:
# {"status":"ok","timestamp":"..."}
```

---

## Useful Commands

### View Outputs
```bash
terraform output
```

### View Logs
```bash
# Get log group name
LOG_GROUP="/eurocomply/production/api"

# Tail logs
aws logs tail $LOG_GROUP --follow
```

### Scale ECS Service
```bash
aws ecs update-service \
  --cluster eurocomply-production-cluster \
  --service eurocomply-production-api \
  --desired-count 4
```

### Connect to Database
```bash
# Get secret
aws secretsmanager get-secret-value \
  --secret-id eurocomply-production/database \
  --query SecretString --output text | jq .
```

### Destroy Infrastructure
```bash
# WARNING: This deletes everything!
terraform destroy
```

---

## Cost Management

### Estimated Monthly Costs

| Environment | Configuration | Cost |
|-------------|---------------|------|
| **Dev** | db.t3.micro, 1 ECS task | ~$60 |
| **Staging** | db.t3.small, 2 ECS tasks | ~$120 |
| **Production** | db.t3.medium, Multi-AZ, 2+ tasks | ~$290 |

### Cost Saving Tips

1. **Dev environment**: Set `db_multi_az = false` and `redis_num_cache_nodes = 1`
2. **Use Fargate Spot** for non-critical workloads
3. **Reserved Instances** for predictable production workloads (up to 60% savings)

---

## Security Checklist

After deployment, verify:

- [ ] All resources in eu-central-1 (Frankfurt)
- [ ] RDS encryption enabled
- [ ] ElastiCache encryption enabled
- [ ] S3 buckets not public
- [ ] Security groups restrict access
- [ ] Secrets in Secrets Manager (not env vars)
- [ ] CloudWatch logs enabled
- [ ] SSL certificate active

---

## Troubleshooting

### ECS Tasks Not Starting

1. Check CloudWatch logs:
   ```bash
   aws logs tail /eurocomply/production/api --since 1h
   ```

2. Check task status:
   ```bash
   aws ecs describe-tasks \
     --cluster eurocomply-production-cluster \
     --tasks $(aws ecs list-tasks --cluster eurocomply-production-cluster --query 'taskArns[0]' --output text)
   ```

### Database Connection Issues

1. Verify security group allows ECS access
2. Check secret is properly formatted
3. Ensure VPC networking is correct

### SSL Certificate Pending

1. Go to AWS Certificate Manager
2. Click on the certificate
3. Follow DNS validation instructions

---

## Support

- **Infrastructure Issues**: Check AWS CloudWatch logs and metrics
- **Application Issues**: See `/eurocomply/production/api` log group
- **Cost Questions**: Use AWS Cost Explorer

---

**Last Updated**: 2026-01-07

# EuroComply AWS Deployment Guide

This guide covers deploying EuroComply's backend API to AWS using ECS Fargate in the `eu-central-1` (Frankfurt) region for GDPR compliance.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS eu-central-1 (Frankfurt)                     │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                              VPC                                  │   │
│  │                                                                   │   │
│  │  ┌─────────────────────┐    ┌─────────────────────┐              │   │
│  │  │   Public Subnet 1   │    │   Public Subnet 2   │              │   │
│  │  │                     │    │                     │              │   │
│  │  │  ┌─────────────┐   │    │                     │              │   │
│  │  │  │ NAT Gateway │   │    │                     │              │   │
│  │  │  └─────────────┘   │    │                     │              │   │
│  │  └─────────────────────┘    └─────────────────────┘              │   │
│  │            │                           │                          │   │
│  │            ▼                           ▼                          │   │
│  │  ┌───────────────────────────────────────────────────────┐       │   │
│  │  │            Application Load Balancer (ALB)            │       │   │
│  │  └───────────────────────────────────────────────────────┘       │   │
│  │                            │                                      │   │
│  │  ┌─────────────────────┐  │  ┌─────────────────────┐             │   │
│  │  │   Private Subnet 1  │  │  │   Private Subnet 2  │             │   │
│  │  │                     │  │  │                     │             │   │
│  │  │  ┌───────────────┐ │  │  │ ┌───────────────┐   │             │   │
│  │  │  │ ECS Fargate   │◄┼──┼──┼►│ ECS Fargate   │   │             │   │
│  │  │  │ (API Task)    │ │     │ │ (API Task)    │   │             │   │
│  │  │  └───────────────┘ │     │ └───────────────┘   │             │   │
│  │  │         │          │     │        │            │             │   │
│  │  │         ▼          │     │        ▼            │             │   │
│  │  │  ┌─────────────┐   │     │ ┌─────────────┐     │             │   │
│  │  │  │    RDS      │   │     │ │  ElastiCache│     │             │   │
│  │  │  │ PostgreSQL  │   │     │ │    Redis    │     │             │   │
│  │  │  │  (Multi-AZ) │   │     │ │             │     │             │   │
│  │  │  └─────────────┘   │     │ └─────────────┘     │             │   │
│  │  └─────────────────────┘     └─────────────────────┘             │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │     ECR      │  │  CloudWatch  │  │   Secrets    │                   │
│  │  Repository  │  │     Logs     │  │   Manager    │                   │
│  └──────────────┘  └──────────────┘  └──────────────┘                   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Prerequisites

1. **AWS Account** with appropriate IAM permissions
2. **AWS CLI** installed and configured
3. **Docker** installed locally
4. **Domain name** for API (e.g., `api.eurocomply.eu`)

### Required IAM Permissions

The deploying user/role needs these permissions:
- `cloudformation:*`
- `ec2:*`
- `ecs:*`
- `ecr:*`
- `rds:*`
- `elasticache:*`
- `elasticloadbalancing:*`
- `iam:*`
- `logs:*`
- `secretsmanager:*`
- `autoscaling:*`

## Quick Start

### 1. Set Environment Variables

```bash
# Required secrets (use strong passwords!)
export DB_PASSWORD="your-secure-database-password-here"
export JWT_SECRET="your-32-character-minimum-jwt-secret-key"

# AWS Configuration
export AWS_REGION="eu-central-1"
export AWS_PROFILE="your-aws-profile"  # or configure via aws configure
```

### 2. Deploy Infrastructure

```bash
cd infrastructure/aws/scripts
chmod +x deploy.sh
./deploy.sh production
```

This will:
1. Create VPC with public/private subnets
2. Set up RDS PostgreSQL (Multi-AZ)
3. Create ElastiCache Redis cluster
4. Configure ECS Fargate cluster
5. Set up Application Load Balancer
6. Build and push Docker image
7. Deploy the API service

### 3. Configure DNS

After deployment, point your domain to the ALB:
1. Get the ALB DNS name from the deployment output
2. Create a CNAME record: `api.eurocomply.eu -> [ALB DNS]`

### 4. Enable HTTPS

1. Request an ACM certificate:
```bash
aws acm request-certificate \
  --domain-name api.eurocomply.eu \
  --validation-method DNS \
  --region eu-central-1
```

2. Add DNS validation record
3. Update CloudFormation with certificate ARN

## Deployment Commands

### Full Deployment
```bash
./deploy.sh production
```

### Infrastructure Only (no Docker build)
```bash
./deploy.sh --infrastructure-only
```

### Deploy Code Only (skip infrastructure)
```bash
./deploy.sh --deploy-only
```

### Run Database Migrations
```bash
./deploy.sh --migrate
```

## GitHub Actions CI/CD

The repository includes automated deployment via GitHub Actions.

### Setup GitHub Secrets

Add these secrets to your GitHub repository:
- `AWS_ACCESS_KEY_ID` - IAM user access key
- `AWS_SECRET_ACCESS_KEY` - IAM user secret key

### Trigger Deployment

Deployment triggers automatically on:
- Push to `main` branch (changes in `apps/api/`, `packages/`, `docker/`)
- Manual trigger via Actions tab

## Infrastructure Details

### Compute: ECS Fargate

| Setting | Production | Staging |
|---------|------------|---------|
| CPU | 512 units | 256 units |
| Memory | 1024 MB | 512 MB |
| Min Tasks | 2 | 1 |
| Max Tasks | 10 | 3 |
| Auto-scaling | 70% CPU | 70% CPU |

### Database: RDS PostgreSQL 16

| Setting | Value |
|---------|-------|
| Instance | db.t3.medium |
| Storage | 20-100 GB (auto-scaling) |
| Multi-AZ | Yes |
| Encryption | Yes (AES-256) |
| Backup | 7 days retention |

### Cache: ElastiCache Redis 7

| Setting | Value |
|---------|-------|
| Node Type | cache.t3.micro |
| Nodes | 1 |
| Engine | Redis 7.0 |

### Networking

- **VPC CIDR**: 10.0.0.0/16
- **Public Subnets**: 10.0.1.0/24, 10.0.2.0/24
- **Private Subnets**: 10.0.10.0/24, 10.0.11.0/24
- **NAT Gateway**: Single (cost optimization)

## Cost Estimation (Monthly)

| Resource | Estimated Cost |
|----------|---------------|
| ECS Fargate (2 tasks) | ~$30 |
| RDS db.t3.medium (Multi-AZ) | ~$60 |
| ElastiCache t3.micro | ~$15 |
| ALB | ~$20 |
| NAT Gateway | ~$35 |
| Data Transfer | ~$10 |
| **Total** | **~$170/month** |

*Costs are approximate and may vary based on usage*

## Monitoring & Logging

### CloudWatch Logs

All container logs are sent to CloudWatch Logs:
- Log Group: `/ecs/eurocomply-production`
- Retention: 30 days

View logs:
```bash
aws logs tail /ecs/eurocomply-production --follow
```

### Health Checks

- **ALB Health Check**: `GET /health`
- **Container Health Check**: Every 30s
- **Auto-recovery**: Unhealthy tasks replaced automatically

### Metrics

CloudWatch Container Insights provides:
- CPU/Memory utilization
- Network I/O
- Task count
- Error rates

## Security

### Network Security

- API runs in private subnets (no public IP)
- Database only accessible from ECS tasks
- Redis only accessible from ECS tasks
- ALB handles SSL termination

### Data Security

- RDS encryption at rest (AES-256)
- Secrets stored in AWS Secrets Manager
- IAM roles with least privilege

### Compliance

- **Region**: eu-central-1 (Frankfurt) for GDPR
- **Data residency**: All data stays in EU
- **Deletion protection**: Enabled on RDS

## Troubleshooting

### View Running Tasks
```bash
aws ecs list-tasks --cluster eurocomply-production
```

### View Task Logs
```bash
aws ecs describe-tasks --cluster eurocomply-production --tasks <task-id>
```

### Connect to Container
```bash
aws ecs execute-command \
  --cluster eurocomply-production \
  --task <task-id> \
  --container api \
  --interactive \
  --command "/bin/sh"
```

### Force New Deployment
```bash
aws ecs update-service \
  --cluster eurocomply-production \
  --service eurocomply-production-api \
  --force-new-deployment
```

### Check Database Connection
```bash
# From ECS task
aws ecs execute-command \
  --cluster eurocomply-production \
  --task <task-id> \
  --container api \
  --interactive \
  --command "npx prisma db push --skip-generate"
```

## Scaling

### Manual Scaling
```bash
aws ecs update-service \
  --cluster eurocomply-production \
  --service eurocomply-production-api \
  --desired-count 5
```

### Auto-scaling Configuration

The service auto-scales based on CPU utilization:
- Scale out: > 70% CPU for 1 minute
- Scale in: < 70% CPU for 5 minutes
- Min: 2 tasks, Max: 10 tasks

## Backup & Recovery

### RDS Backups

- Automated backups: Daily at 03:00 UTC
- Retention: 7 days
- Point-in-time recovery: Enabled

### Restore from Backup
```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier eurocomply-production \
  --target-db-instance-identifier eurocomply-production-restored \
  --restore-time 2024-01-15T10:00:00Z
```

## Updating the Stack

To update infrastructure:
```bash
aws cloudformation update-stack \
  --stack-name eurocomply-production \
  --template-body file://cloudformation/main.yaml \
  --parameters ParameterKey=Environment,ParameterValue=production \
               ParameterKey=DBPassword,ParameterValue=$DB_PASSWORD \
               ParameterKey=JWTSecret,ParameterValue=$JWT_SECRET \
  --capabilities CAPABILITY_NAMED_IAM
```

## Deleting the Stack

⚠️ **Warning**: This will delete all resources including the database!

```bash
# First, disable deletion protection on RDS
aws rds modify-db-instance \
  --db-instance-identifier eurocomply-production \
  --no-deletion-protection

# Then delete the stack
aws cloudformation delete-stack --stack-name eurocomply-production
```

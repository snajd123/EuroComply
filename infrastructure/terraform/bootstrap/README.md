# Terraform Bootstrap

This directory contains the bootstrap configuration for setting up Terraform state management infrastructure.

## Purpose

Before deploying the main infrastructure (production, staging), you need:
- An S3 bucket to store Terraform state files
- A DynamoDB table for state locking
- A KMS key for state encryption
- An IAM role for CI/CD operations

This bootstrap configuration creates these resources.

## Usage

### First-Time Setup

```bash
cd infrastructure/terraform/bootstrap

# Initialize Terraform (uses local state)
terraform init

# Review the plan
terraform plan

# Apply the configuration
terraform apply
```

### After Bootstrap

The output will show the backend configuration to use in environment configurations:

```hcl
terraform {
  backend "s3" {
    bucket         = "eurocomply-terraform-state"
    key            = "production/terraform.tfstate"  # or staging/terraform.tfstate
    region         = "eu-central-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}
```

### CI/CD Setup

1. Update the `aws_iam_role.terraform_ci` assume role policy with your actual GitHub organization and repository name
2. Configure GitHub Actions (or your CI/CD provider) to use OIDC authentication with the created role

## Resources Created

| Resource | Purpose |
|----------|---------|
| `aws_s3_bucket.terraform_state` | Stores Terraform state files with versioning |
| `aws_dynamodb_table.terraform_locks` | Prevents concurrent state modifications |
| `aws_kms_key.terraform` | Encrypts state files at rest |
| `aws_iam_role.terraform_ci` | IAM role for CI/CD pipeline |

## State Management

The bootstrap configuration itself uses **local state** stored in `terraform.tfstate`. This is intentional:
- Bootstrap must be able to run before remote state exists
- The bootstrap state is small and rarely changes
- Consider checking the local state into version control (encrypted) or storing in a secure location

## Customization

Override defaults via `terraform.tfvars`:

```hcl
aws_region        = "eu-west-1"
project_name      = "myproject"
state_bucket_name = "myproject-terraform-state"
lock_table_name   = "myproject-terraform-locks"
```

## Security Considerations

- S3 bucket has public access blocked
- Versioning enabled for state recovery
- KMS encryption for data at rest
- DynamoDB PITR enabled for lock table recovery

## Outputs

| Output | Description |
|--------|-------------|
| `state_bucket_name` | S3 bucket name for use in backend config |
| `lock_table_name` | DynamoDB table name for use in backend config |
| `kms_key_arn` | KMS key ARN for additional encryption needs |
| `ci_role_arn` | IAM role ARN for CI/CD configuration |
| `backend_config` | Ready-to-use backend configuration block |

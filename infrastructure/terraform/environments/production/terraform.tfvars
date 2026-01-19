# Production Environment Configuration
# AWS European Sovereign Cloud (eusc-de-east-1)

project     = "eurocomply"
environment = "production"
aws_region  = "eusc-de-east-1"

# VPC (different CIDR from staging for potential peering)
vpc_cidr = "10.1.0.0/16"
az_count = 3 # More AZs for production HA

# Application
app_port = 3000

# SSL/TLS Certificate (api.eurocomply.eu)
# REQUIRED: Set via CI/CD secrets or update with actual certificate ARN
# certificate_arn = "arn:aws-eusc:acm:eusc-de-east-1:ACCOUNT_ID:certificate/CERTIFICATE_ID"

# Database (Production-grade Graviton instances)
db_instance_class       = "db.t4g.medium"
db_allocated_storage    = 100
backup_retention_period = 30

# Secret Rotation
enable_secret_rotation = true
secret_rotation_days   = 30

# Redis (Production-grade Graviton instances)
redis_node_type = "cache.t4g.medium"

# ECS (Production-grade with HA)
ecs_cpu           = 512
ecs_memory        = 1024
ecs_desired_count = 2

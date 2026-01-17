# Staging Environment Configuration
# AWS European Sovereign Cloud (eusc-de-east-1)

project     = "eurocomply"
environment = "staging"
aws_region  = "eusc-de-east-1"

# VPC
vpc_cidr = "10.0.0.0/16"
az_count = 2

# Application
app_port = 3000

# SSL/TLS Certificate (api-staging.eurocomply.eu)
certificate_arn = "arn:aws-eusc:acm:eusc-de-east-1:075285241396:certificate/92857e1c-c830-40ac-8558-54c3f3d99d57"

# Database (Graviton instances for Sovereign Cloud)
db_instance_class    = "db.t4g.micro"
db_allocated_storage = 20

# Redis (Graviton instances for Sovereign Cloud)
redis_node_type = "cache.t4g.micro"

# ECS (small for staging)
ecs_cpu           = 256
ecs_memory        = 512
ecs_desired_count = 1

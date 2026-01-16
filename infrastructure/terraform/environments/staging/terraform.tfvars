# Staging Environment Configuration

project     = "eurocomply"
environment = "staging"
aws_region  = "eu-west-1"

# VPC
vpc_cidr = "10.0.0.0/16"
az_count = 2

# Application
app_port = 3000

# Database (small for staging)
db_instance_class    = "db.t3.micro"
db_allocated_storage = 20

# Redis (small for staging)
redis_node_type = "cache.t3.micro"

# ECS (small for staging)
ecs_cpu           = 256
ecs_memory        = 512
ecs_desired_count = 1

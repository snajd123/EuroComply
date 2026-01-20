output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

output "alb_dns_name" {
  description = "ALB DNS name (use this to access the API)"
  value       = module.alb.alb_dns_name
}

output "api_url" {
  description = "API URL (ALB direct)"
  value       = "http://${module.alb.alb_dns_name}"
}

output "api_url_https" {
  description = "API URL (HTTPS via custom domain)"
  value       = "https://api-staging.eurocomply.eu"
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECS service name"
  value       = module.ecs.service_name
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = module.rds.db_instance_address
}

output "redis_endpoint" {
  description = "Redis endpoint"
  value       = module.elasticache.redis_endpoint
}

output "db_credentials_secret_arn" {
  description = "ARN of DB credentials secret"
  value       = module.rds.db_credentials_secret_arn
}

output "cloudwatch_log_group" {
  description = "CloudWatch log group for ECS"
  value       = module.ecs.log_group_name
}

output "waltid_core_endpoint" {
  description = "Internal walt.id Core API endpoint"
  value       = module.waltid.core_api_endpoint
}

output "waltid_dns_namespace" {
  description = "walt.id service discovery namespace"
  value       = module.waltid.dns_namespace_name
}

# Migration task outputs
output "migration_task_definition_arn" {
  description = "ARN of the migration task definition for CI/CD"
  value       = module.ecs.migration_task_definition_arn
}

output "private_subnet_ids" {
  description = "Private subnet IDs for running migration tasks"
  value       = module.vpc.private_subnet_ids
}

output "ecs_security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = module.security_groups.ecs_security_group_id
}

output "bastion_instance_id" {
  description = "Bastion instance ID for SSM connections"
  value       = module.bastion.instance_id
}

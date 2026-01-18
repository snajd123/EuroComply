# walt.id Module Outputs

output "service_name" {
  value       = aws_ecs_service.waltid.name
  description = "ECS service name for walt.id"
}

output "task_definition_arn" {
  value       = aws_ecs_task_definition.waltid.arn
  description = "Task definition ARN for walt.id"
}

output "core_api_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7000"
  description = "Internal endpoint for walt.id Core API (DID operations)"
}

output "signatory_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7001"
  description = "Internal endpoint for walt.id Signatory (VC signing)"
}

output "custodian_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7002"
  description = "Internal endpoint for walt.id Custodian (key management)"
}

output "auditor_endpoint" {
  value       = "http://waltid.${var.environment}.eurocomply.internal:7003"
  description = "Internal endpoint for walt.id Auditor (VC verification)"
}

output "dns_namespace_id" {
  value       = aws_service_discovery_private_dns_namespace.main.id
  description = "Service discovery namespace ID"
}

output "dns_namespace_name" {
  value       = aws_service_discovery_private_dns_namespace.main.name
  description = "Service discovery namespace name"
}

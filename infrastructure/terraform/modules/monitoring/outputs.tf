# EuroComply Monitoring Module - Outputs

output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.scaling.dashboard_name
}

output "dashboard_url" {
  description = "URL to access the CloudWatch dashboard"
  value       = local.dashboard_url
}

output "slack_notifier_lambda_arn" {
  description = "ARN of the Slack notifier Lambda function"
  value       = aws_lambda_function.slack_notifier.arn
}

output "tenant_count_lambda_arn" {
  description = "ARN of the tenant count metric publisher Lambda"
  value       = aws_lambda_function.tenant_count.arn
}

output "alarm_arns" {
  description = "Map of alarm names to ARNs"
  value = {
    rds_cpu_warning         = aws_cloudwatch_metric_alarm.rds_cpu_warning.arn
    rds_cpu_critical        = aws_cloudwatch_metric_alarm.rds_cpu_critical.arn
    rds_connections_warning = aws_cloudwatch_metric_alarm.rds_connections_warning.arn
    redis_memory_warning    = aws_cloudwatch_metric_alarm.redis_memory_warning.arn
    redis_memory_critical   = aws_cloudwatch_metric_alarm.redis_memory_critical.arn
    redis_evictions_warning = aws_cloudwatch_metric_alarm.redis_evictions_warning.arn
    api_tasks_near_max      = aws_cloudwatch_metric_alarm.api_tasks_near_max.arn
    api_tasks_at_max        = aws_cloudwatch_metric_alarm.api_tasks_at_max.arn
    bulk_workers_at_max     = aws_cloudwatch_metric_alarm.bulk_workers_at_max.arn
    dlq_warning             = aws_cloudwatch_metric_alarm.dlq_warning.arn
    dlq_critical            = aws_cloudwatch_metric_alarm.dlq_critical.arn
    dynamodb_throttle       = aws_cloudwatch_metric_alarm.dynamodb_throttle_warning.arn
    tenant_count_warning    = aws_cloudwatch_metric_alarm.tenant_count_warning.arn
    tenant_count_critical   = aws_cloudwatch_metric_alarm.tenant_count_critical.arn
  }
}

output "alarm_count" {
  description = "Total number of alarms created"
  value       = 14 + (var.nat_instance_id != "" ? 2 : 0)
}

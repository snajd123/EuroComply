# EuroComply Monitoring Module
# CloudWatch Dashboard + Scaling Alerts + Slack Integration

locals {
  name_prefix = "eurocomply-${var.environment}"

  # Dashboard URL for alert messages
  dashboard_url = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${local.name_prefix}-scaling"

  # Runbook URLs (Section 9.6.x in Architecture Document)
  runbook_base = "https://github.com/snajd123/EuroComply/blob/main/EuroComply_Architecture_Document_v1.3.md"
  runbook_urls = {
    add_database_cell   = "${local.runbook_base}#961-adding-a-new-database-cell"
    upgrade_redis       = "${local.runbook_base}#962-upgrading-redis-instance"
    provision_enterprise = "${local.runbook_base}#963-provisioning-enterprise-dedicated-rds"
    upgrade_nat         = "${local.runbook_base}#964-upgrading-nat-instance-to-nat-gateway"
  }
}

#------------------------------------------------------------------------------
# CloudWatch Dashboard
#------------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "scaling" {
  dashboard_name = "${local.name_prefix}-scaling"

  dashboard_body = jsonencode({
    widgets = [
      # Row 1: Header
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 1
        properties = {
          markdown = "# EuroComply Scaling Dashboard | [Runbooks](${local.runbook_base}#96-manual-scaling-operations-guide)"
        }
      },

      # Row 2: Database Cells
      {
        type   = "metric"
        x      = 0
        y      = 1
        width  = 6
        height = 6
        properties = {
          title  = "Database Cell CPU"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", var.rds_instance_id, { label = "Cell-1 CPU" }]
          ]
          stat   = "Average"
          period = 300
          yAxis = {
            left = { min = 0, max = 100 }
          }
          annotations = {
            horizontal = [
              { value = var.rds_cpu_warning, label = "Warning", color = "#ff7f0e" },
              { value = var.rds_cpu_critical, label = "Critical", color = "#d62728" }
            ]
          }
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 1
        width  = 6
        height = 6
        properties = {
          title  = "Database Connections"
          region = var.aws_region
          metrics = [
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", var.rds_instance_id, { label = "Active Connections" }]
          ]
          stat   = "Average"
          period = 60
          annotations = {
            horizontal = [
              { value = var.rds_connections_warning, label = "Warning", color = "#ff7f0e" },
              { value = var.rds_connections_critical, label = "Critical", color = "#d62728" }
            ]
          }
        }
      },

      # Row 2: Redis Cache
      {
        type   = "metric"
        x      = 12
        y      = 1
        width  = 6
        height = 6
        properties = {
          title  = "Redis Memory"
          region = var.aws_region
          metrics = [
            ["AWS/ElastiCache", "DatabaseMemoryUsagePercentage", "CacheClusterId", var.elasticache_cluster_id, { label = "Memory %" }]
          ]
          stat   = "Average"
          period = 300
          yAxis = {
            left = { min = 0, max = 100 }
          }
          annotations = {
            horizontal = [
              { value = var.redis_memory_warning, label = "Warning", color = "#ff7f0e" },
              { value = var.redis_memory_critical, label = "Critical", color = "#d62728" }
            ]
          }
        }
      },
      {
        type   = "metric"
        x      = 18
        y      = 1
        width  = 6
        height = 6
        properties = {
          title  = "Redis Evictions"
          region = var.aws_region
          metrics = [
            ["AWS/ElastiCache", "Evictions", "CacheClusterId", var.elasticache_cluster_id, { label = "Evictions/hour", stat = "Sum" }]
          ]
          period = 3600
        }
      },

      # Row 3: ECS Services
      {
        type   = "metric"
        x      = 0
        y      = 7
        width  = 6
        height = 6
        properties = {
          title  = "API Service"
          region = var.aws_region
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_api_service_name, { label = "CPU %" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_api_service_name, { label = "Memory %" }]
          ]
          stat   = "Average"
          period = 300
          yAxis = {
            left = { min = 0, max = 100 }
          }
        }
      },
      {
        type   = "metric"
        x      = 6
        y      = 7
        width  = 6
        height = 6
        properties = {
          title  = "API Task Count"
          region = var.aws_region
          metrics = [
            ["ECS/ContainerInsights", "DesiredTaskCount", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_api_service_name, { label = "Desired" }],
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_api_service_name, { label = "Running" }]
          ]
          stat   = "Average"
          period = 60
          annotations = {
            horizontal = [
              { value = var.api_max_tasks - 2, label = "Near Max", color = "#ff7f0e" },
              { value = var.api_max_tasks, label = "Max", color = "#d62728" }
            ]
          }
        }
      },

      # Row 3: Bulk Processing
      {
        type   = "metric"
        x      = 12
        y      = 7
        width  = 6
        height = 6
        properties = {
          title  = "Bulk Queue Depth"
          region = var.aws_region
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.sqs_bulk_queue_name, { label = "Messages" }]
          ]
          stat   = "Average"
          period = 60
        }
      },
      {
        type   = "metric"
        x      = 18
        y      = 7
        width  = 6
        height = 6
        properties = {
          title  = "Bulk Workers & DLQ"
          region = var.aws_region
          metrics = [
            ["ECS/ContainerInsights", "RunningTaskCount", "ClusterName", var.ecs_cluster_name, "ServiceName", var.ecs_worker_service_name, { label = "Workers" }],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.sqs_dlq_name, { label = "DLQ Messages", color = "#d62728" }]
          ]
          stat   = "Average"
          period = 60
        }
      },

      # Row 4: Network & Storage
      {
        type   = "metric"
        x      = 0
        y      = 13
        width  = 8
        height = 6
        properties = {
          title  = "NAT Instance Network"
          region = var.aws_region
          metrics = var.nat_instance_id != "" ? [
            ["AWS/EC2", "NetworkOut", "InstanceId", var.nat_instance_id, { label = "Bytes Out" }]
          ] : []
          stat   = "Sum"
          period = 3600
        }
      },
      {
        type   = "metric"
        x      = 8
        y      = 13
        width  = 8
        height = 6
        properties = {
          title  = "DynamoDB Throttling"
          region = var.aws_region
          metrics = [
            ["AWS/DynamoDB", "ThrottledRequests", "TableName", var.dynamodb_table_name, { label = "Throttled Requests", color = "#d62728" }]
          ]
          stat   = "Sum"
          period = 60
        }
      },

      # Row 4: Business Metrics (Custom)
      {
        type   = "metric"
        x      = 16
        y      = 13
        width  = 8
        height = 6
        properties = {
          title  = "Tenant Count"
          region = var.aws_region
          metrics = [
            ["EuroComply/Business", "TenantCount", "Cell", "cell-1", { label = "Cell-1 Tenants" }]
          ]
          stat   = "Maximum"
          period = 3600
          annotations = {
            horizontal = [
              { value = var.tenant_count_warning, label = "Warning", color = "#ff7f0e" },
              { value = var.tenant_count_critical, label = "Critical", color = "#d62728" }
            ]
          }
        }
      }
    ]
  })
}

#------------------------------------------------------------------------------
# Scaling Alerts - Database
#------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "rds_cpu_warning" {
  alarm_name          = "${local.name_prefix}-rds-cpu-warning"
  alarm_description   = "RDS CPU sustained above ${var.rds_cpu_warning}% - consider adding new database cell. Runbook: ${local.runbook_urls.add_database_cell}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 6  # 30 minutes sustained
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_cpu_warning

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
    Runbook  = local.runbook_urls.add_database_cell
  })
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu_critical" {
  alarm_name          = "${local.name_prefix}-rds-cpu-critical"
  alarm_description   = "CRITICAL: RDS CPU above ${var.rds_cpu_critical}% - add new database cell urgently! Runbook: ${local.runbook_urls.add_database_cell}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3  # 15 minutes
  metric_name         = "CPUUtilization"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_cpu_critical

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "critical"
    Runbook  = local.runbook_urls.add_database_cell
  })
}

resource "aws_cloudwatch_metric_alarm" "rds_connections_warning" {
  alarm_name          = "${local.name_prefix}-rds-connections-warning"
  alarm_description   = "RDS connections at ${var.rds_connections_warning} - approaching limit. Runbook: ${local.runbook_urls.add_database_cell}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseConnections"
  namespace           = "AWS/RDS"
  period              = 300
  statistic           = "Average"
  threshold           = var.rds_connections_warning

  dimensions = {
    DBInstanceIdentifier = var.rds_instance_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
    Runbook  = local.runbook_urls.add_database_cell
  })
}

#------------------------------------------------------------------------------
# Scaling Alerts - Redis
#------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "redis_memory_warning" {
  alarm_name          = "${local.name_prefix}-redis-memory-warning"
  alarm_description   = "Redis memory at ${var.redis_memory_warning}% - consider upgrading instance. Runbook: ${local.runbook_urls.upgrade_redis}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = var.redis_memory_warning

  dimensions = {
    CacheClusterId = var.elasticache_cluster_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
    Runbook  = local.runbook_urls.upgrade_redis
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_memory_critical" {
  alarm_name          = "${local.name_prefix}-redis-memory-critical"
  alarm_description   = "CRITICAL: Redis memory at ${var.redis_memory_critical}% - upgrade instance immediately! Runbook: ${local.runbook_urls.upgrade_redis}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "DatabaseMemoryUsagePercentage"
  namespace           = "AWS/ElastiCache"
  period              = 300
  statistic           = "Average"
  threshold           = var.redis_memory_critical

  dimensions = {
    CacheClusterId = var.elasticache_cluster_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "critical"
    Runbook  = local.runbook_urls.upgrade_redis
  })
}

resource "aws_cloudwatch_metric_alarm" "redis_evictions_warning" {
  alarm_name          = "${local.name_prefix}-redis-evictions-warning"
  alarm_description   = "Redis evicting keys (${var.redis_evictions_warning}+/hour) - cache is full. Runbook: ${local.runbook_urls.upgrade_redis}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Evictions"
  namespace           = "AWS/ElastiCache"
  period              = 3600
  statistic           = "Sum"
  threshold           = var.redis_evictions_warning

  dimensions = {
    CacheClusterId = var.elasticache_cluster_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
    Runbook  = local.runbook_urls.upgrade_redis
  })
}

#------------------------------------------------------------------------------
# Scaling Alerts - NAT Instance
#------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "nat_bandwidth_warning" {
  count = var.nat_instance_id != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-nat-bandwidth-warning"
  alarm_description   = "NAT instance bandwidth high (${var.nat_bandwidth_warning}GB+/hour) - consider NAT Gateway. Runbook: ${local.runbook_urls.upgrade_nat}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "NetworkOut"
  namespace           = "AWS/EC2"
  period              = 3600
  statistic           = "Sum"
  threshold           = var.nat_bandwidth_warning * 1024 * 1024 * 1024  # Convert GB to bytes

  dimensions = {
    InstanceId = var.nat_instance_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
    Runbook  = local.runbook_urls.upgrade_nat
  })
}

resource "aws_cloudwatch_metric_alarm" "nat_bandwidth_critical" {
  count = var.nat_instance_id != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-nat-bandwidth-critical"
  alarm_description   = "CRITICAL: NAT instance saturated (${var.nat_bandwidth_critical}GB+/hour) - upgrade to NAT Gateway! Runbook: ${local.runbook_urls.upgrade_nat}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "NetworkOut"
  namespace           = "AWS/EC2"
  period              = 3600
  statistic           = "Sum"
  threshold           = var.nat_bandwidth_critical * 1024 * 1024 * 1024

  dimensions = {
    InstanceId = var.nat_instance_id
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "critical"
    Runbook  = local.runbook_urls.upgrade_nat
  })
}

#------------------------------------------------------------------------------
# Scaling Alerts - ECS
#------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "api_tasks_near_max" {
  alarm_name          = "${local.name_prefix}-api-tasks-near-max"
  alarm_description   = "API service near max capacity (${var.api_max_tasks - 2}/${var.api_max_tasks} tasks) - consider increasing max_capacity"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  metric_name         = "DesiredTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.api_max_tasks - 2

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_api_service_name
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
  })
}

resource "aws_cloudwatch_metric_alarm" "api_tasks_at_max" {
  alarm_name          = "${local.name_prefix}-api-tasks-at-max"
  alarm_description   = "CRITICAL: API service at max capacity (${var.api_max_tasks}/${var.api_max_tasks} tasks) - increase max_capacity immediately!"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 2
  metric_name         = "DesiredTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.api_max_tasks

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_api_service_name
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "critical"
  })
}

resource "aws_cloudwatch_metric_alarm" "bulk_workers_at_max" {
  alarm_name          = "${local.name_prefix}-bulk-workers-at-max"
  alarm_description   = "Bulk workers at max capacity (${var.worker_max_tasks}/${var.worker_max_tasks} tasks) - consider increasing worker_max_capacity"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 3
  metric_name         = "DesiredTaskCount"
  namespace           = "ECS/ContainerInsights"
  period              = 300
  statistic           = "Maximum"
  threshold           = var.worker_max_tasks

  dimensions = {
    ClusterName = var.ecs_cluster_name
    ServiceName = var.ecs_worker_service_name
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
  })
}

#------------------------------------------------------------------------------
# Scaling Alerts - DLQ
#------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "dlq_warning" {
  alarm_name          = "${local.name_prefix}-dlq-messages-warning"
  alarm_description   = "DLQ has ${var.dlq_warning}+ messages - investigate failed chunks"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.dlq_warning

  dimensions = {
    QueueName = var.sqs_dlq_name
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
  })
}

resource "aws_cloudwatch_metric_alarm" "dlq_critical" {
  alarm_name          = "${local.name_prefix}-dlq-messages-critical"
  alarm_description   = "CRITICAL: DLQ has ${var.dlq_critical}+ messages - systematic failure, investigate immediately!"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = var.dlq_critical

  dimensions = {
    QueueName = var.sqs_dlq_name
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "critical"
  })
}

#------------------------------------------------------------------------------
# Scaling Alerts - DynamoDB
#------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "dynamodb_throttle_warning" {
  alarm_name          = "${local.name_prefix}-dynamodb-throttle-warning"
  alarm_description   = "DynamoDB throttling requests - check table capacity"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "ThrottledRequests"
  namespace           = "AWS/DynamoDB"
  period              = 60
  statistic           = "Sum"
  threshold           = var.dynamodb_throttle_warning

  dimensions = {
    TableName = var.dynamodb_table_name
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
  })
}

#------------------------------------------------------------------------------
# Scaling Alerts - Tenant Count (Custom Metric)
#------------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "tenant_count_warning" {
  alarm_name          = "${local.name_prefix}-tenant-count-warning"
  alarm_description   = "Tenant count at ${var.tenant_count_warning} - plan new database cell. Runbook: ${local.runbook_urls.add_database_cell}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "TenantCount"
  namespace           = "EuroComply/Business"
  period              = 3600
  statistic           = "Maximum"
  threshold           = var.tenant_count_warning

  dimensions = {
    Cell = "cell-1"
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "warning"
    Runbook  = local.runbook_urls.add_database_cell
  })
}

resource "aws_cloudwatch_metric_alarm" "tenant_count_critical" {
  alarm_name          = "${local.name_prefix}-tenant-count-critical"
  alarm_description   = "CRITICAL: Tenant count at ${var.tenant_count_critical} - add new database cell urgently! Runbook: ${local.runbook_urls.add_database_cell}"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  metric_name         = "TenantCount"
  namespace           = "EuroComply/Business"
  period              = 3600
  statistic           = "Maximum"
  threshold           = var.tenant_count_critical

  dimensions = {
    Cell = "cell-1"
  }

  alarm_actions = [var.alert_topic_arn]
  ok_actions    = [var.alert_topic_arn]

  tags = merge(var.tags, {
    Severity = "critical"
    Runbook  = local.runbook_urls.add_database_cell
  })
}

#------------------------------------------------------------------------------
# Slack Notifier Lambda
#------------------------------------------------------------------------------

data "archive_file" "slack_notifier" {
  type        = "zip"
  output_path = "${path.module}/lambda/slack-notifier.zip"

  source {
    content  = <<-EOF
      const https = require('https');
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

      const secretsClient = new SecretsManagerClient();

      exports.handler = async (event) => {
        console.log('Received event:', JSON.stringify(event, null, 2));

        // Get Slack webhook URL from Secrets Manager
        const secretResponse = await secretsClient.send(
          new GetSecretValueCommand({ SecretId: process.env.SLACK_WEBHOOK_SECRET })
        );
        const webhookUrl = JSON.parse(secretResponse.SecretString).webhook_url;

        // Process each SNS record
        for (const record of event.Records) {
          const snsMessage = JSON.parse(record.Sns.Message);
          const slackMessage = formatSlackMessage(snsMessage);
          await sendToSlack(webhookUrl, slackMessage);
        }

        return { statusCode: 200 };
      };

      function formatSlackMessage(alarm) {
        const isAlarm = alarm.NewStateValue === 'ALARM';
        const isOk = alarm.NewStateValue === 'OK';
        const color = isAlarm ? (alarm.AlarmDescription?.includes('CRITICAL') ? '#d62728' : '#ff7f0e') : '#2ca02c';
        const emoji = isAlarm ? (alarm.AlarmDescription?.includes('CRITICAL') ? ':rotating_light:' : ':warning:') : ':white_check_mark:';

        // Extract runbook URL from description if present
        const runbookMatch = alarm.AlarmDescription?.match(/Runbook: (https:\/\/[^\s]+)/);
        const runbookUrl = runbookMatch ? runbookMatch[1] : null;

        const blocks = [
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: emoji + ' ' + alarm.AlarmName,
              emoji: true
            }
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '*Status:*\\n' + alarm.NewStateValue },
              { type: 'mrkdwn', text: '*Region:*\\n' + alarm.Region }
            ]
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Description:*\\n' + (alarm.AlarmDescription || 'No description')
            }
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Reason:*\\n' + alarm.NewStateReason
            }
          }
        ];

        // Add action buttons
        const actions = [];
        actions.push({
          type: 'button',
          text: { type: 'plain_text', text: 'View Dashboard', emoji: true },
          url: process.env.DASHBOARD_URL
        });

        if (runbookUrl) {
          actions.push({
            type: 'button',
            text: { type: 'plain_text', text: 'View Runbook', emoji: true },
            url: runbookUrl,
            style: isAlarm ? 'danger' : undefined
          });
        }

        blocks.push({
          type: 'actions',
          elements: actions
        });

        return {
          attachments: [{
            color: color,
            blocks: blocks
          }]
        };
      }

      async function sendToSlack(webhookUrl, message) {
        const url = new URL(webhookUrl);
        const postData = JSON.stringify(message);

        return new Promise((resolve, reject) => {
          const req = https.request({
            hostname: url.hostname,
            path: url.pathname,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(postData)
            }
          }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              if (res.statusCode === 200) {
                resolve(data);
              } else {
                reject(new Error('Slack API error: ' + res.statusCode + ' ' + data));
              }
            });
          });

          req.on('error', reject);
          req.write(postData);
          req.end();
        });
      }
    EOF
    filename = "index.js"
  }
}

resource "aws_lambda_function" "slack_notifier" {
  function_name    = "${local.name_prefix}-slack-notifier"
  filename         = data.archive_file.slack_notifier.output_path
  source_code_hash = data.archive_file.slack_notifier.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  timeout          = 10
  memory_size      = 128

  role = aws_iam_role.slack_notifier.arn

  environment {
    variables = {
      SLACK_WEBHOOK_SECRET = var.slack_webhook_secret_arn
      DASHBOARD_URL        = local.dashboard_url
    }
  }

  tags = var.tags
}

resource "aws_iam_role" "slack_notifier" {
  name = "${local.name_prefix}-slack-notifier-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "slack_notifier" {
  name = "${local.name_prefix}-slack-notifier-policy"
  role = aws_iam_role.slack_notifier.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.slack_webhook_secret_arn
      }
    ]
  })
}

resource "aws_lambda_permission" "sns_invoke_slack" {
  statement_id  = "AllowSNSInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.slack_notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = var.alert_topic_arn
}

resource "aws_sns_topic_subscription" "slack" {
  topic_arn = var.alert_topic_arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.slack_notifier.arn
}

#------------------------------------------------------------------------------
# Tenant Count Metric Publisher Lambda
#------------------------------------------------------------------------------

data "archive_file" "tenant_count" {
  type        = "zip"
  output_path = "${path.module}/lambda/tenant-count.zip"

  source {
    content  = <<-EOF
      const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
      const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
      const { Client } = require('pg');

      const cloudwatch = new CloudWatchClient();
      const secretsClient = new SecretsManagerClient();

      exports.handler = async (event) => {
        console.log('Publishing tenant count metric');

        // Get database credentials from Secrets Manager
        const secretResponse = await secretsClient.send(
          new GetSecretValueCommand({ SecretId: process.env.DATABASE_SECRET })
        );
        const dbCreds = JSON.parse(secretResponse.SecretString);

        // Connect to database
        const client = new Client({
          host: dbCreds.host,
          port: dbCreds.port || 5432,
          database: dbCreds.database || 'eurocomply',
          user: dbCreds.username,
          password: dbCreds.password,
          ssl: { rejectUnauthorized: false }
        });

        try {
          await client.connect();

          // Count tenant schemas
          const result = await client.query(`
            SELECT COUNT(DISTINCT schema_name) as count
            FROM information_schema.schemata
            WHERE schema_name LIKE 'tenant_%'
          `);

          const tenantCount = parseInt(result.rows[0].count, 10);
          console.log('Tenant count:', tenantCount);

          // Publish to CloudWatch
          await cloudwatch.send(new PutMetricDataCommand({
            Namespace: 'EuroComply/Business',
            MetricData: [{
              MetricName: 'TenantCount',
              Value: tenantCount,
              Unit: 'Count',
              Dimensions: [
                { Name: 'Cell', Value: process.env.CELL_NAME || 'cell-1' }
              ]
            }]
          }));

          console.log('Metric published successfully');
          return { statusCode: 200, tenantCount };

        } finally {
          await client.end();
        }
      };
    EOF
    filename = "index.js"
  }
}

resource "aws_lambda_function" "tenant_count" {
  function_name    = "${local.name_prefix}-tenant-count"
  filename         = data.archive_file.tenant_count.output_path
  source_code_hash = data.archive_file.tenant_count.output_base64sha256
  handler          = "index.handler"
  runtime          = "nodejs18.x"
  timeout          = 30
  memory_size      = 128

  role = aws_iam_role.tenant_count.arn

  vpc_config {
    subnet_ids         = var.private_subnet_ids
    security_group_ids = [var.lambda_security_group_id]
  }

  environment {
    variables = {
      DATABASE_SECRET = var.database_secret_arn
      CELL_NAME       = "cell-1"
    }
  }

  tags = var.tags
}

resource "aws_iam_role" "tenant_count" {
  name = "${local.name_prefix}-tenant-count-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "tenant_count" {
  name = "${local.name_prefix}-tenant-count-policy"
  role = aws_iam_role.tenant_count.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = var.database_secret_arn
      },
      {
        Effect = "Allow"
        Action = [
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "cloudwatch:namespace" = "EuroComply/Business"
          }
        }
      },
      {
        Effect = "Allow"
        Action = [
          "ec2:CreateNetworkInterface",
          "ec2:DescribeNetworkInterfaces",
          "ec2:DeleteNetworkInterface"
        ]
        Resource = "*"
      }
    ]
  })
}

# Schedule tenant count Lambda to run every hour
resource "aws_cloudwatch_event_rule" "tenant_count_schedule" {
  name                = "${local.name_prefix}-tenant-count-schedule"
  description         = "Run tenant count metric publisher every hour"
  schedule_expression = "rate(1 hour)"

  tags = var.tags
}

resource "aws_cloudwatch_event_target" "tenant_count" {
  rule      = aws_cloudwatch_event_rule.tenant_count_schedule.name
  target_id = "tenant-count-lambda"
  arn       = aws_lambda_function.tenant_count.arn
}

resource "aws_lambda_permission" "eventbridge_tenant_count" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.tenant_count.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.tenant_count_schedule.arn
}

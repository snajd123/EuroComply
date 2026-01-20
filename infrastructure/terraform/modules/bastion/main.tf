# Bastion Host Module for EuroComply
# Minimal EC2 instance with SSM for secure database access
# No SSH keys - access via AWS Session Manager only

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "vpc_id" {
  description = "VPC ID"
  type        = string
}

variable "subnet_id" {
  description = "Private subnet ID for bastion (uses SSM, no public IP needed)"
  type        = string
}

variable "rds_security_group_id" {
  description = "RDS security group ID to allow connections from bastion"
  type        = string
}

locals {
  name_prefix = "${var.project}-${var.environment}"
}

# IAM Role for SSM access
resource "aws_iam_role" "bastion" {
  name = "${local.name_prefix}-bastion-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${local.name_prefix}-bastion-role"
  }
}

# Inline policy for SSM access (Sovereign Cloud compatible)
# Equivalent to AmazonSSMManagedInstanceCore but with correct partition
resource "aws_iam_role_policy" "bastion_ssm" {
  name = "${local.name_prefix}-bastion-ssm-policy"
  role = aws_iam_role.bastion.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:DescribeAssociation",
          "ssm:GetDeployablePatchSnapshotForInstance",
          "ssm:GetDocument",
          "ssm:DescribeDocument",
          "ssm:GetManifest",
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:ListAssociations",
          "ssm:ListInstanceAssociations",
          "ssm:PutInventory",
          "ssm:PutComplianceItems",
          "ssm:PutConfigurePackageResult",
          "ssm:UpdateAssociationStatus",
          "ssm:UpdateInstanceAssociationStatus",
          "ssm:UpdateInstanceInformation"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ssmmessages:CreateControlChannel",
          "ssmmessages:CreateDataChannel",
          "ssmmessages:OpenControlChannel",
          "ssmmessages:OpenDataChannel"
        ]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ec2messages:AcknowledgeMessage",
          "ec2messages:DeleteMessage",
          "ec2messages:FailMessage",
          "ec2messages:GetEndpoint",
          "ec2messages:GetMessages",
          "ec2messages:SendReply"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_instance_profile" "bastion" {
  name = "${local.name_prefix}-bastion-profile"
  role = aws_iam_role.bastion.name
}

# Security group for bastion
resource "aws_security_group" "bastion" {
  name        = "${local.name_prefix}-bastion-sg"
  description = "Security group for bastion host"
  vpc_id      = var.vpc_id

  # Outbound to RDS
  egress {
    from_port   = 5432
    to_port     = 5432
    protocol    = "tcp"
    description = "PostgreSQL to RDS"
    security_groups = [var.rds_security_group_id]
  }

  # Outbound HTTPS for SSM
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS for SSM endpoints"
  }

  tags = {
    Name = "${local.name_prefix}-bastion-sg"
  }
}

# Allow bastion to connect to RDS
resource "aws_security_group_rule" "rds_from_bastion" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = var.rds_security_group_id
  source_security_group_id = aws_security_group.bastion.id
  description              = "PostgreSQL from bastion"
}

# Get latest Amazon Linux 2023 AMI
data "aws_ami" "amazon_linux" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# Bastion EC2 instance (minimal size, no public IP)
resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.nano"
  subnet_id              = var.subnet_id
  iam_instance_profile   = aws_iam_instance_profile.bastion.name
  vpc_security_group_ids = [aws_security_group.bastion.id]

  # No public IP - access via SSM only
  associate_public_ip_address = false

  # Enable detailed monitoring for troubleshooting
  monitoring = false

  # Minimal root volume
  root_block_device {
    volume_size = 8
    volume_type = "gp3"
    encrypted   = true
  }

  # Install PostgreSQL client and configure SSM agent for Sovereign Cloud
  user_data = base64encode(<<-EOF
    #!/bin/bash
    set -e

    # Install PostgreSQL client
    dnf install -y postgresql15

    # Configure SSM agent for AWS European Sovereign Cloud endpoints
    mkdir -p /etc/amazon/ssm
    cat > /etc/amazon/ssm/amazon-ssm-agent.json << 'SSMCONFIG'
    {
      "Profile": {
        "Region": "eusc-de-east-1"
      },
      "Mds": {
        "Endpoint": "https://ssmmessages.eusc-de-east-1.amazonaws.eu"
      },
      "Ssm": {
        "Endpoint": "https://ssm.eusc-de-east-1.amazonaws.eu"
      },
      "Ec2": {
        "Endpoint": "https://ec2messages.eusc-de-east-1.amazonaws.eu"
      },
      "Kms": {
        "Endpoint": "https://kms.eusc-de-east-1.amazonaws.eu"
      },
      "S3": {
        "Endpoint": "https://s3.eusc-de-east-1.amazonaws.eu",
        "Region": "eusc-de-east-1"
      }
    }
    SSMCONFIG

    # Restart SSM agent to pick up new config
    systemctl restart amazon-ssm-agent
  EOF
  )

  tags = {
    Name = "${local.name_prefix}-bastion"
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

output "instance_id" {
  description = "Bastion instance ID for SSM connections"
  value       = aws_instance.bastion.id
}

output "security_group_id" {
  description = "Bastion security group ID"
  value       = aws_security_group.bastion.id
}

# Bastion Host Module for EuroComply
# EC2 instance in public subnet with SSH access for database connectivity
# Uses SSH tunneling for Prisma Studio / database tools

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
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
  description = "Public subnet ID for bastion"
  type        = string
}

variable "rds_security_group_id" {
  description = "RDS security group ID to allow connections from bastion"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed to SSH to bastion. Restrict to your IP for security."
  type        = list(string)
  default     = ["0.0.0.0/0"]  # Override in production with specific IPs
}

locals {
  name_prefix = "${var.project}-${var.environment}"
}

# Generate SSH key pair
resource "tls_private_key" "bastion" {
  algorithm = "RSA"
  rsa_bits  = 4096
}

resource "aws_key_pair" "bastion" {
  key_name   = "${local.name_prefix}-bastion-key"
  public_key = tls_private_key.bastion.public_key_openssh

  tags = {
    Name = "${local.name_prefix}-bastion-key"
  }
}

# Store private key in Secrets Manager
resource "aws_secretsmanager_secret" "bastion_ssh_key" {
  name        = "${var.project}/${var.environment}/bastion-ssh-key"
  description = "SSH private key for bastion host"

  tags = {
    Name = "${local.name_prefix}-bastion-ssh-key"
  }
}

resource "aws_secretsmanager_secret_version" "bastion_ssh_key" {
  secret_id     = aws_secretsmanager_secret.bastion_ssh_key.id
  secret_string = tls_private_key.bastion.private_key_pem
}

# Security group for bastion
resource "aws_security_group" "bastion" {
  name        = "${local.name_prefix}-bastion-sg"
  description = "Security group for bastion host"
  vpc_id      = var.vpc_id

  # Inbound SSH
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
    description = "SSH access"
  }

  # Outbound to RDS
  egress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    description     = "PostgreSQL to RDS"
    security_groups = [var.rds_security_group_id]
  }

  # Outbound HTTPS (for package updates)
  egress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS for package updates"
  }

  # Outbound HTTP (for package updates)
  egress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTP for package updates"
  }

  tags = {
    Name = "${local.name_prefix}-bastion-sg"
  }
}

# Allow bastion to connect to RDS
resource "aws_vpc_security_group_ingress_rule" "rds_from_bastion" {
  security_group_id            = var.rds_security_group_id
  referenced_security_group_id = aws_security_group.bastion.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
  description                  = "PostgreSQL from bastion"
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

# Bastion EC2 instance
resource "aws_instance" "bastion" {
  ami                    = data.aws_ami.amazon_linux.id
  instance_type          = "t3.nano"
  subnet_id              = var.subnet_id
  key_name               = aws_key_pair.bastion.key_name
  vpc_security_group_ids = [aws_security_group.bastion.id]

  # Public IP for SSH access
  associate_public_ip_address = true

  # Root volume
  root_block_device {
    volume_size = 30
    volume_type = "gp3"
    encrypted   = true
  }

  # Install PostgreSQL client
  user_data = base64encode(<<-EOF
    #!/bin/bash
    exec > /var/log/user-data.log 2>&1
    set -ex

    # Install PostgreSQL client
    dnf install -y postgresql15

    # Verify installation
    which psql && echo "PostgreSQL client installed successfully"
  EOF
  )

  tags = {
    Name = "${local.name_prefix}-bastion"
  }

  user_data_replace_on_change = true

  lifecycle {
    ignore_changes = [ami]
  }
}

output "instance_id" {
  description = "Bastion instance ID"
  value       = aws_instance.bastion.id
}

output "public_ip" {
  description = "Bastion public IP address"
  value       = aws_instance.bastion.public_ip
}

output "security_group_id" {
  description = "Bastion security group ID"
  value       = aws_security_group.bastion.id
}

output "ssh_key_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the SSH private key"
  value       = aws_secretsmanager_secret.bastion_ssh_key.arn
}

output "ssh_key_name" {
  description = "Name of the SSH key pair"
  value       = aws_key_pair.bastion.key_name
}

# infrastructure/terraform/modules/cloudflare/main.tf
#
# Cloudflare module for EuroComply DPP serving infrastructure
# - R2 bucket for product templates (deduplicated, stored once per product type)
# - DPP rendering: templates from R2 + item records from API = on-demand merge
# - DNS records for API and DPP subdomains
# - Workers for intelligent DPP routing with on-demand rendering
# - Cache rules for optimal performance
#
# Architecture (see EuroComply_Architecture_Document_v1.5.md Section 7.7):
# - Product templates (static): 30KB per product type, stored once in R2
# - Item records (dynamic): 500 bytes per item, stored in DynamoDB
# - On-demand rendering: Worker fetches template + item, merges, returns DPP
# - Result: 99% storage savings (300TB → 5TB for 10B items)

# -----------------------------------------------------------------------------
# Variables
# -----------------------------------------------------------------------------

variable "name" {
  type        = string
  description = "Environment name (e.g., production, staging)"
}

variable "domain" {
  type        = string
  description = "Base domain for the application (e.g., eurocomply.eu)"
}

variable "cloudflare_account_id" {
  type        = string
  description = "Cloudflare account ID"
  sensitive   = true
}

variable "cloudflare_zone_id" {
  type        = string
  description = "Cloudflare zone ID for the domain"
  sensitive   = true
}

variable "aws_alb_dns_name" {
  type        = string
  description = "DNS name of the AWS ALB to proxy API traffic to"
}

variable "enable_workers" {
  type        = bool
  default     = true
  description = "Enable Cloudflare Workers for DPP serving"
}

variable "r2_bucket_name" {
  type        = string
  default     = ""
  description = "Name for the R2 bucket. Defaults to {name}-eurocomply-dpps"
}

variable "enable_status_list_hosting" {
  type        = bool
  default     = true
  description = "Enable R2 hosting for status list credentials"
}

variable "cache_ttl_dpp" {
  type        = number
  default     = 2592000 # 30 days
  description = "Cache TTL for DPP pages in seconds (immutable content)"
}

variable "cache_ttl_status_list" {
  type        = number
  default     = 300 # 5 minutes
  description = "Cache TTL for status list in seconds (may update on revocation)"
}

variable "cache_ttl_template" {
  type        = number
  default     = 2592000 # 30 days
  description = "Cache TTL for product templates in seconds (static content)"
}

variable "api_internal_endpoint" {
  type        = string
  default     = ""
  description = "Internal API endpoint for fetching item records (e.g., https://api.eurocomply.eu). If empty, uses https://api.{domain}"
}

# -----------------------------------------------------------------------------
# R2 Bucket for Product Templates (Deduplicated Storage)
# -----------------------------------------------------------------------------

resource "cloudflare_r2_bucket" "dpps" {
  account_id = var.cloudflare_account_id
  name       = var.r2_bucket_name != "" ? var.r2_bucket_name : "${var.name}-eurocomply-dpps"
  location   = "WEUR" # Western Europe

  # Note: R2 buckets have zero egress fees, making this ideal for DPP serving
  # Storage structure:
  #   templates/{passportId}/template.html  - DPP template with placeholders
  #   templates/{passportId}/image_main.webp - Product images (optional)
  # Item records are stored in DynamoDB (not in R2)
}

# R2 bucket for status lists (if enabled)
resource "cloudflare_r2_bucket" "status_lists" {
  count = var.enable_status_list_hosting ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${var.name}-eurocomply-status-lists"
  location   = "WEUR"
}

# -----------------------------------------------------------------------------
# DNS Records
# -----------------------------------------------------------------------------

# API subdomain - proxied through Cloudflare to AWS ALB
resource "cloudflare_record" "api" {
  zone_id = var.cloudflare_zone_id
  name    = "api"
  content = var.aws_alb_dns_name
  type    = "CNAME"
  ttl     = 1 # Auto (proxied)
  proxied = true

  comment = "API endpoint - proxied to AWS ALB"
}

# DPP subdomain - served by Cloudflare Workers from R2
resource "cloudflare_record" "dpp" {
  zone_id = var.cloudflare_zone_id
  name    = "dpp"
  content = "100::" # Placeholder for Workers route
  type    = "AAAA"
  ttl     = 1
  proxied = true

  comment = "DPP viewer - served by Cloudflare Workers"
}

# Status list subdomain (for revocation checking)
resource "cloudflare_record" "status" {
  count = var.enable_status_list_hosting ? 1 : 0

  zone_id = var.cloudflare_zone_id
  name    = "status"
  content = "100::"
  type    = "AAAA"
  ttl     = 1
  proxied = true

  comment = "Status list endpoint - served by Cloudflare Workers"
}

# Root domain redirect to www (optional)
resource "cloudflare_record" "root" {
  zone_id = var.cloudflare_zone_id
  name    = "@"
  content = "www.${var.domain}"
  type    = "CNAME"
  ttl     = 1
  proxied = true

  comment = "Root domain - redirect to www"
}

# www subdomain - marketing site or app
resource "cloudflare_record" "www" {
  zone_id = var.cloudflare_zone_id
  name    = "www"
  content = var.aws_alb_dns_name
  type    = "CNAME"
  ttl     = 1
  proxied = true

  comment = "WWW subdomain - proxied to AWS ALB"
}

# -----------------------------------------------------------------------------
# Cloudflare Workers
# -----------------------------------------------------------------------------

# Worker script for on-demand DPP rendering
# Architecture: Template (R2) + Item Record (API/DynamoDB) = Rendered DPP
resource "cloudflare_worker_script" "dpp_server" {
  count = var.enable_workers ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${var.name}-dpp-server"
  content    = <<-WORKER
    /**
     * EuroComply DPP Server Worker - On-Demand Rendering
     *
     * Deduplicated storage architecture (see Architecture Doc v1.5 Section 7.7):
     * - Product templates (static): stored ONCE per product type in R2 (~30KB)
     * - Item records (dynamic): stored per serial in DynamoDB (~500 bytes)
     * - On-demand rendering: template + item data merged at scan time
     *
     * This architecture provides:
     * - 99% storage savings (300TB → 5TB for 10B items over 10 years)
     * - All DPPs served instantly (<50ms) - no archival delays
     * - Template updates propagate to all items immediately
     */

    const API_ENDPOINT = '${var.api_internal_endpoint != "" ? var.api_internal_endpoint : "https://api.${var.domain}"}';
    const TEMPLATE_CACHE_TTL = ${var.cache_ttl_template};
    const DPP_CACHE_TTL = ${var.cache_ttl_dpp};

    export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Health check endpoint
        if (path === '/health') {
          return new Response('OK', { status: 200 });
        }

        // Parse DPP request: /dpp/{passportId} or /dpp/{passportId}/{serialNumber}
        const dppMatch = path.match(/^\/dpp\/([a-zA-Z0-9_-]+)(?:\/([a-zA-Z0-9_-]+))?$/);

        if (!dppMatch) {
          return new Response('Not Found', {
            status: 404,
            headers: { 'Content-Type': 'text/plain' }
          });
        }

        const passportId = dppMatch[1];
        const serialNumber = dppMatch[2];

        try {
          // 1. Fetch product template from R2 (heavily cached at edge)
          const templateKey = `templates/$${passportId}/template.html`;
          const templateObject = await env.R2_BUCKET.get(templateKey);

          if (!templateObject) {
            return new Response('DPP template not found', {
              status: 404,
              headers: {
                'Content-Type': 'text/plain',
                'Cache-Control': 'no-store'
              }
            });
          }

          let templateHtml = await templateObject.text();

          // 2. For product-level DPP (no serial), return template as-is
          if (!serialNumber) {
            return new Response(templateHtml, {
              headers: {
                'Content-Type': 'text/html; charset=utf-8',
                'Cache-Control': `public, max-age=$${TEMPLATE_CACHE_TTL}, immutable`,
                'X-Content-Type-Options': 'nosniff',
                'X-Frame-Options': 'SAMEORIGIN',
                'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
                'X-DPP-Source': 'template-only'
              }
            });
          }

          // 3. For item-level DPP, fetch item record from API (DynamoDB)
          const itemResponse = await fetch(
            `$${API_ENDPOINT}/v1/internal/items/$${passportId}/$${serialNumber}`,
            {
              headers: {
                'Accept': 'application/json',
                'X-Internal-Request': 'dpp-worker'
              }
            }
          );

          if (!itemResponse.ok) {
            if (itemResponse.status === 404) {
              return new Response('Item not found', {
                status: 404,
                headers: {
                  'Content-Type': 'text/plain',
                  'Cache-Control': 'no-store'
                }
              });
            }
            throw new Error(`Item fetch failed: $${itemResponse.status}`);
          }

          const itemRecord = await itemResponse.json();

          // 4. Render DPP by merging template + item data
          const renderedDpp = renderDpp(templateHtml, itemRecord.data);

          // 5. Return rendered DPP with appropriate caching
          // Cache is shorter for item-level DPPs since status may change
          return new Response(renderedDpp, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': `private, max-age=$${DPP_CACHE_TTL}`,
              'X-Content-Type-Options': 'nosniff',
              'X-Frame-Options': 'SAMEORIGIN',
              'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
              'X-DPP-Source': 'rendered',
              'X-DPP-Serial': serialNumber
            }
          });

        } catch (error) {
          console.error('DPP rendering error:', error);
          return new Response('Internal Server Error', {
            status: 500,
            headers: { 'Content-Type': 'text/plain' }
          });
        }
      }
    };

    /**
     * Render DPP by replacing template placeholders with item data
     */
    function renderDpp(template, item) {
      return template
        .replace(/\{\{serialNumber\}\}/g, escapeHtml(item.serialNumber || ''))
        .replace(/\{\{batchNumber\}\}/g, escapeHtml(item.batchNumber || ''))
        .replace(/\{\{productionDate\}\}/g, escapeHtml(formatDate(item.productionDate)))
        .replace(/\{\{facilityId\}\}/g, escapeHtml(item.facilityId || ''))
        .replace(/\{\{status\}\}/g, escapeHtml(item.status || 'active'))
        .replace(/\{\{statusClass\}\}/g, item.status === 'revoked' ? 'revoked' : 'active')
        .replace(/\{\{epcisLink\}\}/g, `/api/epcis/$${item.passportId}/$${item.serialNumber}`)
        .replace(/\{\{createdAt\}\}/g, escapeHtml(formatDate(item.createdAt)));
    }

    function escapeHtml(str) {
      if (!str) return '';
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function formatDate(dateStr) {
      if (!dateStr) return '';
      try {
        return new Date(dateStr).toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch {
        return dateStr;
      }
    }
  WORKER

  module = true

  r2_bucket_binding {
    name        = "R2_BUCKET"
    bucket_name = cloudflare_r2_bucket.dpps.name
  }
}

# Worker script for status list serving
resource "cloudflare_worker_script" "status_list_server" {
  count = var.enable_workers && var.enable_status_list_hosting ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${var.name}-status-list-server"
  content    = <<-WORKER
    /**
     * EuroComply Status List Server Worker
     *
     * Serves Status List 2021 credentials for revocation checking.
     * Short cache TTL to allow revocation updates to propagate.
     */
    export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // Health check
        if (path === '/health') {
          return new Response('OK', { status: 200 });
        }

        // Parse status list request: /v1/status/{orgId}
        const statusMatch = path.match(/^\/v1\/status\/([a-zA-Z0-9_-]+)$/);

        if (!statusMatch) {
          return new Response('Not Found', {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const orgId = statusMatch[1];
        const objectKey = `status-lists/$${orgId}.json`;

        try {
          const object = await env.R2_BUCKET.get(objectKey);

          if (!object) {
            return new Response(JSON.stringify({ error: 'Status list not found' }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
              }
            });
          }

          return new Response(object.body, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'public, max-age=${var.cache_ttl_status_list}',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'X-Status-List-Source': 'r2'
            }
          });

        } catch (error) {
          console.error('R2 fetch error:', error);
          return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
    };
  WORKER

  module = true

  r2_bucket_binding {
    name        = "R2_BUCKET"
    bucket_name = cloudflare_r2_bucket.status_lists[0].name
  }
}

# -----------------------------------------------------------------------------
# Worker Routes
# -----------------------------------------------------------------------------

resource "cloudflare_worker_route" "dpp" {
  count = var.enable_workers ? 1 : 0

  zone_id     = var.cloudflare_zone_id
  pattern     = "dpp.${var.domain}/*"
  script_name = cloudflare_worker_script.dpp_server[0].name
}

resource "cloudflare_worker_route" "status" {
  count = var.enable_workers && var.enable_status_list_hosting ? 1 : 0

  zone_id     = var.cloudflare_zone_id
  pattern     = "status.${var.domain}/*"
  script_name = cloudflare_worker_script.status_list_server[0].name
}

# Also route api.eurocomply.eu/v1/status/* to status list worker for backwards compatibility
resource "cloudflare_worker_route" "api_status_compat" {
  count = var.enable_workers && var.enable_status_list_hosting ? 1 : 0

  zone_id     = var.cloudflare_zone_id
  pattern     = "api.${var.domain}/v1/status/*"
  script_name = cloudflare_worker_script.status_list_server[0].name
}

# -----------------------------------------------------------------------------
# Page Rules & Cache Configuration
# -----------------------------------------------------------------------------

# Cache rules for DPP serving
# Note: With on-demand rendering, we cache templates aggressively but rendered DPPs shorter
resource "cloudflare_ruleset" "cache_rules" {
  zone_id = var.cloudflare_zone_id
  name    = "EuroComply Cache Rules"
  kind    = "zone"
  phase   = "http_request_cache_settings"

  # Product-level DPPs (no serial) - immutable template, cache long
  # Item-level DPPs (with serial) - rendered, shorter cache (item status may change)
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "override_origin"
        default = var.cache_ttl_dpp
      }
      browser_ttl {
        mode    = "override_origin"
        default = var.cache_ttl_dpp
      }
    }
    expression  = "(http.host eq \"dpp.${var.domain}\")"
    description = "Cache DPP pages - templates long-lived, item DPPs shorter"
    enabled     = true
  }

  # Status list - short cache, must propagate revocations
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = true
      edge_ttl {
        mode    = "override_origin"
        default = var.cache_ttl_status_list
      }
      browser_ttl {
        mode    = "override_origin"
        default = var.cache_ttl_status_list
      }
    }
    expression  = "(http.host eq \"status.${var.domain}\") or (http.host eq \"api.${var.domain}\" and starts_with(http.request.uri.path, \"/v1/status/\"))"
    description = "Cache status lists for 5 minutes (may update on revocation)"
    enabled     = true
  }

  # API - no cache (dynamic content)
  rules {
    action = "set_cache_settings"
    action_parameters {
      cache = false
    }
    expression  = "(http.host eq \"api.${var.domain}\") and not starts_with(http.request.uri.path, \"/v1/status/\")"
    description = "No caching for API endpoints"
    enabled     = true
  }
}

# -----------------------------------------------------------------------------
# Security Configuration
# -----------------------------------------------------------------------------

# WAF rules for API protection
resource "cloudflare_ruleset" "waf" {
  zone_id = var.cloudflare_zone_id
  name    = "EuroComply WAF Rules"
  kind    = "zone"
  phase   = "http_request_firewall_custom"

  # Rate limiting for API
  rules {
    action = "block"
    ratelimit {
      characteristics = ["ip.src"]
      period          = 60
      requests_per_period = 100
      mitigation_timeout  = 600
    }
    expression  = "(http.host eq \"api.${var.domain}\")"
    description = "Rate limit API to 100 requests/minute per IP"
    enabled     = true
  }

  # Block requests without valid User-Agent (common bot behavior)
  rules {
    action = "challenge"
    expression  = "(http.host eq \"api.${var.domain}\") and (len(http.user_agent) eq 0)"
    description = "Challenge requests without User-Agent"
    enabled     = true
  }
}

# SSL/TLS configuration
resource "cloudflare_zone_settings_override" "ssl" {
  zone_id = var.cloudflare_zone_id

  settings {
    ssl                      = "strict"
    always_use_https         = "on"
    min_tls_version          = "1.2"
    tls_1_3                  = "on"
    automatic_https_rewrites = "on"
    opportunistic_encryption = "on"

    security_header {
      enabled            = true
      preload            = true
      max_age            = 31536000 # 1 year
      include_subdomains = true
    }
  }
}

# -----------------------------------------------------------------------------
# Outputs
# -----------------------------------------------------------------------------

output "r2_bucket_name" {
  value       = cloudflare_r2_bucket.dpps.name
  description = "Name of the R2 bucket for DPP storage"
}

output "r2_bucket_id" {
  value       = cloudflare_r2_bucket.dpps.id
  description = "ID of the R2 bucket for DPP storage"
}

output "status_list_bucket_name" {
  value       = var.enable_status_list_hosting ? cloudflare_r2_bucket.status_lists[0].name : null
  description = "Name of the R2 bucket for status lists"
}

output "dpp_endpoint" {
  value       = "https://dpp.${var.domain}"
  description = "Public endpoint for DPP access"
}

output "status_endpoint" {
  value       = var.enable_status_list_hosting ? "https://status.${var.domain}" : null
  description = "Public endpoint for status list access"
}

output "api_endpoint" {
  value       = "https://api.${var.domain}"
  description = "Public endpoint for API access (proxied through Cloudflare)"
}

output "worker_names" {
  value = {
    dpp_server         = var.enable_workers ? cloudflare_worker_script.dpp_server[0].name : null
    status_list_server = var.enable_workers && var.enable_status_list_hosting ? cloudflare_worker_script.status_list_server[0].name : null
  }
  description = "Names of deployed Cloudflare Workers"
}

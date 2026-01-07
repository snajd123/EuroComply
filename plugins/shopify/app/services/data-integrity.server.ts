/**
 * Data Integrity Service
 *
 * Ensures that displayed DPP data matches the cryptographically signed
 * Verifiable Credential. Detects tampering or stale data.
 *
 * Problem: Merchant edits Metaobject after VC issuance → data mismatch
 * Solution: Hash comparison + real-time verification status
 *
 * Integrity States:
 * - VERIFIED: Current data matches VC exactly
 * - MODIFIED: Data has been changed since VC issuance (re-issue needed)
 * - PENDING: VC not yet issued
 * - EXPIRED: VC has expired
 * - REVOKED: VC has been revoked
 * - ERROR: Verification failed
 */

import { createHash } from "crypto";
import type { TextileDppData, DppData } from "../types/dpp-schemas";

// ============================================================================
// TYPES
// ============================================================================

export type IntegrityStatus =
  | "VERIFIED"      // Data matches VC - fully trusted
  | "MODIFIED"      // Data changed after VC - needs re-issue
  | "PENDING"       // VC not yet issued
  | "EXPIRED"       // VC has expired
  | "REVOKED"       // VC was revoked
  | "ERROR";        // Verification failed

export interface IntegrityResult {
  status: IntegrityStatus;
  message: string;
  details: {
    dataHash: string;           // Hash of current data
    vcDataHash?: string;        // Hash of VC-signed data
    vcIssuedAt?: string;        // When VC was issued
    dataModifiedAt?: string;    // When data was last modified
    expiresAt?: string;         // When VC expires
    changedFields?: string[];   // Which fields differ
  };
  badge: {
    color: "green" | "yellow" | "red" | "gray";
    icon: string;
    text: string;
    tooltip: string;
  };
}

// ============================================================================
// HASH COMPUTATION
// ============================================================================

/**
 * Compute a deterministic hash of DPP data for comparison.
 * Uses canonical JSON (sorted keys) to ensure consistency.
 */
export function computeDataHash(data: DppData | Record<string, unknown>): string {
  // Create canonical representation (sorted keys, no undefined)
  const canonical = canonicalize(data);
  const json = JSON.stringify(canonical);

  // SHA-256 hash, return first 16 chars for readability
  return createHash("sha256").update(json).digest("hex").substring(0, 16);
}

/**
 * Canonicalize an object for consistent hashing.
 * Sorts keys, removes undefined values.
 */
function canonicalize(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(canonicalize);
  }

  if (typeof obj === "object") {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(obj as Record<string, unknown>).sort();

    for (const key of keys) {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== undefined) {
        sorted[key] = canonicalize(value);
      }
    }

    return sorted;
  }

  return obj;
}

/**
 * Extract the essential fields for hash comparison.
 * Only includes fields that are part of the VC claims.
 */
export function extractHashableFields(data: TextileDppData): Record<string, unknown> {
  return {
    category: data.category,
    fiberComposition: data.fiberComposition.map((f) => ({
      fiberType: f.fiberType,
      percentage: f.percentage,
      origin: f.origin,
    })),
    countryOfManufacture: data.countryOfManufacture,
    manufacturer: {
      name: data.manufacturer.name,
      country: data.manufacturer.country,
    },
    careInstructions: {
      maxWashTemperature: data.careInstructions.maxWashTemperature,
      bleachAllowed: data.careInstructions.bleachAllowed,
      tumbleDryAllowed: data.careInstructions.tumbleDryAllowed,
      ironTemperature: data.careInstructions.ironTemperature,
      dryCleanAllowed: data.careInstructions.dryCleanAllowed,
    },
    hazardousSubstances: {
      reachCompliant: data.hazardousSubstances.reachCompliant,
    },
    carbonFootprint: data.carbonFootprint
      ? {
          value: data.carbonFootprint.value,
          methodology: data.carbonFootprint.methodology,
        }
      : null,
    certifications: data.certifications?.map((c) => ({
      type: c.type,
      certificateNumber: c.certificateNumber,
    })),
  };
}

// ============================================================================
// INTEGRITY VERIFICATION
// ============================================================================

export interface VerifyIntegrityParams {
  currentData: DppData | Record<string, unknown>;
  vcData?: Record<string, unknown>;
  vcIssuedAt?: string;
  vcExpiresAt?: string;
  vcRevoked?: boolean;
  dataModifiedAt?: string;
}

/**
 * Verify data integrity by comparing current data with VC-signed data.
 */
export function verifyDataIntegrity(params: VerifyIntegrityParams): IntegrityResult {
  const { currentData, vcData, vcIssuedAt, vcExpiresAt, vcRevoked, dataModifiedAt } = params;

  const currentHash = computeDataHash(currentData);

  // No VC issued yet
  if (!vcData || !vcIssuedAt) {
    return {
      status: "PENDING",
      message: "Verifiable Credential not yet issued",
      details: {
        dataHash: currentHash,
      },
      badge: {
        color: "gray",
        icon: "⏳",
        text: "Pending",
        tooltip: "Data has not been cryptographically verified yet",
      },
    };
  }

  // VC was revoked
  if (vcRevoked) {
    return {
      status: "REVOKED",
      message: "Verifiable Credential has been revoked",
      details: {
        dataHash: currentHash,
        vcDataHash: computeDataHash(vcData),
        vcIssuedAt,
      },
      badge: {
        color: "red",
        icon: "⊘",
        text: "Revoked",
        tooltip: "This credential has been revoked and is no longer valid",
      },
    };
  }

  // VC has expired
  if (vcExpiresAt) {
    const expiryDate = new Date(vcExpiresAt);
    if (expiryDate < new Date()) {
      return {
        status: "EXPIRED",
        message: "Verifiable Credential has expired",
        details: {
          dataHash: currentHash,
          vcDataHash: computeDataHash(vcData),
          vcIssuedAt,
          expiresAt: vcExpiresAt,
        },
        badge: {
          color: "yellow",
          icon: "⏰",
          text: "Expired",
          tooltip: `Credential expired on ${expiryDate.toLocaleDateString()}`,
        },
      };
    }
  }

  // Compare hashes
  const vcDataHash = computeDataHash(vcData);

  if (currentHash === vcDataHash) {
    return {
      status: "VERIFIED",
      message: "Data matches cryptographically signed credential",
      details: {
        dataHash: currentHash,
        vcDataHash,
        vcIssuedAt,
        expiresAt: vcExpiresAt,
      },
      badge: {
        color: "green",
        icon: "✓",
        text: "Verified",
        tooltip: `Cryptographically verified on ${new Date(vcIssuedAt).toLocaleDateString()}`,
      },
    };
  }

  // Data has been modified
  const changedFields = findChangedFields(currentData, vcData);

  return {
    status: "MODIFIED",
    message: "Data has been modified since credential issuance",
    details: {
      dataHash: currentHash,
      vcDataHash,
      vcIssuedAt,
      dataModifiedAt,
      changedFields,
    },
    badge: {
      color: "yellow",
      icon: "⚠",
      text: "Modified",
      tooltip: `Data changed after verification. Changed: ${changedFields.join(", ")}`,
    },
  };
}

/**
 * Find which fields differ between current data and VC data.
 */
function findChangedFields(
  current: Record<string, unknown>,
  vc: Record<string, unknown>,
  prefix = ""
): string[] {
  const changes: string[] = [];
  const allKeys = new Set([...Object.keys(current), ...Object.keys(vc)]);

  for (const key of allKeys) {
    const currentValue = current[key];
    const vcValue = vc[key];
    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (currentValue === undefined && vcValue !== undefined) {
      changes.push(`${fieldPath} (removed)`);
    } else if (currentValue !== undefined && vcValue === undefined) {
      changes.push(`${fieldPath} (added)`);
    } else if (typeof currentValue === "object" && typeof vcValue === "object") {
      if (Array.isArray(currentValue) && Array.isArray(vcValue)) {
        if (JSON.stringify(currentValue) !== JSON.stringify(vcValue)) {
          changes.push(fieldPath);
        }
      } else if (currentValue && vcValue) {
        changes.push(
          ...findChangedFields(
            currentValue as Record<string, unknown>,
            vcValue as Record<string, unknown>,
            fieldPath
          )
        );
      }
    } else if (currentValue !== vcValue) {
      changes.push(fieldPath);
    }
  }

  return changes;
}

// ============================================================================
// BADGE HTML GENERATION (for Liquid theme)
// ============================================================================

/**
 * Generate HTML for the verification badge.
 * Used by the app proxy to return embeddable HTML.
 */
export function generateBadgeHtml(result: IntegrityResult): string {
  const { badge, status, details } = result;

  const colors: Record<typeof badge.color, { bg: string; text: string; border: string }> = {
    green: { bg: "#dcfce7", text: "#166534", border: "#22c55e" },
    yellow: { bg: "#fef9c3", text: "#854d0e", border: "#eab308" },
    red: { bg: "#fee2e2", text: "#991b1b", border: "#ef4444" },
    gray: { bg: "#f3f4f6", text: "#374151", border: "#9ca3af" },
  };

  const color = colors[badge.color];

  return `
<div class="eurocomply-badge"
     data-status="${status}"
     data-hash="${details.dataHash}"
     style="
       display: inline-flex;
       align-items: center;
       gap: 6px;
       padding: 6px 12px;
       background: ${color.bg};
       color: ${color.text};
       border: 1px solid ${color.border};
       border-radius: 9999px;
       font-family: system-ui, -apple-system, sans-serif;
       font-size: 14px;
       font-weight: 500;
       cursor: help;
     "
     title="${badge.tooltip}">
  <span style="font-size: 16px;">${badge.icon}</span>
  <span>${badge.text}</span>
  ${status === "VERIFIED" ? `
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <path d="M9 12l2 2 4-4"/>
  </svg>
  ` : ""}
</div>
<style>
  .eurocomply-badge:hover {
    opacity: 0.9;
    transform: translateY(-1px);
    transition: all 0.15s ease;
  }
</style>
  `.trim();
}

/**
 * Generate a full verification widget with QR code and badge.
 */
export function generateVerificationWidget(
  result: IntegrityResult,
  qrCodeDataUrl: string,
  verifyUrl: string
): string {
  const { badge, status, message, details } = result;

  return `
<div class="eurocomply-widget" style="
  font-family: system-ui, -apple-system, sans-serif;
  max-width: 320px;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
  background: white;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
">
  <!-- Header -->
  <div style="
    background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
    color: white;
    padding: 16px;
    text-align: center;
  ">
    <div style="font-size: 12px; opacity: 0.9; margin-bottom: 4px;">
      DIGITAL PRODUCT PASSPORT
    </div>
    <div style="font-size: 16px; font-weight: 600;">
      EU ESPR Compliant
    </div>
  </div>

  <!-- QR Code -->
  <div style="padding: 20px; text-align: center; background: #f9fafb;">
    <img src="${qrCodeDataUrl}"
         alt="Verification QR Code"
         style="width: 160px; height: 160px; border-radius: 8px; border: 4px solid white; box-shadow: 0 2px 8px rgba(0,0,0,0.1);"
    />
    <div style="margin-top: 12px; font-size: 12px; color: #6b7280;">
      Scan to verify authenticity
    </div>
  </div>

  <!-- Status Badge -->
  <div style="padding: 16px; border-top: 1px solid #e5e7eb;">
    ${generateBadgeHtml(result)}
    <div style="margin-top: 8px; font-size: 13px; color: #6b7280;">
      ${message}
    </div>
  </div>

  <!-- Details (collapsible) -->
  <details style="padding: 0 16px 16px;">
    <summary style="
      font-size: 13px;
      color: #3b82f6;
      cursor: pointer;
      padding: 8px 0;
    ">
      Technical Details
    </summary>
    <div style="
      font-size: 12px;
      color: #6b7280;
      background: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      margin-top: 8px;
    ">
      <div><strong>Data Hash:</strong> ${details.dataHash}</div>
      ${details.vcDataHash ? `<div><strong>VC Hash:</strong> ${details.vcDataHash}</div>` : ""}
      ${details.vcIssuedAt ? `<div><strong>Issued:</strong> ${new Date(details.vcIssuedAt).toLocaleString()}</div>` : ""}
      ${details.changedFields?.length ? `<div><strong>Changed:</strong> ${details.changedFields.join(", ")}</div>` : ""}
    </div>
  </details>

  <!-- Verify Button -->
  <div style="padding: 0 16px 16px;">
    <a href="${verifyUrl}"
       target="_blank"
       rel="noopener"
       style="
         display: block;
         text-align: center;
         padding: 12px;
         background: #1e40af;
         color: white;
         text-decoration: none;
         border-radius: 8px;
         font-weight: 500;
         font-size: 14px;
       ">
      Verify Credential →
    </a>
  </div>

  <!-- Footer -->
  <div style="
    background: #f9fafb;
    padding: 12px 16px;
    text-align: center;
    font-size: 11px;
    color: #9ca3af;
    border-top: 1px solid #e5e7eb;
  ">
    Powered by EuroComply • W3C Verifiable Credential
  </div>
</div>
  `.trim();
}

// ============================================================================
// JSON API RESPONSE
// ============================================================================

/**
 * Generate JSON response for API/AJAX verification.
 */
export function generateVerificationJson(
  result: IntegrityResult,
  verifyUrl: string
): Record<string, unknown> {
  return {
    status: result.status,
    verified: result.status === "VERIFIED",
    message: result.message,
    badge: result.badge,
    details: result.details,
    verifyUrl,
    timestamp: new Date().toISOString(),
  };
}

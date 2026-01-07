/**
 * Certification Verification Service
 *
 * Verifies textile certifications against issuing body databases.
 * Supported certifications:
 * - GOTS (Global Organic Textile Standard)
 * - OEKO-TEX (Standard 100, Made in Green)
 * - GRS (Global Recycled Standard)
 * - OCS (Organic Content Standard)
 *
 * Verification adds credibility to DPP data and can upgrade
 * the confidence level of sustainability claims from
 * "self_declared" to "third_party_verified".
 */

import type { Certification, DataConfidence } from "../types/dpp-schemas";

// ============================================================================
// TYPES
// ============================================================================

export interface VerificationResult {
  valid: boolean;
  status: "valid" | "invalid" | "expired" | "not_found" | "error" | "pending";
  verifiedAt: string;
  expiresAt?: string;
  details?: {
    holderName?: string;
    productScope?: string;
    certificationLevel?: string;
    issuingOffice?: string;
  };
  error?: string;
}

export interface CertificationWithVerification extends Certification {
  verification?: VerificationResult;
}

// ============================================================================
// GOTS VERIFICATION
// ============================================================================

/**
 * GOTS Public Database API
 * https://www.global-standard.org/certification-and-labelling/check-certificate.html
 *
 * Note: In production, use the official GOTS API or web scraping with permission.
 * This implementation shows the expected interface and data structure.
 */
async function verifyGotsCredential(
  certificateNumber: string
): Promise<VerificationResult> {
  // GOTS certificate format: typically starts with certification body code
  // Example: CU 123456, CERES-0123, ECOCERT ICO-12345

  // In production, this would call the GOTS API or database
  // For now, implement pattern validation and mock verification

  // Validate certificate number format
  const gotsPatterns = [
    /^CU\s?\d{5,7}$/i,                    // Control Union
    /^CERES[- ]\d{4,6}$/i,                // CERES
    /^ECOCERT[- ]ICO[- ]\d{4,6}$/i,       // ECOCERT
    /^IMO[- ]\d{4,6}$/i,                  // IMO
    /^OE[- ]\d{4,6}$/i,                   // OneCert
    /^GOTS[- ]\d{4,10}$/i,                // Generic GOTS
  ];

  const isValidFormat = gotsPatterns.some((pattern) =>
    pattern.test(certificateNumber.trim())
  );

  if (!isValidFormat) {
    return {
      valid: false,
      status: "invalid",
      verifiedAt: new Date().toISOString(),
      error: "Certificate number format does not match known GOTS patterns",
    };
  }

  // In production: Call GOTS API
  // const response = await fetch(`https://api.global-standard.org/v1/certificates/${certificateNumber}`);

  // Mock response for development
  // In production, replace with actual API call
  return {
    valid: true,
    status: "pending",
    verifiedAt: new Date().toISOString(),
    details: {
      certificationLevel: "GOTS 6.0",
      issuingOffice: "Certification body verification pending",
    },
    error: "Live verification requires GOTS API access - format validated",
  };
}

// ============================================================================
// OEKO-TEX VERIFICATION
// ============================================================================

/**
 * OEKO-TEX Label Check
 * https://www.oeko-tex.com/en/label-check
 *
 * OEKO-TEX provides a public label check service.
 * Certificate numbers follow specific formats for each standard.
 */
async function verifyOekoTexCredential(
  certificateNumber: string,
  certificationType: string
): Promise<VerificationResult> {
  // OEKO-TEX certificate formats:
  // Standard 100: Format varies by testing institute
  // Examples: SH 12345, N-12345, CQ 12345

  // Made in Green: MIG-12345-XXXXXX (includes production facility code)

  let patterns: RegExp[] = [];

  if (
    certificationType.includes("Standard 100") ||
    certificationType === "OEKO-TEX Standard 100"
  ) {
    patterns = [
      /^[A-Z]{1,3}[- ]?\d{4,8}$/i,          // General format
      /^SH[- ]?\d{4,8}$/i,                   // Hohenstein
      /^N[- ]?\d{4,8}$/i,                    // Various institutes
      /^CQ[- ]?\d{4,8}$/i,                   // Centexbel
      /^\d{2}\.HZG\.\d{5}$/i,                // Another format
    ];
  } else if (
    certificationType.includes("Made in Green") ||
    certificationType === "OEKO-TEX Made in Green"
  ) {
    patterns = [
      /^MIG[- ]?\d{4,8}[- ][A-Z0-9]{4,8}$/i,  // Made in Green format
    ];
  } else {
    // Generic OEKO-TEX
    patterns = [/^[A-Z]{1,4}[- ]?\d{4,10}$/i];
  }

  const isValidFormat = patterns.some((pattern) =>
    pattern.test(certificateNumber.trim())
  );

  if (!isValidFormat) {
    return {
      valid: false,
      status: "invalid",
      verifiedAt: new Date().toISOString(),
      error: `Certificate number format does not match ${certificationType} patterns`,
    };
  }

  // In production: Use OEKO-TEX Label Check
  // The label check is available at: https://www.oeko-tex.com/en/label-check
  // They may have an API for business partners

  return {
    valid: true,
    status: "pending",
    verifiedAt: new Date().toISOString(),
    details: {
      certificationLevel: certificationType,
      issuingOffice: "OEKO-TEX verification pending",
    },
    error: "Live verification requires OEKO-TEX API access - format validated",
  };
}

// ============================================================================
// GRS (GLOBAL RECYCLED STANDARD) VERIFICATION
// ============================================================================

/**
 * GRS Certificate Verification
 * Managed by Textile Exchange
 * https://textileexchange.org/grs-global-recycled-standard/
 */
async function verifyGrsCredential(
  certificateNumber: string
): Promise<VerificationResult> {
  // GRS certificate formats vary by certification body
  // Common formats: GRS-XXX-NNNNNN, CB-GRS-NNNNNN

  const grsPatterns = [
    /^GRS[- ][A-Z]{2,4}[- ]\d{4,8}$/i,
    /^[A-Z]{2,4}[- ]GRS[- ]\d{4,8}$/i,
    /^TE[- ]\d{4,8}$/i,                      // Textile Exchange format
  ];

  const isValidFormat = grsPatterns.some((pattern) =>
    pattern.test(certificateNumber.trim())
  );

  if (!isValidFormat) {
    return {
      valid: false,
      status: "invalid",
      verifiedAt: new Date().toISOString(),
      error: "Certificate number format does not match GRS patterns",
    };
  }

  return {
    valid: true,
    status: "pending",
    verifiedAt: new Date().toISOString(),
    details: {
      certificationLevel: "GRS 4.0",
    },
    error: "Live verification requires Textile Exchange API access - format validated",
  };
}

// ============================================================================
// BLUESIGN VERIFICATION
// ============================================================================

/**
 * Bluesign Certificate Verification
 * https://www.bluesign.com/
 */
async function verifyBluesignCredential(
  certificateNumber: string
): Promise<VerificationResult> {
  // Bluesign formats: BS-XXXXX, BLUESIGN-XXXXX

  const patterns = [
    /^BS[- ]?\d{4,8}$/i,
    /^BLUESIGN[- ]?\d{4,8}$/i,
  ];

  const isValidFormat = patterns.some((pattern) =>
    pattern.test(certificateNumber.trim())
  );

  if (!isValidFormat) {
    return {
      valid: false,
      status: "invalid",
      verifiedAt: new Date().toISOString(),
      error: "Certificate number format does not match Bluesign patterns",
    };
  }

  return {
    valid: true,
    status: "pending",
    verifiedAt: new Date().toISOString(),
    details: {
      certificationLevel: "Bluesign Approved",
    },
    error: "Live verification requires Bluesign API access - format validated",
  };
}

// ============================================================================
// MAIN VERIFICATION FUNCTION
// ============================================================================

/**
 * Verify a certification against the appropriate issuing body database
 */
export async function verifyCertification(
  certification: Certification
): Promise<VerificationResult> {
  const { type, certificateNumber, validFrom, validUntil } = certification;

  // Check if certificate is within validity period
  const now = new Date();
  const validFromDate = new Date(validFrom);
  const validUntilDate = new Date(validUntil);

  if (now < validFromDate) {
    return {
      valid: false,
      status: "invalid",
      verifiedAt: now.toISOString(),
      error: "Certificate is not yet valid",
    };
  }

  if (now > validUntilDate) {
    return {
      valid: false,
      status: "expired",
      verifiedAt: now.toISOString(),
      expiresAt: validUntil,
      error: "Certificate has expired",
    };
  }

  // Route to appropriate verification service
  const certType = type.toUpperCase();

  if (certType.includes("GOTS")) {
    return verifyGotsCredential(certificateNumber);
  }

  if (certType.includes("OEKO-TEX") || certType.includes("OEKO TEX")) {
    return verifyOekoTexCredential(certificateNumber, type);
  }

  if (certType.includes("GRS") || certType.includes("GLOBAL RECYCLED")) {
    return verifyGrsCredential(certificateNumber);
  }

  if (certType.includes("BLUESIGN")) {
    return verifyBluesignCredential(certificateNumber);
  }

  if (certType.includes("OCS") || certType.includes("ORGANIC CONTENT")) {
    // OCS is also managed by Textile Exchange, similar to GRS
    return verifyGrsCredential(certificateNumber);
  }

  // Unknown certification type - basic validation only
  return {
    valid: true,
    status: "pending",
    verifiedAt: now.toISOString(),
    error: `Verification not available for certification type: ${type}`,
  };
}

/**
 * Verify all certifications in a list
 */
export async function verifyAllCertifications(
  certifications: Certification[]
): Promise<CertificationWithVerification[]> {
  const results: CertificationWithVerification[] = [];

  for (const cert of certifications) {
    const verification = await verifyCertification(cert);
    results.push({
      ...cert,
      verified: verification.valid && verification.status === "valid",
      verifiedAt: verification.verifiedAt,
      verification,
    });
  }

  return results;
}

/**
 * Get the confidence level based on certification verification status
 */
export function getCertificationConfidence(
  verification: VerificationResult
): DataConfidence {
  if (verification.status === "valid" && verification.valid) {
    return "third_party_verified";
  }

  if (verification.status === "pending") {
    return "supplier_declared"; // Awaiting verification
  }

  return "self_declared"; // Invalid or not verified
}

// ============================================================================
// CERTIFICATION EXPIRY MONITORING
// ============================================================================

/**
 * Check if a certification is expiring soon
 */
export function isExpiringsSoon(
  validUntil: string,
  daysThreshold: number = 90
): boolean {
  const expiryDate = new Date(validUntil);
  const now = new Date();
  const diffMs = expiryDate.getTime() - now.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays > 0 && diffDays <= daysThreshold;
}

/**
 * Get certification status summary
 */
export function getCertificationStatus(certification: Certification): {
  status: "valid" | "expiring" | "expired" | "not_started";
  daysRemaining?: number;
  message: string;
} {
  const now = new Date();
  const validFromDate = new Date(certification.validFrom);
  const validUntilDate = new Date(certification.validUntil);

  if (now < validFromDate) {
    const daysUntilValid = Math.ceil(
      (validFromDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      status: "not_started",
      daysRemaining: daysUntilValid,
      message: `Certificate becomes valid in ${daysUntilValid} days`,
    };
  }

  if (now > validUntilDate) {
    const daysExpired = Math.ceil(
      (now.getTime() - validUntilDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    return {
      status: "expired",
      message: `Certificate expired ${daysExpired} days ago`,
    };
  }

  const daysRemaining = Math.ceil(
    (validUntilDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysRemaining <= 90) {
    return {
      status: "expiring",
      daysRemaining,
      message: `Certificate expires in ${daysRemaining} days`,
    };
  }

  return {
    status: "valid",
    daysRemaining,
    message: `Certificate valid for ${daysRemaining} days`,
  };
}

// ============================================================================
// BATCH VERIFICATION FOR WEBHOOKS/CRON
// ============================================================================

/**
 * Structure for batch verification results
 */
export interface BatchVerificationResult {
  total: number;
  valid: number;
  invalid: number;
  expired: number;
  pending: number;
  errors: number;
  certifications: CertificationWithVerification[];
}

/**
 * Batch verify certifications with rate limiting
 */
export async function batchVerifyCertifications(
  certifications: Certification[],
  options: {
    delayMs?: number; // Delay between API calls to respect rate limits
    concurrency?: number; // Max concurrent verifications
  } = {}
): Promise<BatchVerificationResult> {
  const { delayMs = 500 } = options;

  const results: CertificationWithVerification[] = [];
  const summary = {
    total: certifications.length,
    valid: 0,
    invalid: 0,
    expired: 0,
    pending: 0,
    errors: 0,
  };

  for (const cert of certifications) {
    try {
      const verification = await verifyCertification(cert);

      results.push({
        ...cert,
        verified: verification.valid && verification.status === "valid",
        verifiedAt: verification.verifiedAt,
        verification,
      });

      // Update summary
      switch (verification.status) {
        case "valid":
          summary.valid++;
          break;
        case "invalid":
        case "not_found":
          summary.invalid++;
          break;
        case "expired":
          summary.expired++;
          break;
        case "pending":
          summary.pending++;
          break;
        case "error":
          summary.errors++;
          break;
      }

      // Rate limiting delay
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    } catch (error) {
      summary.errors++;
      results.push({
        ...cert,
        verification: {
          valid: false,
          status: "error",
          verifiedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : "Unknown error",
        },
      });
    }
  }

  return {
    ...summary,
    certifications: results,
  };
}

// ============================================================================
// CERTIFICATION TYPE HELPERS
// ============================================================================

/**
 * Get information about a certification type
 */
export function getCertificationInfo(type: string): {
  name: string;
  organization: string;
  website: string;
  scope: string;
  verifiable: boolean;
} | null {
  const certInfo: Record<
    string,
    { name: string; organization: string; website: string; scope: string; verifiable: boolean }
  > = {
    GOTS: {
      name: "Global Organic Textile Standard",
      organization: "Global Standard gGmbH",
      website: "https://www.global-standard.org",
      scope: "Organic fiber processing, environmental and social criteria",
      verifiable: true,
    },
    "OEKO-TEX Standard 100": {
      name: "OEKO-TEX Standard 100",
      organization: "OEKO-TEX Association",
      website: "https://www.oeko-tex.com",
      scope: "Tested for harmful substances",
      verifiable: true,
    },
    "OEKO-TEX Made in Green": {
      name: "OEKO-TEX Made in Green",
      organization: "OEKO-TEX Association",
      website: "https://www.oeko-tex.com",
      scope: "Tested for harmful substances + sustainable production facilities",
      verifiable: true,
    },
    GRS: {
      name: "Global Recycled Standard",
      organization: "Textile Exchange",
      website: "https://textileexchange.org",
      scope: "Recycled content and processing requirements",
      verifiable: true,
    },
    OCS: {
      name: "Organic Content Standard",
      organization: "Textile Exchange",
      website: "https://textileexchange.org",
      scope: "Organic material content verification",
      verifiable: true,
    },
    Bluesign: {
      name: "Bluesign",
      organization: "Bluesign Technologies AG",
      website: "https://www.bluesign.com",
      scope: "Chemical safety and environmental management",
      verifiable: true,
    },
    "Fair Trade": {
      name: "Fair Trade Certified",
      organization: "Fair Trade USA / Fairtrade International",
      website: "https://www.fairtrade.net",
      scope: "Fair wages and working conditions",
      verifiable: true,
    },
    "EU Ecolabel": {
      name: "EU Ecolabel",
      organization: "European Commission",
      website: "https://ec.europa.eu/environment/ecolabel",
      scope: "Environmental performance throughout lifecycle",
      verifiable: true,
    },
    "Cradle to Cradle": {
      name: "Cradle to Cradle Certified",
      organization: "Cradle to Cradle Products Innovation Institute",
      website: "https://www.c2ccertified.org",
      scope: "Material health, circular economy design",
      verifiable: true,
    },
    BCI: {
      name: "Better Cotton Initiative",
      organization: "Better Cotton",
      website: "https://bettercotton.org",
      scope: "Sustainable cotton farming practices",
      verifiable: true,
    },
  };

  return certInfo[type] || null;
}

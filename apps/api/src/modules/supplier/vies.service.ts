/**
 * VIES VAT Verification Service
 * Instant VAT number verification via EU VIES API
 */

import { prisma } from '@eurocomply/database';

// EU country codes that support VIES
const EU_COUNTRY_CODES = [
  'AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'EL', 'ES',
  'FI', 'FR', 'HR', 'HU', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT',
  'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK', 'XI', // XI = Northern Ireland
];

interface ViesResponse {
  valid: boolean;
  countryCode?: string;
  vatNumber?: string;
  name?: string;
  address?: string;
  error?: string;
}

/**
 * Verify a VAT number using the EU VIES API
 */
export async function verifyVatNumber(vatNumber: string): Promise<ViesResponse> {
  // Clean and normalize VAT number
  const cleanVat = vatNumber.replace(/[\s.-]/g, '').toUpperCase();

  // Extract country code (first 2 characters)
  const countryCode = cleanVat.substring(0, 2);
  const number = cleanVat.substring(2);

  // Validate country code
  if (!EU_COUNTRY_CODES.includes(countryCode)) {
    return {
      valid: false,
      error: `Invalid country code: ${countryCode}. VIES only supports EU member states.`,
    };
  }

  // Validate VAT number format (basic check)
  if (number.length < 5 || number.length > 15) {
    return {
      valid: false,
      error: 'Invalid VAT number format. Number should be between 5 and 15 characters.',
    };
  }

  try {
    // Use EU VIES REST API
    const response = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${countryCode}/vat/${number}`,
      {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    if (!response.ok) {
      // Handle specific error codes
      if (response.status === 400) {
        return {
          valid: false,
          error: 'Invalid VAT number format',
        };
      }
      if (response.status === 404) {
        return {
          valid: false,
          error: 'VAT number not found in VIES database',
        };
      }
      if (response.status === 503) {
        return {
          valid: false,
          error: 'VIES service temporarily unavailable. Please try again later.',
        };
      }

      return {
        valid: false,
        error: `VIES API error: ${response.status}`,
      };
    }

    const data = await response.json() as {
      isValid?: boolean;
      countryCode?: string;
      vatNumber?: string;
      name?: string;
      address?: string;
    };

    return {
      valid: data.isValid === true,
      countryCode: data.countryCode,
      vatNumber: data.vatNumber,
      name: data.name,
      address: data.address,
    };
  } catch (error: any) {
    console.error('VIES verification error:', error);

    return {
      valid: false,
      error: error.message || 'Failed to connect to VIES service',
    };
  }
}

/**
 * Verify VAT and update supplier if valid (instant verification path)
 */
export async function verifySupplierVat(
  supplierId: string,
  vatNumber: string
): Promise<{ verified: boolean; companyName?: string; error?: string }> {
  // First, verify the VAT number
  const viesResult = await verifyVatNumber(vatNumber);

  if (!viesResult.valid) {
    return {
      verified: false,
      error: viesResult.error || 'VAT number is not valid',
    };
  }

  // Check if supplier exists and is in correct state
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { verificationStatus: true },
  });

  if (!supplier) {
    return {
      verified: false,
      error: 'Supplier not found',
    };
  }

  // Only allow verification if PENDING or REJECTED
  if (!['PENDING', 'REJECTED'].includes(supplier.verificationStatus)) {
    return {
      verified: false,
      error: `Cannot verify when status is ${supplier.verificationStatus}`,
    };
  }

  // Update supplier with verified status
  const updateData: Record<string, any> = {
    vatNumber: vatNumber.replace(/[\s.-]/g, '').toUpperCase(),
    verificationStatus: 'VERIFIED',
    verificationMethod: 'VIES_AUTO',
    verifiedAt: new Date(),
    verificationDocs: {
      viesVerification: {
        verifiedAt: new Date().toISOString(),
        vatNumber: viesResult.vatNumber,
        countryCode: viesResult.countryCode,
        name: viesResult.name,
        address: viesResult.address,
      },
    },
  };

  // Only update company name if returned from VIES
  if (viesResult.name) {
    updateData.companyName = viesResult.name;
  }

  await prisma.supplier.update({
    where: { id: supplierId },
    data: updateData,
  });

  const result: { verified: boolean; companyName?: string; error?: string } = {
    verified: true,
  };
  if (viesResult.name) {
    result.companyName = viesResult.name;
  }
  return result;
}

/**
 * Check if a country supports VIES verification
 */
export function supportsViesVerification(countryCode: string): boolean {
  return EU_COUNTRY_CODES.includes(countryCode.toUpperCase());
}

/**
 * Get list of EU countries that support VIES
 */
export function getSupportedCountries(): string[] {
  return [...EU_COUNTRY_CODES];
}

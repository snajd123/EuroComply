/**
 * Product Metafields Service
 *
 * Syncs DPP data to Shopify product metafields for:
 * 1. Theme display (Liquid access)
 * 2. Data integrity verification (hash comparison)
 * 3. Customer-facing sustainability information
 *
 * Metafield Namespace: eurocomply
 *
 * Keys:
 * - dpp_id: DPP identifier
 * - data_hash: Hash of current DPP data
 * - vc_hash: Hash of VC-signed data (immutable after issuance)
 * - vc_issued_at: When the VC was issued
 * - vc_status: verified | modified | pending | revoked
 * - fiber_composition: JSON array of fiber data
 * - carbon_footprint: Carbon footprint value
 * - certifications: JSON array of certifications
 * - care_instructions: Care instruction summary
 * - manufacturer: Manufacturer name and country
 */

import { computeDataHash } from "./data-integrity.server";
import type { TextileDppData } from "../types/dpp-schemas";

interface AdminGraphQL {
  (query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

interface DppMetafieldData {
  dppId: string;
  productName: string;
  dataHash: string;
  vcHash?: string;
  vcIssuedAt?: string;
  vcStatus: "verified" | "modified" | "pending" | "revoked";
  fiberComposition?: Array<{ fiberType: string; percentage: number; origin: string }>;
  carbonFootprint?: { value: number; unit: string; methodology: string };
  certifications?: Array<{ type: string; certificateNumber: string }>;
  careInstructions?: string;
  manufacturer?: string;
  countryOfManufacture?: string;
  recyclability?: number;
  verifyUrl: string;
}

/**
 * Update product metafields with DPP data
 */
export async function updateProductDppMetafields(
  admin: AdminGraphQL,
  productId: string,
  data: DppMetafieldData
): Promise<void> {
  const metafields = [
    { key: "dpp_id", value: data.dppId, type: "single_line_text_field" },
    { key: "data_hash", value: data.dataHash, type: "single_line_text_field" },
    { key: "vc_status", value: data.vcStatus, type: "single_line_text_field" },
    { key: "verify_url", value: data.verifyUrl, type: "url" },
  ];

  // Optional fields
  if (data.vcHash) {
    metafields.push({ key: "vc_hash", value: data.vcHash, type: "single_line_text_field" });
  }
  if (data.vcIssuedAt) {
    metafields.push({ key: "vc_issued_at", value: data.vcIssuedAt, type: "date_time" });
  }
  if (data.fiberComposition) {
    metafields.push({
      key: "fiber_composition",
      value: JSON.stringify(data.fiberComposition),
      type: "json",
    });
  }
  if (data.carbonFootprint) {
    metafields.push({
      key: "carbon_footprint",
      value: JSON.stringify(data.carbonFootprint),
      type: "json",
    });
    // Also store as simple number for easy Liquid access
    metafields.push({
      key: "carbon_footprint_value",
      value: data.carbonFootprint.value.toString(),
      type: "number_decimal",
    });
  }
  if (data.certifications && data.certifications.length > 0) {
    metafields.push({
      key: "certifications",
      value: JSON.stringify(data.certifications),
      type: "json",
    });
    // Also store count for easy badge display
    metafields.push({
      key: "certification_count",
      value: data.certifications.length.toString(),
      type: "number_integer",
    });
  }
  if (data.careInstructions) {
    metafields.push({
      key: "care_instructions",
      value: data.careInstructions,
      type: "multi_line_text_field",
    });
  }
  if (data.manufacturer) {
    metafields.push({
      key: "manufacturer",
      value: data.manufacturer,
      type: "single_line_text_field",
    });
  }
  if (data.countryOfManufacture) {
    metafields.push({
      key: "country_of_manufacture",
      value: data.countryOfManufacture,
      type: "single_line_text_field",
    });
  }
  if (data.recyclability !== undefined) {
    metafields.push({
      key: "recyclability",
      value: data.recyclability.toString(),
      type: "number_integer",
    });
  }

  // Build mutations for all metafields
  const metafieldInputs = metafields.map((mf) => ({
    namespace: "eurocomply",
    key: mf.key,
    value: mf.value,
    type: mf.type,
  }));

  await admin(
    `
    mutation UpdateProductMetafields($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      variables: {
        input: {
          id: `gid://shopify/Product/${productId}`,
          metafields: metafieldInputs,
        },
      },
    }
  );
}

/**
 * Transform TextileDppData to metafield format
 */
export function transformDppToMetafields(
  dppId: string,
  dppData: TextileDppData,
  vcInfo?: {
    hash: string;
    issuedAt: string;
    status: "verified" | "modified" | "pending" | "revoked";
  }
): DppMetafieldData {
  const dataHash = computeDataHash(dppData);

  // Generate care instructions summary
  const care = dppData.careInstructions;
  let careText = "";
  if (care) {
    const parts = [];
    if (care.maxWashTemperature !== null) {
      parts.push(`Wash at ${care.maxWashTemperature}°C max`);
    } else {
      parts.push("Do not wash");
    }
    if (!care.bleachAllowed) parts.push("No bleach");
    if (!care.tumbleDryAllowed) parts.push("No tumble dry");
    if (care.ironTemperature !== "none") {
      parts.push(`Iron on ${care.ironTemperature}`);
    }
    careText = parts.join(". ");
    if (care.specialInstructions) {
      careText += `. ${care.specialInstructions}`;
    }
  }

  const verifyUrl = `${process.env.EUROCOMPLY_PUBLIC_URL || "https://verify.eurocomply.eu"}/dpp/${dppId}`;

  return {
    dppId,
    productName: dppData.manufacturer?.name || "Unknown",
    dataHash,
    vcHash: vcInfo?.hash,
    vcIssuedAt: vcInfo?.issuedAt,
    vcStatus: vcInfo?.status || "pending",
    fiberComposition: dppData.fiberComposition.map((f) => ({
      fiberType: f.fiberType,
      percentage: f.percentage,
      origin: f.origin,
    })),
    carbonFootprint: dppData.carbonFootprint
      ? {
          value: dppData.carbonFootprint.value,
          unit: dppData.carbonFootprint.unit,
          methodology: dppData.carbonFootprint.methodology,
        }
      : undefined,
    certifications: dppData.certifications?.map((c) => ({
      type: c.type,
      certificateNumber: c.certificateNumber,
    })),
    careInstructions: careText || undefined,
    manufacturer: `${dppData.manufacturer.name} (${dppData.manufacturer.country})`,
    countryOfManufacture: dppData.countryOfManufacture,
    recyclability: dppData.recyclability?.recyclablePercentage,
    verifyUrl,
  };
}

/**
 * Get DPP metafields from a product
 */
export async function getProductDppMetafields(
  admin: AdminGraphQL,
  productId: string
): Promise<DppMetafieldData | null> {
  const response = await admin(
    `
    query GetProductMetafields($id: ID!) {
      product(id: $id) {
        metafields(namespace: "eurocomply", first: 20) {
          edges {
            node {
              key
              value
              type
            }
          }
        }
      }
    }
  `,
    {
      variables: {
        id: `gid://shopify/Product/${productId}`,
      },
    }
  );

  const data = await response.json();
  const metafields = data.data?.product?.metafields?.edges || [];

  if (metafields.length === 0) return null;

  const mfMap: Record<string, string> = {};
  for (const edge of metafields) {
    mfMap[edge.node.key] = edge.node.value;
  }

  if (!mfMap.dpp_id) return null;

  return {
    dppId: mfMap.dpp_id,
    productName: mfMap.product_name || "",
    dataHash: mfMap.data_hash || "",
    vcHash: mfMap.vc_hash,
    vcIssuedAt: mfMap.vc_issued_at,
    vcStatus: (mfMap.vc_status as any) || "pending",
    fiberComposition: mfMap.fiber_composition ? JSON.parse(mfMap.fiber_composition) : undefined,
    carbonFootprint: mfMap.carbon_footprint ? JSON.parse(mfMap.carbon_footprint) : undefined,
    certifications: mfMap.certifications ? JSON.parse(mfMap.certifications) : undefined,
    careInstructions: mfMap.care_instructions,
    manufacturer: mfMap.manufacturer,
    countryOfManufacture: mfMap.country_of_manufacture,
    recyclability: mfMap.recyclability ? parseInt(mfMap.recyclability) : undefined,
    verifyUrl: mfMap.verify_url || "",
  };
}

/**
 * Mark a product's DPP as modified (data changed after VC issuance)
 */
export async function markDppAsModified(
  admin: AdminGraphQL,
  productId: string,
  newDataHash: string
): Promise<void> {
  await admin(
    `
    mutation UpdateProductMetafields($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      variables: {
        input: {
          id: `gid://shopify/Product/${productId}`,
          metafields: [
            {
              namespace: "eurocomply",
              key: "data_hash",
              value: newDataHash,
              type: "single_line_text_field",
            },
            {
              namespace: "eurocomply",
              key: "vc_status",
              value: "modified",
              type: "single_line_text_field",
            },
          ],
        },
      },
    }
  );
}

/**
 * Mark a product's DPP as verified (after VC issuance)
 */
export async function markDppAsVerified(
  admin: AdminGraphQL,
  productId: string,
  dataHash: string,
  vcIssuedAt: string
): Promise<void> {
  await admin(
    `
    mutation UpdateProductMetafields($input: ProductInput!) {
      productUpdate(input: $input) {
        product {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `,
    {
      variables: {
        input: {
          id: `gid://shopify/Product/${productId}`,
          metafields: [
            {
              namespace: "eurocomply",
              key: "data_hash",
              value: dataHash,
              type: "single_line_text_field",
            },
            {
              namespace: "eurocomply",
              key: "vc_hash",
              value: dataHash, // At issuance, both hashes are the same
              type: "single_line_text_field",
            },
            {
              namespace: "eurocomply",
              key: "vc_status",
              value: "verified",
              type: "single_line_text_field",
            },
            {
              namespace: "eurocomply",
              key: "vc_issued_at",
              value: vcIssuedAt,
              type: "date_time",
            },
          ],
        },
      },
    }
  );
}

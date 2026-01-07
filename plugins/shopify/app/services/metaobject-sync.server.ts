/**
 * Metaobject Sync Service
 *
 * Synchronizes DPP data between Shopify Metaobjects and EuroComply's
 * Verifiable Credential layer. This enables a hybrid architecture where:
 * - Shopify Metaobjects = Source of truth for editable data
 * - EuroComply = Immutable VC layer with cryptographic proof
 *
 * Sync Flow:
 * 1. Merchant edits data in Shopify Admin (or app)
 * 2. Data is saved to Metaobjects
 * 3. Sync service pushes to EuroComply
 * 4. EuroComply issues/updates Verifiable Credential
 * 5. Credential ID stored back in Metaobject
 */

import type {
  TextileDppData,
  FiberComposition,
  CareInstructions,
  ManufacturerInfo,
  HazardousSubstances,
  Certification,
  CarbonFootprint,
} from "../types/dpp-schemas";
import { createEuroComplyClient } from "./eurocomply.server";
import prisma from "../db.server";

interface AdminGraphQL {
  (query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

interface ShopSettings {
  eurocomplyApiKey: string;
  eurocomplyOrgId: string;
}

// ============================================================================
// METAOBJECT -> DPP DATA TRANSFORMATION
// ============================================================================

interface MetaobjectDppData {
  id: string;
  handle: string;
  product_name: string;
  shopify_product_id: string;
  country_of_manufacture: string;

  // Fiber composition (from linked metaobjects)
  fibers: Array<{
    id: string;
    fiber_type: string;
    percentage: number;
    origin: string;
    country_of_origin?: string;
    supplier_name?: string;
  }>;

  // Manufacturer (from linked metaobject)
  manufacturer: {
    id: string;
    name: string;
    country: string;
    address?: string;
    registration_number?: string;
    website?: string;
  };

  // Care instructions
  max_wash_temperature?: number;
  bleach_allowed: boolean;
  tumble_dry_allowed: boolean;
  iron_temperature: string;
  dry_clean_allowed: boolean;
  special_care_instructions?: string;

  // Hazardous substances
  reach_compliant: boolean;
  scip_notification_id?: string;

  // Certifications (from linked metaobjects)
  certifications?: Array<{
    id: string;
    type: string;
    certificate_number: string;
    issuing_body: string;
    valid_from: string;
    valid_until: string;
    scope?: string;
    document_url?: string;
  }>;

  // Carbon footprint
  carbon_footprint_value?: number;
  carbon_footprint_methodology?: string;
  carbon_footprint_scope?: string;

  // Recyclability
  recyclable_percentage?: number;
  end_of_life_instructions?: string;

  // Durability
  expected_lifespan_years?: number;
  warranty_years?: number;

  // Sync status
  eurocomply_dpp_id?: string;
  vc_issued?: boolean;
  last_synced_at?: string;
}

/**
 * Transform Metaobject data into TextileDppData format
 */
export function transformMetaobjectToDppData(
  metaobject: MetaobjectDppData
): TextileDppData {
  // Transform fiber composition
  const fiberComposition: FiberComposition[] = metaobject.fibers.map((fiber) => ({
    fiberType: fiber.fiber_type as FiberComposition["fiberType"],
    percentage: fiber.percentage,
    origin: fiber.origin as FiberComposition["origin"],
    countryOfOrigin: fiber.country_of_origin,
    supplierName: fiber.supplier_name,
  }));

  // Transform manufacturer
  const manufacturer: ManufacturerInfo = {
    name: metaobject.manufacturer.name,
    country: metaobject.manufacturer.country,
    address: metaobject.manufacturer.address,
    registrationNumber: metaobject.manufacturer.registration_number,
    website: metaobject.manufacturer.website,
  };

  // Transform care instructions
  const careInstructions: CareInstructions = {
    maxWashTemperature: metaobject.max_wash_temperature ?? null,
    bleachAllowed: metaobject.bleach_allowed,
    tumbleDryAllowed: metaobject.tumble_dry_allowed,
    ironTemperature: metaobject.iron_temperature as CareInstructions["ironTemperature"],
    dryCleanAllowed: metaobject.dry_clean_allowed,
    specialInstructions: metaobject.special_care_instructions,
  };

  // Transform hazardous substances
  const hazardousSubstances: HazardousSubstances = {
    reachCompliant: metaobject.reach_compliant,
    substancesOfConcern: [],
    scipNotificationId: metaobject.scip_notification_id,
  };

  // Transform certifications
  const certifications: Certification[] | undefined = metaobject.certifications?.map(
    (cert) => ({
      type: cert.type,
      certificateNumber: cert.certificate_number,
      issuingBody: cert.issuing_body,
      validFrom: cert.valid_from,
      validUntil: cert.valid_until,
      scope: cert.scope,
      documentUrl: cert.document_url,
    })
  );

  // Transform carbon footprint
  const carbonFootprint: CarbonFootprint | undefined = metaobject.carbon_footprint_value
    ? {
        value: metaobject.carbon_footprint_value,
        unit: "kgCO2e",
        methodology:
          (metaobject.carbon_footprint_methodology as CarbonFootprint["methodology"]) ||
          "other",
        scope:
          (metaobject.carbon_footprint_scope as CarbonFootprint["scope"]) ||
          "cradle_to_gate",
        dataSource: "shopify_sync",
        confidence: "self_declared",
      }
    : undefined;

  return {
    category: "textile",
    fiberComposition,
    countryOfManufacture: metaobject.country_of_manufacture,
    manufacturer,
    careInstructions,
    hazardousSubstances,
    certifications,
    carbonFootprint,
    recyclability: metaobject.recyclable_percentage
      ? {
          recyclablePercentage: metaobject.recyclable_percentage,
          recyclableComponents: [],
          endOfLifeInstructions:
            metaobject.end_of_life_instructions || "Check local recycling guidelines",
        }
      : undefined,
    durability: metaobject.expected_lifespan_years
      ? {
          expectedLifespanYears: metaobject.expected_lifespan_years,
          warrantyYears: metaobject.warranty_years,
        }
      : undefined,
  };
}

// ============================================================================
// METAOBJECT QUERY & FETCH
// ============================================================================

/**
 * Fetch a textile DPP metaobject with all related data
 */
export async function fetchDppMetaobject(
  admin: AdminGraphQL,
  metaobjectId: string
): Promise<MetaobjectDppData | null> {
  const response = await admin(
    `
    query GetDppMetaobject($id: ID!) {
      metaobject(id: $id) {
        id
        handle
        fields {
          key
          value
          reference {
            ... on Metaobject {
              id
              type
              fields {
                key
                value
              }
            }
          }
          references(first: 20) {
            nodes {
              ... on Metaobject {
                id
                type
                fields {
                  key
                  value
                }
              }
            }
          }
        }
      }
    }
  `,
    {
      variables: { id: metaobjectId },
    }
  );

  const data = await response.json();
  const metaobject = data.data?.metaobject;

  if (!metaobject) return null;

  // Parse fields into structured data
  const fields = metaobject.fields.reduce(
    (acc: Record<string, any>, field: any) => {
      if (field.reference) {
        // Single reference
        acc[field.key] = parseMetaobjectFields(field.reference);
      } else if (field.references?.nodes?.length > 0) {
        // List of references
        acc[field.key] = field.references.nodes.map(parseMetaobjectFields);
      } else {
        // Scalar value
        acc[field.key] = parseFieldValue(field.key, field.value);
      }
      return acc;
    },
    {} as Record<string, any>
  );

  return {
    id: metaobject.id,
    handle: metaobject.handle,
    product_name: fields.product_name,
    shopify_product_id: fields.shopify_product,
    country_of_manufacture: fields.country_of_manufacture,
    fibers: fields.fiber_composition || [],
    manufacturer: fields.manufacturer || { name: "", country: "" },
    max_wash_temperature: fields.max_wash_temperature,
    bleach_allowed: fields.bleach_allowed ?? false,
    tumble_dry_allowed: fields.tumble_dry_allowed ?? false,
    iron_temperature: fields.iron_temperature || "none",
    dry_clean_allowed: fields.dry_clean_allowed ?? false,
    special_care_instructions: fields.special_care_instructions,
    reach_compliant: fields.reach_compliant ?? true,
    scip_notification_id: fields.scip_notification_id,
    certifications: fields.certifications,
    carbon_footprint_value: fields.carbon_footprint_value,
    carbon_footprint_methodology: fields.carbon_footprint_methodology,
    carbon_footprint_scope: fields.carbon_footprint_scope,
    recyclable_percentage: fields.recyclable_percentage,
    end_of_life_instructions: fields.end_of_life_instructions,
    expected_lifespan_years: fields.expected_lifespan_years,
    warranty_years: fields.warranty_years,
    eurocomply_dpp_id: fields.eurocomply_dpp_id,
    vc_issued: fields.vc_issued,
    last_synced_at: fields.last_synced_at,
  };
}

function parseMetaobjectFields(metaobject: any): Record<string, any> {
  if (!metaobject?.fields) return {};

  const result: Record<string, any> = { id: metaobject.id };

  for (const field of metaobject.fields) {
    result[field.key] = parseFieldValue(field.key, field.value);
  }

  return result;
}

function parseFieldValue(key: string, value: string | null): any {
  if (value === null || value === undefined) return undefined;

  // Boolean fields
  if (
    key.endsWith("_allowed") ||
    key === "reach_compliant" ||
    key === "vc_issued" ||
    key === "verified"
  ) {
    return value === "true";
  }

  // Number fields
  if (
    key === "percentage" ||
    key.endsWith("_percentage") ||
    key.endsWith("_years") ||
    key.endsWith("_temperature") ||
    key.endsWith("_value")
  ) {
    const num = parseFloat(value);
    return isNaN(num) ? undefined : num;
  }

  return value;
}

// ============================================================================
// SYNC OPERATIONS
// ============================================================================

/**
 * Sync a Metaobject DPP to EuroComply
 * This creates or updates the DPP and issues a new Verifiable Credential
 */
export async function syncMetaobjectToEuroComply(
  admin: AdminGraphQL,
  shop: string,
  metaobjectId: string
): Promise<{
  success: boolean;
  dppId?: string;
  credentialId?: string;
  error?: string;
}> {
  // Get shop settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
    return { success: false, error: "EuroComply not configured" };
  }

  const eurocomply = createEuroComplyClient({
    eurocomplyApiKey: settings.eurocomplyApiKey,
    eurocomplyOrgId: settings.eurocomplyOrgId,
  });

  if (!eurocomply) {
    return { success: false, error: "Failed to create EuroComply client" };
  }

  try {
    // Fetch the metaobject data
    const metaobjectData = await fetchDppMetaobject(admin, metaobjectId);

    if (!metaobjectData) {
      return { success: false, error: "Metaobject not found" };
    }

    // Transform to DPP data
    const dppData = transformMetaobjectToDppData(metaobjectData);

    // Create full DPP in EuroComply
    const result = await eurocomply.createFullDpp({
      productName: metaobjectData.product_name,
      category: "textile",
      data: dppData,
      shopifyProductId: metaobjectData.shopify_product_id,
    });

    // Update metaobject with sync status
    await updateMetaobjectSyncStatus(admin, metaobjectId, {
      eurocomply_dpp_id: result.dpp.id,
      vc_issued: true,
      last_synced_at: new Date().toISOString(),
    });

    // Update local sync record
    await prisma.productSync.upsert({
      where: {
        shop_shopifyProductId: {
          shop,
          shopifyProductId: metaobjectData.shopify_product_id,
        },
      },
      create: {
        shop,
        shopifyProductId: metaobjectData.shopify_product_id,
        syncStatus: "synced",
        eurocomplyDppId: result.dpp.id,
      },
      update: {
        syncStatus: "synced",
        eurocomplyDppId: result.dpp.id,
        lastSyncedAt: new Date(),
        errorMessage: null,
      },
    });

    return {
      success: true,
      dppId: result.dpp.id,
      credentialId: result.dpp.credentialId,
    };
  } catch (error) {
    console.error("Sync error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Update metaobject sync status fields
 */
async function updateMetaobjectSyncStatus(
  admin: AdminGraphQL,
  metaobjectId: string,
  status: {
    eurocomply_dpp_id?: string;
    vc_issued?: boolean;
    last_synced_at?: string;
  }
): Promise<void> {
  const fields = [];

  if (status.eurocomply_dpp_id !== undefined) {
    fields.push({ key: "eurocomply_dpp_id", value: status.eurocomply_dpp_id });
  }
  if (status.vc_issued !== undefined) {
    fields.push({ key: "vc_issued", value: status.vc_issued.toString() });
  }
  if (status.last_synced_at !== undefined) {
    fields.push({ key: "last_synced_at", value: status.last_synced_at });
  }

  if (fields.length === 0) return;

  await admin(
    `
    mutation UpdateMetaobject($id: ID!, $metaobject: MetaobjectUpdateInput!) {
      metaobjectUpdate(id: $id, metaobject: $metaobject) {
        metaobject {
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
        id: metaobjectId,
        metaobject: { fields },
      },
    }
  );
}

/**
 * Get all DPP metaobjects for a shop
 */
export async function listDppMetaobjects(
  admin: AdminGraphQL
): Promise<Array<{ id: string; handle: string; productName: string; synced: boolean }>> {
  const response = await admin(`
    query ListDppMetaobjects {
      metaobjects(type: "textile_dpp", first: 50) {
        nodes {
          id
          handle
          fields {
            key
            value
          }
        }
      }
    }
  `);

  const data = await response.json();
  const metaobjects = data.data?.metaobjects?.nodes || [];

  return metaobjects.map((mo: any) => {
    const fields = mo.fields.reduce((acc: Record<string, any>, f: any) => {
      acc[f.key] = f.value;
      return acc;
    }, {});

    return {
      id: mo.id,
      handle: mo.handle,
      productName: fields.product_name || "Unknown",
      synced: fields.vc_issued === "true",
    };
  });
}

/**
 * Create a new DPP metaobject from TextileDppData
 */
export async function createDppMetaobject(
  admin: AdminGraphQL,
  productId: string,
  productName: string,
  dppData: TextileDppData
): Promise<{ success: boolean; metaobjectId?: string; error?: string }> {
  try {
    // First, create manufacturer metaobject
    const manufacturerResponse = await admin(
      `
      mutation CreateManufacturer($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
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
          metaobject: {
            type: "textile_manufacturer",
            fields: [
              { key: "name", value: dppData.manufacturer.name },
              { key: "country", value: dppData.manufacturer.country },
              { key: "address", value: dppData.manufacturer.address || "" },
              {
                key: "registration_number",
                value: dppData.manufacturer.registrationNumber || "",
              },
              { key: "website", value: dppData.manufacturer.website || "" },
            ],
          },
        },
      }
    );

    const manufacturerData = await manufacturerResponse.json();
    const manufacturerId =
      manufacturerData.data?.metaobjectCreate?.metaobject?.id;

    if (!manufacturerId) {
      return {
        success: false,
        error: `Failed to create manufacturer: ${JSON.stringify(
          manufacturerData.data?.metaobjectCreate?.userErrors
        )}`,
      };
    }

    // Create fiber metaobjects
    const fiberIds: string[] = [];
    for (const fiber of dppData.fiberComposition) {
      const fiberResponse = await admin(
        `
        mutation CreateFiber($metaobject: MetaobjectCreateInput!) {
          metaobjectCreate(metaobject: $metaobject) {
            metaobject {
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
            metaobject: {
              type: "textile_fiber",
              fields: [
                { key: "fiber_type", value: fiber.fiberType },
                { key: "percentage", value: fiber.percentage.toString() },
                { key: "origin", value: fiber.origin },
                { key: "country_of_origin", value: fiber.countryOfOrigin || "" },
                { key: "supplier_name", value: fiber.supplierName || "" },
              ],
            },
          },
        }
      );

      const fiberData = await fiberResponse.json();
      const fiberId = fiberData.data?.metaobjectCreate?.metaobject?.id;
      if (fiberId) {
        fiberIds.push(fiberId);
      }
    }

    // Create certification metaobjects
    const certificationIds: string[] = [];
    if (dppData.certifications) {
      for (const cert of dppData.certifications) {
        const certResponse = await admin(
          `
          mutation CreateCertification($metaobject: MetaobjectCreateInput!) {
            metaobjectCreate(metaobject: $metaobject) {
              metaobject {
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
              metaobject: {
                type: "textile_certification",
                fields: [
                  { key: "type", value: cert.type },
                  { key: "certificate_number", value: cert.certificateNumber },
                  { key: "issuing_body", value: cert.issuingBody },
                  { key: "valid_from", value: cert.validFrom },
                  { key: "valid_until", value: cert.validUntil },
                  { key: "scope", value: cert.scope || "" },
                  { key: "document_url", value: cert.documentUrl || "" },
                ],
              },
            },
          }
        );

        const certData = await certResponse.json();
        const certId = certData.data?.metaobjectCreate?.metaobject?.id;
        if (certId) {
          certificationIds.push(certId);
        }
      }
    }

    // Create the main DPP metaobject
    const dppFields = [
      { key: "product_name", value: productName },
      { key: "shopify_product", value: `gid://shopify/Product/${productId}` },
      { key: "fiber_composition", value: JSON.stringify(fiberIds) },
      { key: "country_of_manufacture", value: dppData.countryOfManufacture },
      { key: "manufacturer", value: manufacturerId },
      {
        key: "max_wash_temperature",
        value: dppData.careInstructions.maxWashTemperature?.toString() || "",
      },
      {
        key: "bleach_allowed",
        value: dppData.careInstructions.bleachAllowed.toString(),
      },
      {
        key: "tumble_dry_allowed",
        value: dppData.careInstructions.tumbleDryAllowed.toString(),
      },
      { key: "iron_temperature", value: dppData.careInstructions.ironTemperature },
      {
        key: "dry_clean_allowed",
        value: dppData.careInstructions.dryCleanAllowed.toString(),
      },
      {
        key: "special_care_instructions",
        value: dppData.careInstructions.specialInstructions || "",
      },
      {
        key: "reach_compliant",
        value: dppData.hazardousSubstances.reachCompliant.toString(),
      },
      {
        key: "scip_notification_id",
        value: dppData.hazardousSubstances.scipNotificationId || "",
      },
    ];

    if (certificationIds.length > 0) {
      dppFields.push({
        key: "certifications",
        value: JSON.stringify(certificationIds),
      });
    }

    if (dppData.carbonFootprint) {
      dppFields.push(
        {
          key: "carbon_footprint_value",
          value: dppData.carbonFootprint.value.toString(),
        },
        {
          key: "carbon_footprint_methodology",
          value: dppData.carbonFootprint.methodology,
        },
        { key: "carbon_footprint_scope", value: dppData.carbonFootprint.scope }
      );
    }

    if (dppData.recyclability) {
      dppFields.push(
        {
          key: "recyclable_percentage",
          value: dppData.recyclability.recyclablePercentage.toString(),
        },
        {
          key: "end_of_life_instructions",
          value: dppData.recyclability.endOfLifeInstructions,
        }
      );
    }

    if (dppData.durability) {
      dppFields.push(
        {
          key: "expected_lifespan_years",
          value: dppData.durability.expectedLifespanYears.toString(),
        },
        {
          key: "warranty_years",
          value: dppData.durability.warrantyYears?.toString() || "",
        }
      );
    }

    const dppResponse = await admin(
      `
      mutation CreateDpp($metaobject: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $metaobject) {
          metaobject {
            id
            handle
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
          metaobject: {
            type: "textile_dpp",
            fields: dppFields,
          },
        },
      }
    );

    const dppResponseData = await dppResponse.json();
    const metaobjectId = dppResponseData.data?.metaobjectCreate?.metaobject?.id;

    if (!metaobjectId) {
      return {
        success: false,
        error: `Failed to create DPP: ${JSON.stringify(
          dppResponseData.data?.metaobjectCreate?.userErrors
        )}`,
      };
    }

    return { success: true, metaobjectId };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

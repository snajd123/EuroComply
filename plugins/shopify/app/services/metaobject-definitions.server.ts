/**
 * Shopify Metaobject Definitions for Digital Product Passport Data
 *
 * Creates and manages Metaobject types for storing ESPR-compliant DPP data.
 * This allows merchants to edit DPP data directly in Shopify Admin while
 * maintaining sync with EuroComply's Verifiable Credential layer.
 *
 * Metaobject Structure:
 * - textile_dpp: Main DPP entry linked to product
 * - textile_fiber: Individual fiber composition entries
 * - textile_certification: Certification records
 * - textile_manufacturer: Manufacturer information
 */

interface MetaobjectFieldDefinition {
  key: string;
  name: string;
  description?: string;
  type: string;
  required: boolean;
  validations?: Array<{
    name: string;
    value: string;
  }>;
}

interface MetaobjectTypeDefinition {
  type: string;
  name: string;
  description: string;
  displayNameKey: string;
  fields: MetaobjectFieldDefinition[];
}

// ============================================================================
// METAOBJECT TYPE DEFINITIONS
// ============================================================================

export const TEXTILE_MANUFACTURER_DEFINITION: MetaobjectTypeDefinition = {
  type: "textile_manufacturer",
  name: "Textile Manufacturer",
  description: "Manufacturer information for textile DPPs",
  displayNameKey: "name",
  fields: [
    {
      key: "name",
      name: "Manufacturer Name",
      description: "Legal name of the manufacturer",
      type: "single_line_text_field",
      required: true,
    },
    {
      key: "country",
      name: "Country",
      description: "ISO 3166-1 alpha-2 country code",
      type: "single_line_text_field",
      required: true,
      validations: [
        { name: "min", value: "2" },
        { name: "max", value: "2" },
      ],
    },
    {
      key: "address",
      name: "Address",
      description: "Full address of the manufacturer",
      type: "multi_line_text_field",
      required: false,
    },
    {
      key: "registration_number",
      name: "Registration Number",
      description: "Company/VAT registration number",
      type: "single_line_text_field",
      required: false,
    },
    {
      key: "website",
      name: "Website",
      description: "Manufacturer website URL",
      type: "url",
      required: false,
    },
    {
      key: "did",
      name: "Decentralized Identifier",
      description: "DID for supply chain verification (advanced)",
      type: "single_line_text_field",
      required: false,
    },
  ],
};

export const TEXTILE_FIBER_DEFINITION: MetaobjectTypeDefinition = {
  type: "textile_fiber",
  name: "Textile Fiber",
  description: "Individual fiber composition entry for textile DPPs",
  displayNameKey: "fiber_type",
  fields: [
    {
      key: "fiber_type",
      name: "Fiber Type",
      description: "Type of fiber (e.g., cotton, polyester, wool)",
      type: "single_line_text_field",
      required: true,
      validations: [
        {
          name: "choices",
          value: JSON.stringify([
            "cotton",
            "organic_cotton",
            "linen",
            "hemp",
            "wool",
            "silk",
            "cashmere",
            "bamboo",
            "jute",
            "polyester",
            "recycled_polyester",
            "nylon",
            "recycled_nylon",
            "acrylic",
            "elastane",
            "spandex",
            "viscose",
            "modal",
            "lyocell",
            "tencel",
            "other",
          ]),
        },
      ],
    },
    {
      key: "percentage",
      name: "Percentage",
      description: "Percentage by mass (must sum to 100% across all fibers)",
      type: "number_integer",
      required: true,
      validations: [
        { name: "min", value: "1" },
        { name: "max", value: "100" },
      ],
    },
    {
      key: "origin",
      name: "Origin",
      description: "Source/origin classification of the fiber",
      type: "single_line_text_field",
      required: true,
      validations: [
        {
          name: "choices",
          value: JSON.stringify([
            "conventional",
            "organic",
            "recycled_pre_consumer",
            "recycled_post_consumer",
            "bio_based",
            "unknown",
          ]),
        },
      ],
    },
    {
      key: "country_of_origin",
      name: "Country of Origin",
      description: "Where the fiber was sourced (ISO alpha-2)",
      type: "single_line_text_field",
      required: false,
    },
    {
      key: "supplier_name",
      name: "Supplier Name",
      description: "Name of the fiber supplier",
      type: "single_line_text_field",
      required: false,
    },
  ],
};

export const TEXTILE_CERTIFICATION_DEFINITION: MetaobjectTypeDefinition = {
  type: "textile_certification",
  name: "Textile Certification",
  description: "Third-party certification for textile products",
  displayNameKey: "certificate_number",
  fields: [
    {
      key: "type",
      name: "Certification Type",
      description: "Type of certification (e.g., GOTS, OEKO-TEX)",
      type: "single_line_text_field",
      required: true,
      validations: [
        {
          name: "choices",
          value: JSON.stringify([
            "GOTS",
            "OEKO-TEX Standard 100",
            "OEKO-TEX Made in Green",
            "GRS",
            "OCS",
            "Bluesign",
            "Fair Trade",
            "EU Ecolabel",
            "Cradle to Cradle",
            "BCI",
            "other",
          ]),
        },
      ],
    },
    {
      key: "certificate_number",
      name: "Certificate Number",
      description: "Unique certificate identifier",
      type: "single_line_text_field",
      required: true,
    },
    {
      key: "issuing_body",
      name: "Issuing Body",
      description: "Organization that issued the certificate",
      type: "single_line_text_field",
      required: true,
    },
    {
      key: "valid_from",
      name: "Valid From",
      description: "Certificate validity start date",
      type: "date",
      required: true,
    },
    {
      key: "valid_until",
      name: "Valid Until",
      description: "Certificate expiry date",
      type: "date",
      required: true,
    },
    {
      key: "scope",
      name: "Scope",
      description: "What the certification covers",
      type: "single_line_text_field",
      required: false,
    },
    {
      key: "document_url",
      name: "Certificate Document URL",
      description: "Link to the certificate PDF",
      type: "url",
      required: false,
    },
    {
      key: "verified",
      name: "Verified",
      description: "Has this certificate been verified with the issuing body?",
      type: "boolean",
      required: false,
    },
  ],
};

export const TEXTILE_DPP_DEFINITION: MetaobjectTypeDefinition = {
  type: "textile_dpp",
  name: "Textile Digital Product Passport",
  description: "EU ESPR-compliant Digital Product Passport for textile products",
  displayNameKey: "product_name",
  fields: [
    // Product identification
    {
      key: "product_name",
      name: "Product Name",
      description: "Name of the product",
      type: "single_line_text_field",
      required: true,
    },
    {
      key: "shopify_product",
      name: "Linked Shopify Product",
      description: "Reference to the Shopify product",
      type: "product_reference",
      required: true,
    },

    // Fiber composition (references)
    {
      key: "fiber_composition",
      name: "Fiber Composition",
      description: "List of fibers that make up this product",
      type: "list.metaobject_reference",
      required: true,
      validations: [
        { name: "metaobject_definition_id", value: "$textile_fiber" },
      ],
    },

    // Manufacturing
    {
      key: "country_of_manufacture",
      name: "Country of Manufacture",
      description: "Where the final product was manufactured (ISO alpha-2)",
      type: "single_line_text_field",
      required: true,
    },
    {
      key: "manufacturer",
      name: "Manufacturer",
      description: "Reference to manufacturer information",
      type: "metaobject_reference",
      required: true,
      validations: [
        { name: "metaobject_definition_id", value: "$textile_manufacturer" },
      ],
    },

    // Care instructions
    {
      key: "max_wash_temperature",
      name: "Max Wash Temperature",
      description: "Maximum washing temperature in Celsius (leave empty for do not wash)",
      type: "number_integer",
      required: false,
      validations: [
        { name: "min", value: "0" },
        { name: "max", value: "95" },
      ],
    },
    {
      key: "bleach_allowed",
      name: "Bleach Allowed",
      description: "Can this product be bleached?",
      type: "boolean",
      required: true,
    },
    {
      key: "tumble_dry_allowed",
      name: "Tumble Dry Allowed",
      description: "Can this product be tumble dried?",
      type: "boolean",
      required: true,
    },
    {
      key: "iron_temperature",
      name: "Iron Temperature",
      description: "Maximum ironing temperature setting",
      type: "single_line_text_field",
      required: true,
      validations: [
        {
          name: "choices",
          value: JSON.stringify(["none", "low", "medium", "high"]),
        },
      ],
    },
    {
      key: "dry_clean_allowed",
      name: "Dry Clean Allowed",
      description: "Can this product be dry cleaned?",
      type: "boolean",
      required: true,
    },
    {
      key: "special_care_instructions",
      name: "Special Care Instructions",
      description: "Additional care notes",
      type: "multi_line_text_field",
      required: false,
    },

    // Hazardous substances
    {
      key: "reach_compliant",
      name: "REACH Compliant",
      description: "Complies with EU REACH regulation",
      type: "boolean",
      required: true,
    },
    {
      key: "scip_notification_id",
      name: "SCIP Notification ID",
      description: "ECHA SCIP database notification ID",
      type: "single_line_text_field",
      required: false,
    },

    // Certifications (references)
    {
      key: "certifications",
      name: "Certifications",
      description: "Third-party certifications for this product",
      type: "list.metaobject_reference",
      required: false,
      validations: [
        { name: "metaobject_definition_id", value: "$textile_certification" },
      ],
    },

    // Carbon footprint
    {
      key: "carbon_footprint_value",
      name: "Carbon Footprint (kgCO2e)",
      description: "Total carbon footprint in kg CO2 equivalent",
      type: "number_decimal",
      required: false,
    },
    {
      key: "carbon_footprint_methodology",
      name: "Carbon Footprint Methodology",
      description: "Method used to calculate carbon footprint",
      type: "single_line_text_field",
      required: false,
      validations: [
        {
          name: "choices",
          value: JSON.stringify([
            "PEF",
            "ISO14067",
            "GHG_Protocol",
            "Higg_MSI",
            "other",
          ]),
        },
      ],
    },
    {
      key: "carbon_footprint_scope",
      name: "Carbon Footprint Scope",
      description: "Scope of the carbon footprint calculation",
      type: "single_line_text_field",
      required: false,
      validations: [
        {
          name: "choices",
          value: JSON.stringify([
            "cradle_to_gate",
            "cradle_to_grave",
            "gate_to_gate",
          ]),
        },
      ],
    },

    // Recyclability
    {
      key: "recyclable_percentage",
      name: "Recyclable Percentage",
      description: "Percentage of product that can be recycled",
      type: "number_integer",
      required: false,
      validations: [
        { name: "min", value: "0" },
        { name: "max", value: "100" },
      ],
    },
    {
      key: "end_of_life_instructions",
      name: "End of Life Instructions",
      description: "How to properly dispose or recycle",
      type: "multi_line_text_field",
      required: false,
    },

    // Durability
    {
      key: "expected_lifespan_years",
      name: "Expected Lifespan (Years)",
      description: "Expected product lifespan in years",
      type: "number_integer",
      required: false,
    },
    {
      key: "warranty_years",
      name: "Warranty (Years)",
      description: "Warranty period in years",
      type: "number_integer",
      required: false,
    },

    // EuroComply sync status
    {
      key: "eurocomply_dpp_id",
      name: "EuroComply DPP ID",
      description: "ID of the DPP in EuroComply system",
      type: "single_line_text_field",
      required: false,
    },
    {
      key: "vc_issued",
      name: "Verifiable Credential Issued",
      description: "Has a VC been issued for this DPP?",
      type: "boolean",
      required: false,
    },
    {
      key: "last_synced_at",
      name: "Last Synced",
      description: "When this DPP was last synced with EuroComply",
      type: "date_time",
      required: false,
    },
  ],
};

// ============================================================================
// METAOBJECT CREATION SERVICE
// ============================================================================

interface AdminGraphQL {
  (query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

/**
 * Create all DPP-related metaobject definitions in a Shopify store
 */
export async function createMetaobjectDefinitions(
  admin: AdminGraphQL
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Create in order (dependencies first)
  const definitions = [
    TEXTILE_MANUFACTURER_DEFINITION,
    TEXTILE_FIBER_DEFINITION,
    TEXTILE_CERTIFICATION_DEFINITION,
    TEXTILE_DPP_DEFINITION,
  ];

  const createdIds: Record<string, string> = {};

  for (const definition of definitions) {
    try {
      // Build field definitions for GraphQL
      const fieldDefinitions = definition.fields.map((field) => {
        // Replace placeholder references with actual IDs
        let validations = field.validations;
        if (validations) {
          validations = validations.map((v) => {
            if (v.name === "metaobject_definition_id" && v.value.startsWith("$")) {
              const refType = v.value.substring(1);
              const refId = createdIds[refType];
              if (refId) {
                return { name: v.name, value: refId };
              }
            }
            return v;
          });
        }

        return {
          key: field.key,
          name: field.name,
          description: field.description,
          type: field.type,
          required: field.required,
          validations: validations || [],
        };
      });

      const response = await admin(
        `
        mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
          metaobjectDefinitionCreate(definition: $definition) {
            metaobjectDefinition {
              id
              type
              name
            }
            userErrors {
              field
              message
              code
            }
          }
        }
      `,
        {
          variables: {
            definition: {
              type: definition.type,
              name: definition.name,
              description: definition.description,
              displayNameKey: definition.displayNameKey,
              fieldDefinitions,
            },
          },
        }
      );

      const data = await response.json();
      const result = data.data?.metaobjectDefinitionCreate;

      if (result?.userErrors?.length > 0) {
        // Check if it's just "already exists" error
        const alreadyExists = result.userErrors.some(
          (e: any) => e.code === "TAKEN" || e.message.includes("already exists")
        );

        if (!alreadyExists) {
          errors.push(
            `${definition.type}: ${result.userErrors.map((e: any) => e.message).join(", ")}`
          );
        } else {
          // Fetch existing definition ID
          const existingId = await getMetaobjectDefinitionId(admin, definition.type);
          if (existingId) {
            createdIds[definition.type] = existingId;
          }
        }
      } else if (result?.metaobjectDefinition?.id) {
        createdIds[definition.type] = result.metaobjectDefinition.id;
      }
    } catch (error) {
      errors.push(
        `${definition.type}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

/**
 * Get the ID of an existing metaobject definition by type
 */
export async function getMetaobjectDefinitionId(
  admin: AdminGraphQL,
  type: string
): Promise<string | null> {
  try {
    const response = await admin(
      `
      query GetMetaobjectDefinition($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
        }
      }
    `,
      {
        variables: { type },
      }
    );

    const data = await response.json();
    return data.data?.metaobjectDefinitionByType?.id || null;
  } catch {
    return null;
  }
}

/**
 * Check if all DPP metaobject definitions exist in the store
 */
export async function checkMetaobjectDefinitionsExist(
  admin: AdminGraphQL
): Promise<{ exists: boolean; missing: string[] }> {
  const requiredTypes = [
    "textile_manufacturer",
    "textile_fiber",
    "textile_certification",
    "textile_dpp",
  ];

  const missing: string[] = [];

  for (const type of requiredTypes) {
    const id = await getMetaobjectDefinitionId(admin, type);
    if (!id) {
      missing.push(type);
    }
  }

  return {
    exists: missing.length === 0,
    missing,
  };
}

/**
 * Delete all DPP metaobject definitions (use with caution!)
 */
export async function deleteMetaobjectDefinitions(
  admin: AdminGraphQL
): Promise<{ success: boolean; errors: string[] }> {
  const errors: string[] = [];

  // Delete in reverse order (dependents first)
  const types = [
    "textile_dpp",
    "textile_certification",
    "textile_fiber",
    "textile_manufacturer",
  ];

  for (const type of types) {
    try {
      const id = await getMetaobjectDefinitionId(admin, type);
      if (!id) continue;

      const response = await admin(
        `
        mutation DeleteMetaobjectDefinition($id: ID!) {
          metaobjectDefinitionDelete(id: $id) {
            deletedId
            userErrors {
              field
              message
            }
          }
        }
      `,
        {
          variables: { id },
        }
      );

      const data = await response.json();
      const result = data.data?.metaobjectDefinitionDelete;

      if (result?.userErrors?.length > 0) {
        errors.push(
          `${type}: ${result.userErrors.map((e: any) => e.message).join(", ")}`
        );
      }
    } catch (error) {
      errors.push(
        `${type}: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }

  return {
    success: errors.length === 0,
    errors,
  };
}

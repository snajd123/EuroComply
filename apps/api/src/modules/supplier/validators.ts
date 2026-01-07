/**
 * Supplier Module Validators
 * Zod schemas for request validation
 */

import { z } from 'zod';

// ===========================================
// AUTH VALIDATORS
// ===========================================

export const registerSupplierSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(2, 'Company name is required'),
  country: z.string().length(2, 'Country must be ISO 3166-1 alpha-2 code'),
  website: z.string().url().optional(),
  description: z.string().max(1000).optional(),
});

export const loginSupplierSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const updateSupplierProfileSchema = z.object({
  companyName: z.string().min(2).optional(),
  website: z.string().url().optional().nullable(),
  description: z.string().max(1000).optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  catalogVisibility: z.enum(['PUBLIC', 'PRIVATE', 'INVITE_ONLY']).optional(),
});

// ===========================================
// PRODUCT VALIDATORS
// ===========================================

const fiberCompositionSchema = z.object({
  fiberType: z.string(),
  percentage: z.number().min(0).max(100),
  origin: z.string(),
  country: z.string().optional(),
});

const careInstructionsSchema = z.object({
  maxWashTemperature: z.number().nullable().optional(),
  bleachAllowed: z.boolean(),
  tumbleDryAllowed: z.boolean(),
  ironTemperature: z.enum(['none', 'low', 'medium', 'high']),
  dryCleanAllowed: z.boolean(),
  specialInstructions: z.string().optional(),
});

const manufacturerSchema = z.object({
  name: z.string().min(1),
  country: z.string().length(2),
  address: z.string().optional(),
  registrationNumber: z.string().optional(),
  website: z.string().url().optional(),
});

const hazardousSubstancesSchema = z.object({
  reachCompliant: z.boolean(),
  substancesOfConcern: z.array(z.object({
    name: z.string(),
    casNumber: z.string().optional(),
    concentration: z.string().optional(),
  })).optional(),
  scipNotificationId: z.string().optional(),
});

const certificationSchema = z.object({
  type: z.string(),
  certificateNumber: z.string(),
  issuingBody: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  verificationUrl: z.string().url().optional(),
});

const carbonFootprintSchema = z.object({
  value: z.number(),
  unit: z.literal('kgCO2e'),
  methodology: z.string().optional(),
  scope: z.string().optional(),
  dataSource: z.string().optional(),
  confidence: z.string().optional(),
});

const recyclabilitySchema = z.object({
  recyclablePercentage: z.number().min(0).max(100),
  recyclableComponents: z.array(z.string()).optional(),
  endOfLifeInstructions: z.string().optional(),
});

const durabilitySchema = z.object({
  expectedLifespanYears: z.number().optional(),
  warrantyYears: z.number().optional(),
});

export const textileDppDataSchema = z.object({
  category: z.literal('textile'),
  fiberComposition: z.array(fiberCompositionSchema).min(1),
  countryOfManufacture: z.string().length(2),
  manufacturer: manufacturerSchema,
  careInstructions: careInstructionsSchema,
  hazardousSubstances: hazardousSubstancesSchema,
  certifications: z.array(certificationSchema).optional(),
  carbonFootprint: carbonFootprintSchema.optional(),
  recyclability: recyclabilitySchema.optional(),
  durability: durabilitySchema.optional(),
});

export const createSupplierProductSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  description: z.string().max(2000).optional(),
  category: z.enum(['TEXTILE', 'ELECTRONICS', 'FURNITURE', 'BATTERY', 'OTHER']).default('TEXTILE'),
  imageUrls: z.array(z.string().url()).optional(),
  dppData: textileDppDataSchema, // For now, only textile; extend later
  visibility: z.enum(['DRAFT', 'PUBLISHED']).default('DRAFT'),
  anchorVc: z.boolean().optional(),
});

export const updateSupplierProductSchema = createSupplierProductSchema.partial();

// ===========================================
// CATALOG VALIDATORS
// ===========================================

export const catalogSearchSchema = z.object({
  category: z.enum(['TEXTILE', 'ELECTRONICS', 'FURNITURE', 'BATTERY', 'OTHER']).optional(),
  certification: z.string().optional(),
  search: z.string().optional(),
  supplierCountry: z.string().length(2).optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// ===========================================
// TYPE EXPORTS
// ===========================================

export type RegisterSupplierInput = z.infer<typeof registerSupplierSchema>;
export type LoginSupplierInput = z.infer<typeof loginSupplierSchema>;
export type UpdateSupplierProfileInput = z.infer<typeof updateSupplierProfileSchema>;
export type CreateSupplierProductInput = z.infer<typeof createSupplierProductSchema>;
export type UpdateSupplierProductInput = z.infer<typeof updateSupplierProductSchema>;
export type CatalogSearchInput = z.infer<typeof catalogSearchSchema>;

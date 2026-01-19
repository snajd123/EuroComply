import { z } from 'zod';
import { DEFAULT_HASH_ALGORITHM } from './constants.js';

// ============================================
// RFC3161 TIMESTAMP TYPES
// ============================================

export const TimestampRequestSchema = z.object({
  hash: z.string().regex(/^[a-f0-9]{64}$/i, 'Must be SHA-256 hex string'),
  hashAlgorithm: z.literal(DEFAULT_HASH_ALGORITHM),
});

export type TimestampRequest = z.infer<typeof TimestampRequestSchema>;

export const TimestampResponseSchema = z.object({
  type: z.literal('RFC3161'),
  timestamp: z.string().datetime(),
  authority: z.string().url(),
  token: z.string(), // Base64 encoded DER
  hashAlgorithm: z.literal(DEFAULT_HASH_ALGORITHM),
});

export type TimestampResponse = z.infer<typeof TimestampResponseSchema>;

// ============================================
// TSA CONFIGURATION
// ============================================

export const TsaConfigSchema = z.object({
  url: z.string().url(),
  name: z.string(),
  timeout: z.number().default(10000),
  // Optional authentication
  username: z.string().optional(),
  password: z.string().optional(),
  // For client certificate auth
  certPath: z.string().optional(),
  keyPath: z.string().optional(),
});

export type TsaConfig = z.infer<typeof TsaConfigSchema>;

// ============================================
// KNOWN TSA PROVIDERS
// ============================================

export const TSA_PROVIDERS = {
  FREETSA: {
    url: 'https://freetsa.org/tsr',
    name: 'FreeTSA',
  },
  DIGICERT: {
    url: 'https://timestamp.digicert.com',
    name: 'DigiCert',
  },
  SECTIGO: {
    url: 'https://timestamp.sectigo.com',
    name: 'Sectigo',
  },
} as const;

export type TsaProvider = keyof typeof TSA_PROVIDERS;

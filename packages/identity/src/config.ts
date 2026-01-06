/**
 * Identity Configuration
 */

export interface IdentityConfig {
  // walt.id API endpoints
  waltid: {
    coreApi: string;
    signatoryApi: string;
    custodianApi: string;
    auditorApi: string;
  };

  // DID configuration
  did: {
    method: 'web' | 'ebsi';
    domain: string; // e.g., "eurocomply.io"
  };

  // Feature flags
  features: {
    fallbackToSimulation: boolean; // Use simulated credentials if walt.id unavailable
  };
}

export const defaultConfig: IdentityConfig = {
  waltid: {
    coreApi: process.env.WALTID_CORE_API || 'http://localhost:7000',
    signatoryApi: process.env.WALTID_SIGNATORY_API || 'http://localhost:7001',
    custodianApi: process.env.WALTID_CUSTODIAN_API || 'http://localhost:7002',
    auditorApi: process.env.WALTID_AUDITOR_API || 'http://localhost:7003',
  },
  did: {
    method: (process.env.DID_METHOD as 'web' | 'ebsi') || 'web',
    domain: process.env.PLATFORM_DOMAIN || 'eurocomply.io',
  },
  features: {
    fallbackToSimulation: process.env.NODE_ENV !== 'production',
  },
};

let currentConfig: IdentityConfig = { ...defaultConfig };

export function getConfig(): IdentityConfig {
  return currentConfig;
}

export function setConfig(config: Partial<IdentityConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...config,
    waltid: { ...currentConfig.waltid, ...config.waltid },
    did: { ...currentConfig.did, ...config.did },
    features: { ...currentConfig.features, ...config.features },
  };
}

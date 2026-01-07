/**
 * Identity Service Logic Tests
 * Tests for DID and Verifiable Credential business logic
 * These tests cover the pure logic without requiring walt.id adapter
 */

import { describe, it, expect } from 'vitest';

// ===========================================
// DID FORMAT TESTS
// ===========================================

describe('DID Format', () => {
  describe('did:web format', () => {
    function buildDidWeb(domain: string, path?: string): string {
      if (path) {
        return `did:web:${domain}:${path.replace(/\//g, ':')}`;
      }
      return `did:web:${domain}`;
    }

    it('should build platform DID', () => {
      const did = buildDidWeb('eurocomply.eu');
      expect(did).toBe('did:web:eurocomply.eu');
    });

    it('should build merchant DID with path', () => {
      const did = buildDidWeb('eurocomply.eu', 'm/acme-corp');
      expect(did).toBe('did:web:eurocomply.eu:m:acme-corp');
    });

    it('should convert slashes to colons in path', () => {
      const did = buildDidWeb('eurocomply.eu', 'organizations/123/merchants/456');
      expect(did).toBe('did:web:eurocomply.eu:organizations:123:merchants:456');
    });

    it('should handle subdomain', () => {
      const did = buildDidWeb('api.eurocomply.eu');
      expect(did).toBe('did:web:api.eurocomply.eu');
    });
  });

  describe('did:web resolution URL', () => {
    function didToUrl(did: string): string {
      const parts = did.replace('did:web:', '').split(':');
      const domain = parts[0];
      const path = parts.slice(1).join('/');

      if (path) {
        return `https://${domain}/${path}/did.json`;
      }
      return `https://${domain}/.well-known/did.json`;
    }

    it('should resolve platform DID to .well-known', () => {
      const url = didToUrl('did:web:eurocomply.eu');
      expect(url).toBe('https://eurocomply.eu/.well-known/did.json');
    });

    it('should resolve merchant DID to path', () => {
      const url = didToUrl('did:web:eurocomply.eu:m:acme-corp');
      expect(url).toBe('https://eurocomply.eu/m/acme-corp/did.json');
    });

    it('should handle deep paths', () => {
      const url = didToUrl('did:web:eurocomply.eu:organizations:123');
      expect(url).toBe('https://eurocomply.eu/organizations/123/did.json');
    });
  });

  describe('Product URN format', () => {
    function buildProductUrn(gtin: string): string {
      return `urn:gtin:${gtin}`;
    }

    it('should build URN from GTIN-13', () => {
      const urn = buildProductUrn('8076800195057');
      expect(urn).toBe('urn:gtin:8076800195057');
    });

    it('should build URN from GTIN-14', () => {
      const urn = buildProductUrn('10614141000415');
      expect(urn).toBe('urn:gtin:10614141000415');
    });
  });
});

// ===========================================
// DID DOCUMENT STRUCTURE TESTS
// ===========================================

describe('DID Document Structure', () => {
  interface DidDocument {
    '@context': string[];
    id: string;
    verificationMethod?: Array<{
      id: string;
      type: string;
      controller: string;
      publicKeyJwk?: object;
    }>;
    authentication?: string[];
    assertionMethod?: string[];
    service?: Array<{
      id: string;
      type: string;
      serviceEndpoint: string;
    }>;
  }

  function createDidDocument(did: string, keyId: string): DidDocument {
    return {
      '@context': [
        'https://www.w3.org/ns/did/v1',
        'https://w3id.org/security/suites/jws-2020/v1',
      ],
      id: did,
      verificationMethod: [
        {
          id: `${did}#${keyId}`,
          type: 'JsonWebKey2020',
          controller: did,
          publicKeyJwk: {},
        },
      ],
      authentication: [`${did}#${keyId}`],
      assertionMethod: [`${did}#${keyId}`],
    };
  }

  it('should create valid DID document', () => {
    const doc = createDidDocument('did:web:eurocomply.eu', 'key-1');

    expect(doc.id).toBe('did:web:eurocomply.eu');
    expect(doc['@context']).toContain('https://www.w3.org/ns/did/v1');
  });

  it('should reference key in verification methods', () => {
    const doc = createDidDocument('did:web:eurocomply.eu', 'key-1');

    expect(doc.verificationMethod?.[0]?.id).toBe('did:web:eurocomply.eu#key-1');
    expect(doc.authentication).toContain('did:web:eurocomply.eu#key-1');
    expect(doc.assertionMethod).toContain('did:web:eurocomply.eu#key-1');
  });

  it('should use JsonWebKey2020 type', () => {
    const doc = createDidDocument('did:web:eurocomply.eu', 'key-1');

    expect(doc.verificationMethod?.[0]?.type).toBe('JsonWebKey2020');
  });

  it('should set controller to the DID', () => {
    const doc = createDidDocument('did:web:eurocomply.eu', 'key-1');

    expect(doc.verificationMethod?.[0]?.controller).toBe('did:web:eurocomply.eu');
  });
});

// ===========================================
// VERIFIABLE CREDENTIAL STRUCTURE TESTS
// ===========================================

describe('Verifiable Credential Structure', () => {
  interface VerifiableCredential {
    '@context': string[];
    id: string;
    type: string[];
    issuer: string;
    issuanceDate: string;
    expirationDate?: string;
    credentialSubject: Record<string, unknown>;
  }

  function createCredential(
    issuerDid: string,
    subjectDid: string,
    type: string,
    claims: Record<string, unknown>,
    expirationDate?: Date
  ): VerifiableCredential {
    return {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
      ],
      id: `urn:uuid:${crypto.randomUUID()}`,
      type: ['VerifiableCredential', type],
      issuer: issuerDid,
      issuanceDate: new Date().toISOString(),
      expirationDate: expirationDate?.toISOString(),
      credentialSubject: {
        id: subjectDid,
        ...claims,
      },
    };
  }

  it('should create valid credential structure', () => {
    const cred = createCredential(
      'did:web:eurocomply.eu',
      'urn:gtin:8076800195057',
      'DigitalProductPassport',
      { productName: 'Test Product' }
    );

    expect(cred.type).toContain('VerifiableCredential');
    expect(cred.type).toContain('DigitalProductPassport');
    expect(cred.issuer).toBe('did:web:eurocomply.eu');
  });

  it('should include W3C context', () => {
    const cred = createCredential(
      'did:web:eurocomply.eu',
      'did:web:merchant.com',
      'KYBVerification',
      {}
    );

    expect(cred['@context']).toContain('https://www.w3.org/2018/credentials/v1');
  });

  it('should set credential subject ID', () => {
    const cred = createCredential(
      'did:web:eurocomply.eu',
      'urn:gtin:12345678901234',
      'DigitalProductPassport',
      { productName: 'Widget' }
    );

    expect(cred.credentialSubject.id).toBe('urn:gtin:12345678901234');
  });

  it('should include claims in subject', () => {
    const cred = createCredential(
      'did:web:eurocomply.eu',
      'urn:gtin:12345678901234',
      'DigitalProductPassport',
      {
        productName: 'Widget',
        manufacturerName: 'ACME Corp',
        carbonFootprint: { value: 3.5, unit: 'kgCO2e' },
      }
    );

    expect(cred.credentialSubject.productName).toBe('Widget');
    expect(cred.credentialSubject.manufacturerName).toBe('ACME Corp');
  });

  it('should handle optional expiration date', () => {
    const withExpiry = createCredential(
      'did:web:eurocomply.eu',
      'did:web:merchant.com',
      'KYBVerification',
      {},
      new Date('2025-12-31')
    );

    const withoutExpiry = createCredential(
      'did:web:eurocomply.eu',
      'did:web:merchant.com',
      'KYBVerification',
      {}
    );

    expect(withExpiry.expirationDate).toBeDefined();
    expect(withoutExpiry.expirationDate).toBeUndefined();
  });

  it('should generate unique credential IDs', () => {
    const cred1 = createCredential('did:web:a', 'did:web:b', 'Type', {});
    const cred2 = createCredential('did:web:a', 'did:web:b', 'Type', {});

    expect(cred1.id).not.toBe(cred2.id);
  });
});

// ===========================================
// CREDENTIAL TYPES TESTS
// ===========================================

describe('Credential Types', () => {
  const CredentialTypes = {
    DIGITAL_PRODUCT_PASSPORT: 'DigitalProductPassport',
    KYB_VERIFICATION: 'KYBVerificationCredential',
    EMPLOYEE_ID: 'EmployeeIdCredential',
    DIPLOMA: 'DiplomaCredential',
    DSA_TRADER_VERIFICATION: 'DSATraderVerificationCredential',
    PROFESSIONAL_LICENSE: 'ProfessionalLicenseCredential',
    TRAINING_CERTIFICATE: 'TrainingCertificateCredential',
  };

  it('should have DPP credential type', () => {
    expect(CredentialTypes.DIGITAL_PRODUCT_PASSPORT).toBe('DigitalProductPassport');
  });

  it('should have KYB credential type', () => {
    expect(CredentialTypes.KYB_VERIFICATION).toBe('KYBVerificationCredential');
  });

  it('should have employee credential type', () => {
    expect(CredentialTypes.EMPLOYEE_ID).toBe('EmployeeIdCredential');
  });

  it('should have distinct type names', () => {
    const types = Object.values(CredentialTypes);
    const uniqueTypes = new Set(types);
    expect(uniqueTypes.size).toBe(types.length);
  });
});

// ===========================================
// JWT STRUCTURE TESTS
// ===========================================

describe('JWT Structure', () => {
  function createMockJwt(header: object, payload: object, signature: string): string {
    const headerBase64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${headerBase64}.${payloadBase64}.${signature}`;
  }

  function parseJwt(jwt: string): { header: object; payload: object } | null {
    const parts = jwt.split('.');
    if (parts.length !== 3) return null;

    try {
      const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
      const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
      return { header, payload };
    } catch {
      return null;
    }
  }

  it('should create valid JWT structure', () => {
    const jwt = createMockJwt(
      { alg: 'ES256', typ: 'JWT' },
      { vc: { type: ['VerifiableCredential'] } },
      'mock_signature'
    );

    const parts = jwt.split('.');
    expect(parts).toHaveLength(3);
  });

  it('should parse JWT correctly', () => {
    const jwt = createMockJwt(
      { alg: 'ES256', typ: 'JWT' },
      { sub: 'did:web:example.com', iat: 1600000000 },
      'sig'
    );

    const parsed = parseJwt(jwt);

    expect(parsed?.header).toEqual({ alg: 'ES256', typ: 'JWT' });
    expect(parsed?.payload).toEqual({ sub: 'did:web:example.com', iat: 1600000000 });
  });

  it('should handle invalid JWT format', () => {
    expect(parseJwt('invalid')).toBeNull();
    expect(parseJwt('only.two')).toBeNull();
    expect(parseJwt('too.many.parts.here')).toBeNull();
  });

  it('should handle malformed base64', () => {
    expect(parseJwt('!!!.@@@.###')).toBeNull();
  });
});

// ===========================================
// REVOCATION LOGIC TESTS
// ===========================================

describe('Revocation Logic', () => {
  interface RevocationEntry {
    credentialId: string;
    revokedAt: Date;
    reason?: string;
  }

  class RevocationRegistry {
    private registry = new Map<string, RevocationEntry>();

    revoke(credentialId: string, reason?: string): void {
      this.registry.set(credentialId, {
        credentialId,
        revokedAt: new Date(),
        reason,
      });
    }

    isRevoked(credentialId: string): boolean {
      return this.registry.has(credentialId);
    }

    getRevocationInfo(credentialId: string): RevocationEntry | undefined {
      return this.registry.get(credentialId);
    }
  }

  it('should track revoked credentials', () => {
    const registry = new RevocationRegistry();

    expect(registry.isRevoked('cred_123')).toBe(false);

    registry.revoke('cred_123');

    expect(registry.isRevoked('cred_123')).toBe(true);
  });

  it('should store revocation reason', () => {
    const registry = new RevocationRegistry();

    registry.revoke('cred_123', 'Fraudulent activity detected');

    const info = registry.getRevocationInfo('cred_123');
    expect(info?.reason).toBe('Fraudulent activity detected');
  });

  it('should store revocation timestamp', () => {
    const registry = new RevocationRegistry();
    const before = new Date();

    registry.revoke('cred_123');

    const after = new Date();
    const info = registry.getRevocationInfo('cred_123');

    expect(info?.revokedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(info?.revokedAt.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it('should not affect other credentials', () => {
    const registry = new RevocationRegistry();

    registry.revoke('cred_123');

    expect(registry.isRevoked('cred_123')).toBe(true);
    expect(registry.isRevoked('cred_456')).toBe(false);
  });
});

// ===========================================
// CREDENTIAL EXPIRATION TESTS
// ===========================================

describe('Credential Expiration Logic', () => {
  function isExpired(expirationDate?: string): boolean {
    if (!expirationDate) return false;
    return new Date(expirationDate) < new Date();
  }

  function daysUntilExpiry(expirationDate?: string): number | null {
    if (!expirationDate) return null;
    const expiry = new Date(expirationDate);
    const now = new Date();
    const diffMs = expiry.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  it('should detect expired credentials', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(isExpired(pastDate)).toBe(true);
  });

  it('should accept valid credentials', () => {
    const futureDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    expect(isExpired(futureDate)).toBe(false);
  });

  it('should handle no expiration date', () => {
    expect(isExpired(undefined)).toBe(false);
  });

  it('should calculate days until expiry', () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const days = daysUntilExpiry(futureDate);

    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(31);
  });

  it('should return null for no expiration', () => {
    expect(daysUntilExpiry(undefined)).toBeNull();
  });

  it('should return negative for expired', () => {
    const pastDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const days = daysUntilExpiry(pastDate);

    expect(days).toBeLessThan(0);
  });
});

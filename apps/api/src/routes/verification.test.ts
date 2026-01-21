import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { MikroORM, EntityManager } from '@mikro-orm/postgresql';

// Mock rate limiter
vi.mock('../middleware/rate-limit.js', () => ({
  verificationRateLimiter: vi.fn(async (_c, next) => next()),
}));

// Mock services with class-based mocks
const mockGenerateStatusListCredential = vi.fn().mockResolvedValue({ id: 'status-list' });
const mockVerifySealedArtifact = vi.fn().mockResolvedValue({ valid: true });
const mockVerifySignaturesOnly = vi.fn().mockResolvedValue({ valid: true });

vi.mock('../services/verification.service.js', () => {
  return {
    VerificationService: vi.fn(() => ({
      verifySealedArtifact: mockVerifySealedArtifact,
      verifySignaturesOnly: mockVerifySignaturesOnly,
    })),
  };
});

vi.mock('../services/status-list.service.js', () => {
  return {
    StatusList2021Service: vi.fn(() => ({
      generateStatusListCredential: mockGenerateStatusListCredential,
    })),
  };
});

vi.mock('../services/timestamp.service.js', () => ({
  TimestampService: {
    forProvider: vi.fn().mockReturnValue({}),
  },
}));

vi.mock('@eurocomply/walt-id', () => ({
  createWaltIdClient: vi.fn().mockReturnValue({}),
}));

vi.mock('../lib/logger.js', () => ({
  loggers: {
    verification: {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    },
  },
}));

vi.mock('../lib/schemas.js', () => ({
  VerifyArtifactBodySchema: {},
  VerifySignatureBodySchema: {},
  validateBody: vi.fn().mockReturnValue({ success: true, data: { artifact: {} } }),
}));

// Import after mocks are set up (static import)
import { verification, setVerificationRouteOrm, resetVerificationRouteOrm } from './verification.js';

describe('verification routes', () => {
  let app: Hono;
  let mockOrm: MikroORM;
  let mockEm: EntityManager;

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset route state before each test
    resetVerificationRouteOrm();

    // Create mock EntityManager
    mockEm = {
      findOne: vi.fn(),
      fork: vi.fn().mockReturnThis(),
    } as unknown as EntityManager;

    // Create mock ORM that returns a forkable em
    mockOrm = {
      em: {
        fork: vi.fn().mockReturnValue(mockEm),
      },
    } as unknown as MikroORM;

    // Create new Hono app with verification routes
    app = new Hono();
    app.route('/api/v1/verify', verification);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('service initialization', () => {
    it('should export setVerificationRouteOrm function', () => {
      expect(typeof setVerificationRouteOrm).toBe('function');
    });

    it('should accept MikroORM instance via setVerificationRouteOrm', () => {
      expect(() => setVerificationRouteOrm(mockOrm)).not.toThrow();
    });
  });

  describe('GET /api/v1/verify/status/:orgId', () => {
    it('should use em.findOne to lookup organization DID', async () => {
      setVerificationRouteOrm(mockOrm);

      // Mock finding the org DID
      (mockEm.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        did: 'did:key:z6MkOrg123',
        organizationId: 'org_123',
        validFrom: new Date(),
        validTo: null,
        revokedAt: null,
      });

      const res = await app.request('/api/v1/verify/status/org_123');

      // Verify em.findOne was called
      expect(mockEm.findOne).toHaveBeenCalled();
      expect(res.status).toBe(200);
    });

    it('should return 404 when organization DID not found', async () => {
      setVerificationRouteOrm(mockOrm);
      (mockEm.findOne as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const res = await app.request('/api/v1/verify/status/org_nonexistent');
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBeDefined();
    });

    it('should return 404 when ORM not initialized', async () => {
      // Don't call setVerificationRouteOrm

      const res = await app.request('/api/v1/verify/status/org_123');
      const body = await res.json();

      expect(res.status).toBe(404);
    });

    it('should query OrgDidHistory with correct filter', async () => {
      setVerificationRouteOrm(mockOrm);

      (mockEm.findOne as ReturnType<typeof vi.fn>).mockResolvedValue({
        did: 'did:key:z6MkOrg123',
        organizationId: 'org_123',
        validFrom: new Date(),
        validTo: null,
        revokedAt: null,
      });

      await app.request('/api/v1/verify/status/org_123');

      // Verify the query filter matches MikroORM pattern
      expect(mockEm.findOne).toHaveBeenCalledWith(
        expect.anything(), // OrgDidHistory entity
        expect.objectContaining({
          organizationId: 'org_123',
          validTo: null,
          revokedAt: null,
        }),
        expect.objectContaining({
          orderBy: { validFrom: 'desc' },
        })
      );
    });
  });

  describe('StatusList2021Service instantiation', () => {
    it('should pass EntityManager to StatusList2021Service constructor', async () => {
      const { StatusList2021Service } = await import('../services/status-list.service.js');

      setVerificationRouteOrm(mockOrm);

      // The service should have been instantiated with EntityManager
      expect(StatusList2021Service).toHaveBeenCalledWith(expect.anything());
    });
  });
});

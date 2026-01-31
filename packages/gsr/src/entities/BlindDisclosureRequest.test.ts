import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MikroORM, EntityManager } from '@mikro-orm/postgresql';
import { setupGsrTestDb, teardownGsrTestDb, clearGsrTestDb, isDatabaseAvailable } from '../test-utils.js';
import { BlindDisclosureRequest } from './BlindDisclosureRequest.js';
import { UnresolvedSubstance, UnresolvedSource } from './UnresolvedSubstance.js';
import { UnresolvedStatus } from '../enums/UnresolvedStatus.js';
import { DisclosureStatus } from '../enums/DisclosureStatus.js';
import { AttestationType } from '../enums/AttestationType.js';

const dbAvailable = await isDatabaseAvailable();

describe('BlindDisclosureRequest', () => {
  let orm: MikroORM;
  let em: EntityManager;
  let unresolved: UnresolvedSubstance;

  beforeAll(async () => {
    if (dbAvailable) {
      orm = await setupGsrTestDb();
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      await teardownGsrTestDb();
    }
  });

  beforeEach(async () => {
    if (dbAvailable) {
      await clearGsrTestDb(orm.em);
      em = orm.em.fork();

      unresolved = em.create(UnresolvedSubstance, {
        rawName: 'Proprietary Additive Z',
        source: UnresolvedSource.CUSTOMER_UPLOAD,
        status: UnresolvedStatus.DISCLOSURE_REQUESTED,
      });
      await em.persistAndFlush(unresolved);
    }
  });

  it.skipIf(!dbAvailable)('should create disclosure request', async () => {
    const request = em.create(BlindDisclosureRequest, {
      unresolvedSubstance: unresolved,
      supplierId: 'supplier_123',
      productId: 'product_456',
      requestedBy: 'compliance@company.com',
      status: DisclosureStatus.PENDING,
      secureToken: 'abc123xyz',
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    await em.persistAndFlush(request);
    em.clear();

    const found = await em.findOne(BlindDisclosureRequest, { supplierId: 'supplier_123' });
    expect(found).toBeTruthy();
    expect(found!.status).toBe(DisclosureStatus.PENDING);
    expect(found!.secureToken).toBe('abc123xyz');
  });

  it.skipIf(!dbAvailable)('should track disclosure completion', async () => {
    const request = em.create(BlindDisclosureRequest, {
      unresolvedSubstance: unresolved,
      supplierId: 'supplier_123',
      requestedBy: 'admin@company.com',
      status: DisclosureStatus.DISCLOSED,
      secureToken: 'token123',
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      disclosedCasNumber: 'encrypted:abc123',
      disclosedAt: new Date(),
      attestationType: AttestationType.FULL_DISCLOSURE,
    });

    await em.persistAndFlush(request);
    em.clear();

    const found = await em.findOne(BlindDisclosureRequest, { supplierId: 'supplier_123' });
    expect(found!.status).toBe(DisclosureStatus.DISCLOSED);
    expect(found!.disclosedCasNumber).toBe('encrypted:abc123');
    expect(found!.attestationType).toBe(AttestationType.FULL_DISCLOSURE);
  });

  it.skipIf(!dbAvailable)('should track attestation without disclosure', async () => {
    const request = em.create(BlindDisclosureRequest, {
      unresolvedSubstance: unresolved,
      supplierId: 'supplier_456',
      requestedBy: 'compliance@company.com',
      status: DisclosureStatus.ATTESTED,
      secureToken: 'token456',
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      attestationType: AttestationType.COMPLIANT_ATTESTATION,
      attestationDocument: 's3://bucket/attestations/doc123.pdf',
    });

    await em.persistAndFlush(request);
    em.clear();

    const found = await em.findOne(BlindDisclosureRequest, { supplierId: 'supplier_456' });
    expect(found!.status).toBe(DisclosureStatus.ATTESTED);
    expect(found!.attestationType).toBe(AttestationType.COMPLIANT_ATTESTATION);
    expect(found!.attestationDocument).toBe('s3://bucket/attestations/doc123.pdf');
  });
});

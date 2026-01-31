// packages/gsr/src/clients/pubchem.client.test.ts
import { describe, it, expect, beforeAll } from 'vitest';
import { PubChemClient } from './pubchem.client.js';

describe('PubChemClient', () => {
  let client: PubChemClient;

  beforeAll(() => {
    client = new PubChemClient();
  });

  describe('getCidByCas', () => {
    it(
      'should_return_cid_when_cas_number_is_valid',
      async () => {
        // Formaldehyde - stable, well-known compound
        const cid = await client.getCidByCas('50-00-0');
        expect(cid).toBe(712);
      },
      10000,
    );

    it(
      'should_return_null_when_cas_number_not_found',
      async () => {
        const cid = await client.getCidByCas('999-99-9');
        expect(cid).toBeNull();
      },
      10000,
    );
  });

  describe('getCompoundProperties', () => {
    it(
      'should_return_properties_when_cid_is_valid',
      async () => {
        const props = await client.getCompoundProperties(712);
        expect(props).toBeDefined();
        expect(props?.smiles).toBe('C=O');
        expect(props?.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
        expect(props?.molecularWeight).toBeCloseTo(30.03, 1);
      },
      10000,
    );

    it(
      'should_return_null_when_cid_not_found',
      async () => {
        const props = await client.getCompoundProperties(999999999999);
        expect(props).toBeNull();
      },
      10000,
    );
  });

  describe('getEnrichmentData', () => {
    it(
      'should_return_enrichment_data_for_valid_cas',
      async () => {
        const data = await client.getEnrichmentData('50-00-0');
        expect(data).toBeDefined();
        expect(data?.cid).toBe(712);
        expect(data?.smiles).toBe('C=O');
        expect(data?.inchiKey).toBe('WSFSSNUMVMOOMR-UHFFFAOYSA-N');
        expect(data?.molecularFormula).toBe('CH2O');
        expect(data?.molecularWeight).toBeCloseTo(30.03, 1);
      },
      15000,
    );
  });

  describe.skipIf(process.env.CI)('rate limiting', () => {
    it(
      'should_not_exceed_5_requests_per_second',
      async () => {
        const start = Date.now();
        const promises = Array(10).fill(null).map(() => client.getCidByCas('50-00-0'));
        await Promise.all(promises);
        const elapsed = Date.now() - start;
        // 10 requests at 5 req/sec should take at least 1.8 seconds (with some tolerance)
        expect(elapsed).toBeGreaterThanOrEqual(1800);
      },
      30000,
    );
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { createSubstancesRouter, type SubstancesRepository, type SubstanceData, type SubstanceAliasData } from './substances.js';

describe('Substances Router', () => {
  let app: Hono;
  let mockRepo: SubstancesRepository;

  const testSubstances: SubstanceData[] = [
    {
      id: '1',
      casNumber: '127-19-5',
      ecNumber: '204-826-4',
      primaryName: 'N,N-Dimethylacetamide',
      isSvhc: true,
      requiresAuthorization: true,
      isRestricted: false,
      isActive: true,
    },
    {
      id: '2',
      casNumber: '7439-92-1',
      primaryName: 'Lead',
      isSvhc: true,
      requiresAuthorization: false,
      isRestricted: true,
      isActive: true,
    },
    {
      id: '3',
      casNumber: '7732-18-5',
      primaryName: 'Water',
      isSvhc: false,
      requiresAuthorization: false,
      isRestricted: false,
      isActive: true,
    },
  ];

  const testAliases: SubstanceAliasData[] = [
    { id: 'a1', substanceId: '1', name: 'DMAC', type: 'COMMON', language: 'en' },
    { id: 'a2', substanceId: '1', name: 'Dimethylacetamide', type: 'SYNONYM', language: 'en' },
  ];

  beforeEach(() => {
    mockRepo = {
      findAll: vi.fn().mockResolvedValue(testSubstances),
      findByCasNumber: vi.fn().mockImplementation(async (cas) => {
        return testSubstances.find(s => s.casNumber === cas) ?? null;
      }),
      findAliases: vi.fn().mockResolvedValue(testAliases),
      findRegulated: vi.fn().mockResolvedValue(testSubstances.filter(s => s.isSvhc || s.isRestricted)),
    };

    app = new Hono();
    app.route('/substances', createSubstancesRouter(mockRepo));
  });

  describe('GET /substances', () => {
    it('should return all substances', async () => {
      const res = await app.request('/substances');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.data).toHaveLength(3);
      expect(body.meta.total).toBe(3);
    });

    it('should filter by SVHC status', async () => {
      mockRepo.findAll = vi.fn().mockResolvedValue(testSubstances.filter(s => s.isSvhc));

      const res = await app.request('/substances?svhc=true');
      expect(res.status).toBe(200);

      expect(mockRepo.findAll).toHaveBeenCalledWith(expect.objectContaining({ svhc: true }));
    });

    it('should filter by restricted status', async () => {
      mockRepo.findAll = vi.fn().mockResolvedValue(testSubstances.filter(s => s.isRestricted));

      const res = await app.request('/substances?restricted=true');
      expect(res.status).toBe(200);

      expect(mockRepo.findAll).toHaveBeenCalledWith(expect.objectContaining({ restricted: true }));
    });

    it('should search by name', async () => {
      mockRepo.findAll = vi.fn().mockResolvedValue([testSubstances[0]]);

      const res = await app.request('/substances?search=dimethyl');
      expect(res.status).toBe(200);

      expect(mockRepo.findAll).toHaveBeenCalledWith(expect.objectContaining({ search: 'dimethyl' }));
    });
  });

  describe('GET /substances/regulated', () => {
    it('should return all regulated substances', async () => {
      const res = await app.request('/substances/regulated');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.data.length).toBe(2); // DMAC and Lead
      expect(mockRepo.findRegulated).toHaveBeenCalled();
    });
  });

  describe('GET /substances/:casNumber', () => {
    it('should return a substance by CAS number', async () => {
      const res = await app.request('/substances/127-19-5');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.data.casNumber).toBe('127-19-5');
      expect(body.data.primaryName).toBe('N,N-Dimethylacetamide');
    });

    it('should return 404 for unknown CAS number', async () => {
      const res = await app.request('/substances/9999-99-9');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /substances/:casNumber/aliases', () => {
    it('should return aliases for a substance', async () => {
      const res = await app.request('/substances/127-19-5/aliases');
      expect(res.status).toBe(200);

      const body = await res.json() as any;
      expect(body.data).toHaveLength(2);
      expect(body.data.map((a: any) => a.name)).toContain('DMAC');
    });

    it('should return 404 for unknown substance', async () => {
      const res = await app.request('/substances/9999-99-9/aliases');
      expect(res.status).toBe(404);
    });
  });
});

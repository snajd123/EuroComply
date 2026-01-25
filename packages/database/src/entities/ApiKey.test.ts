import { describe, it, expect } from 'vitest';
import { ApiKey } from './ApiKey.js';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

describe('ApiKey entity', () => {
  describe('workspace authority fields', () => {
    it('has designAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.designAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has operationsAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.operationsAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has marketingAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.marketingAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has complianceAuthority defaulting to NONE', () => {
      const apiKey = new ApiKey();
      expect(apiKey.complianceAuthority).toBe(WorkspaceAuthority.NONE);
    });

    it('has isOrgAdmin defaulting to false', () => {
      const apiKey = new ApiKey();
      expect(apiKey.isOrgAdmin).toBe(false);
    });
  });
});

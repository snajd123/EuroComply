import { describe, it, expect } from 'vitest';
import { WorkspaceAuthority } from '../entities/WorkspaceAuthority.js';
import type { ValidateApiKeyResult } from './api-key.service.js';

describe('ValidateApiKeyResult interface', () => {
  it('includes workspace authority fields in type definition', () => {
    // This is a compile-time check - if the interface is wrong, TypeScript will fail
    const result: ValidateApiKeyResult = {
      valid: true,
      organizationId: 'org_123',
      schemaName: 'tenant_test',
      apiKeyId: 'key_123',
      designAuthority: WorkspaceAuthority.EDITOR,
      operationsAuthority: WorkspaceAuthority.VIEWER,
      marketingAuthority: WorkspaceAuthority.NONE,
      complianceAuthority: WorkspaceAuthority.NONE,
      isOrgAdmin: false,
    };

    expect(result.designAuthority).toBe(WorkspaceAuthority.EDITOR);
    expect(result.apiKeyId).toBe('key_123');
    expect(result.isOrgAdmin).toBe(false);
  });
});

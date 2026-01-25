import { describe, it, expect } from 'vitest';
import { WorkspaceAuthority } from '../entities/WorkspaceAuthority.js';
import type { ValidateApiKeyResult, CreateApiKeyOptions } from './api-key.service.js';

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

describe('CreateApiKeyOptions interface', () => {
  it('accepts name only (minimal options)', () => {
    const options: CreateApiKeyOptions = {
      name: 'My API Key',
    };

    expect(options.name).toBe('My API Key');
    expect(options.designAuthority).toBeUndefined();
  });

  it('accepts all authority fields', () => {
    const options: CreateApiKeyOptions = {
      name: 'Full Permissions Key',
      designAuthority: WorkspaceAuthority.MANAGER,
      operationsAuthority: WorkspaceAuthority.EDITOR,
      marketingAuthority: WorkspaceAuthority.CONTRIBUTOR,
      complianceAuthority: WorkspaceAuthority.VIEWER,
      isOrgAdmin: true,
    };

    expect(options.name).toBe('Full Permissions Key');
    expect(options.designAuthority).toBe(WorkspaceAuthority.MANAGER);
    expect(options.operationsAuthority).toBe(WorkspaceAuthority.EDITOR);
    expect(options.marketingAuthority).toBe(WorkspaceAuthority.CONTRIBUTOR);
    expect(options.complianceAuthority).toBe(WorkspaceAuthority.VIEWER);
    expect(options.isOrgAdmin).toBe(true);
  });
});

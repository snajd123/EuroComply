/**
 * Type tests for the Env type in app.ts
 *
 * These tests verify that the Env type includes all expected properties.
 * They are compile-time checks - if they compile, the types are correct.
 */
import { describe, it, expectTypeOf } from 'vitest';
import type { Env, ApiKeyAuthorities } from './app.js';
import { WorkspaceAuthority } from '@eurocomply/database';

describe('Env type', () => {
  describe('Variables', () => {
    it('includes apiKeyAuthorities property', () => {
      // This test verifies that Env.Variables includes apiKeyAuthorities
      type EnvVariables = Env['Variables'];

      // Verify apiKeyAuthorities is part of Variables type
      expectTypeOf<EnvVariables>().toHaveProperty('apiKeyAuthorities');
    });

    it('apiKeyAuthorities has correct structure', () => {
      // Verify ApiKeyAuthorities interface structure
      expectTypeOf<ApiKeyAuthorities>().toMatchTypeOf<{
        designAuthority: WorkspaceAuthority;
        operationsAuthority: WorkspaceAuthority;
        marketingAuthority: WorkspaceAuthority;
        complianceAuthority: WorkspaceAuthority;
        isOrgAdmin: boolean;
      }>();
    });

    it('apiKeyAuthorities is optional', () => {
      // Verify that apiKeyAuthorities can be undefined
      type EnvVariables = Env['Variables'];
      const variables: EnvVariables = {}; // Should compile - all properties optional

      // TypeScript should allow undefined for apiKeyAuthorities
      const withApiKeyAuth: EnvVariables = {
        apiKeyAuthorities: undefined,
      };

      // Suppress unused variable warnings
      void variables;
      void withApiKeyAuth;
    });
  });
});

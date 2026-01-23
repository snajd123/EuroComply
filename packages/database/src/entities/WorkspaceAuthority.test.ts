import { describe, it, expect } from 'vitest';
import { WorkspaceAuthority } from './WorkspaceAuthority.js';

describe('WorkspaceAuthority', () => {
  it('has all required authority levels', () => {
    expect(WorkspaceAuthority.NONE).toBe('NONE');
    expect(WorkspaceAuthority.VIEWER).toBe('VIEWER');
    expect(WorkspaceAuthority.CONTRIBUTOR).toBe('CONTRIBUTOR');
    expect(WorkspaceAuthority.EDITOR).toBe('EDITOR');
    expect(WorkspaceAuthority.MANAGER).toBe('MANAGER');
  });

  it('has exactly 5 levels', () => {
    const values = Object.values(WorkspaceAuthority);
    expect(values).toHaveLength(5);
  });
});

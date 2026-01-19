import { describe, it, expect } from 'vitest';
import { hasAuthority, Authority, AUTHORITY_PERMISSIONS } from './authorities.js';

describe('hasAuthority', () => {
  it('should return true when user has exact authority', () => {
    expect(hasAuthority(Authority.EDITOR, Authority.EDITOR)).toBe(true);
  });

  it('should return true when user has higher authority', () => {
    expect(hasAuthority(Authority.MANAGER, Authority.VIEWER)).toBe(true);
    expect(hasAuthority(Authority.MANAGER, Authority.CONTRIBUTOR)).toBe(true);
    expect(hasAuthority(Authority.MANAGER, Authority.EDITOR)).toBe(true);
    expect(hasAuthority(Authority.EDITOR, Authority.VIEWER)).toBe(true);
  });

  it('should return false when user has lower authority', () => {
    expect(hasAuthority(Authority.VIEWER, Authority.CONTRIBUTOR)).toBe(false);
    expect(hasAuthority(Authority.VIEWER, Authority.EDITOR)).toBe(false);
    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.MANAGER)).toBe(false);
  });

  it('should follow hierarchy: VIEWER < CONTRIBUTOR < EDITOR < MANAGER', () => {
    expect(hasAuthority(Authority.VIEWER, Authority.VIEWER)).toBe(true);
    expect(hasAuthority(Authority.VIEWER, Authority.CONTRIBUTOR)).toBe(false);

    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.VIEWER)).toBe(true);
    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.CONTRIBUTOR)).toBe(true);
    expect(hasAuthority(Authority.CONTRIBUTOR, Authority.EDITOR)).toBe(false);

    expect(hasAuthority(Authority.EDITOR, Authority.CONTRIBUTOR)).toBe(true);
    expect(hasAuthority(Authority.EDITOR, Authority.EDITOR)).toBe(true);
    expect(hasAuthority(Authority.EDITOR, Authority.MANAGER)).toBe(false);

    expect(hasAuthority(Authority.MANAGER, Authority.MANAGER)).toBe(true);
  });

  it('should return false for invalid user authority', () => {
    expect(hasAuthority('INVALID' as any, Authority.VIEWER)).toBe(false);
    expect(hasAuthority('ADMIN' as any, Authority.VIEWER)).toBe(false);
    expect(hasAuthority('' as any, Authority.VIEWER)).toBe(false);
  });

  it('should return false for invalid required authority', () => {
    expect(hasAuthority(Authority.MANAGER, 'INVALID' as any)).toBe(false);
    expect(hasAuthority(Authority.MANAGER, 'ADMIN' as any)).toBe(false);
    expect(hasAuthority(Authority.MANAGER, '' as any)).toBe(false);
  });

  it('should return false when both authorities are invalid', () => {
    expect(hasAuthority('INVALID' as any, 'ALSO_INVALID' as any)).toBe(false);
  });
});

describe('AUTHORITY_PERMISSIONS', () => {
  it('should have read permission for all authorities', () => {
    expect(AUTHORITY_PERMISSIONS.VIEWER).toContain('read');
    expect(AUTHORITY_PERMISSIONS.CONTRIBUTOR).toContain('read');
    expect(AUTHORITY_PERMISSIONS.EDITOR).toContain('read');
    expect(AUTHORITY_PERMISSIONS.MANAGER).toContain('read');
  });

  it('should have increasing permissions up the hierarchy', () => {
    expect(AUTHORITY_PERMISSIONS.VIEWER.length).toBeLessThan(
      AUTHORITY_PERMISSIONS.CONTRIBUTOR.length
    );
    expect(AUTHORITY_PERMISSIONS.CONTRIBUTOR.length).toBeLessThan(
      AUTHORITY_PERMISSIONS.EDITOR.length
    );
    expect(AUTHORITY_PERMISSIONS.EDITOR.length).toBeLessThan(
      AUTHORITY_PERMISSIONS.MANAGER.length
    );
  });

  it('should have configure permission only for MANAGER', () => {
    expect(AUTHORITY_PERMISSIONS.MANAGER).toContain('configure');
    expect(AUTHORITY_PERMISSIONS.EDITOR).not.toContain('configure');
  });
});

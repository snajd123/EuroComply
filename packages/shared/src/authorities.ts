/**
 * Authority levels for workspace access.
 * Higher levels include all permissions of lower levels.
 */
export const Authority = {
  VIEWER: 'VIEWER',
  CONTRIBUTOR: 'CONTRIBUTOR',
  EDITOR: 'EDITOR',
  MANAGER: 'MANAGER',
} as const;

export type AuthorityLevel = (typeof Authority)[keyof typeof Authority];

/**
 * Authority hierarchy (higher index = more permissions)
 */
const AUTHORITY_HIERARCHY: AuthorityLevel[] = [
  Authority.VIEWER,
  Authority.CONTRIBUTOR,
  Authority.EDITOR,
  Authority.MANAGER,
];

/**
 * Check if user has at least the required authority level.
 */
export function hasAuthority(
  userAuthority: AuthorityLevel,
  requiredAuthority: AuthorityLevel
): boolean {
  const userLevel = AUTHORITY_HIERARCHY.indexOf(userAuthority);
  const requiredLevel = AUTHORITY_HIERARCHY.indexOf(requiredAuthority);
  return userLevel >= requiredLevel;
}

/**
 * Workspace types for permission checks.
 */
export const Workspace = {
  DESIGN: 'design',
  OPERATIONS: 'operations',
  MARKETING: 'marketing',
  COMPLIANCE: 'compliance',
} as const;

export type WorkspaceType = (typeof Workspace)[keyof typeof Workspace];

/**
 * Permission definitions per authority level.
 */
export const AUTHORITY_PERMISSIONS: Record<AuthorityLevel, string[]> = {
  VIEWER: ['read'],
  CONTRIBUTOR: ['read', 'create', 'update:own'],
  EDITOR: ['read', 'create', 'update', 'delete:own', 'approve'],
  MANAGER: ['read', 'create', 'update', 'delete', 'approve', 'configure'],
};

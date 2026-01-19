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
 *
 * @param userAuthority - The user's current authority level
 * @param requiredAuthority - The minimum authority level required
 * @returns true if the user's authority meets or exceeds the required level, false otherwise
 *
 * @example
 * hasAuthority(Authority.MANAGER, Authority.VIEWER) // true
 * hasAuthority(Authority.VIEWER, Authority.MANAGER) // false
 * hasAuthority('INVALID' as AuthorityLevel, Authority.VIEWER) // false
 */
export function hasAuthority(
  userAuthority: AuthorityLevel,
  requiredAuthority: AuthorityLevel
): boolean {
  const userLevel = AUTHORITY_HIERARCHY.indexOf(userAuthority);
  const requiredLevel = AUTHORITY_HIERARCHY.indexOf(requiredAuthority);

  // Return false if either authority level is invalid
  if (userLevel === -1 || requiredLevel === -1) {
    return false;
  }

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

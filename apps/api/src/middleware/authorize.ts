// apps/api/src/middleware/authorize.ts
import { createMiddleware } from 'hono/factory';
import type { Env } from '../app.js';
import { WorkspaceAuthority } from '@eurocomply/database';

export type Workspace = 'design' | 'operations' | 'marketing' | 'compliance';
export type Action = 'view' | 'edit' | 'approve' | 'manage';

const AUTHORITY_LEVELS: Record<WorkspaceAuthority, number> = {
  [WorkspaceAuthority.NONE]: 0,
  [WorkspaceAuthority.VIEWER]: 1,
  [WorkspaceAuthority.CONTRIBUTOR]: 2,
  [WorkspaceAuthority.EDITOR]: 3,
  [WorkspaceAuthority.MANAGER]: 4,
};

const ACTION_REQUIREMENTS: Record<Action, number> = {
  view: 1,      // VIEWER+
  edit: 2,      // CONTRIBUTOR+
  approve: 3,   // EDITOR+
  manage: 4,    // MANAGER only
};

export function authorize(workspace: Workspace, action: Action) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const apiKeyAuthorities = c.get('apiKeyAuthorities');
    const membership = c.get('membership');

    const requiredLevel = ACTION_REQUIREMENTS[action];
    let userLevel: number;
    let userAuthority: WorkspaceAuthority;

    // Determine authority source: API key or human membership
    if (userId?.startsWith('api-key:') && apiKeyAuthorities) {
      const authorityKey = `${workspace}Authority` as keyof typeof apiKeyAuthorities;
      userAuthority = apiKeyAuthorities[authorityKey] as WorkspaceAuthority;
      userLevel = AUTHORITY_LEVELS[userAuthority];
    } else if (membership) {
      const authorityKey = `${workspace}Authority` as keyof typeof membership;
      userAuthority = membership[authorityKey] as WorkspaceAuthority;
      userLevel = AUTHORITY_LEVELS[userAuthority];
    } else {
      return c.json(
        { error: 'Unauthorized', message: 'No authorization context found' },
        401
      );
    }

    if (userLevel < requiredLevel) {
      const authorityNeeded = Object.entries(AUTHORITY_LEVELS)
        .find(([_, level]) => level === requiredLevel)?.[0];

      return c.json({
        error: 'Forbidden',
        message: `This action requires ${authorityNeeded} access to the ${workspace} workspace`,
        workspace,
        action,
        yourAuthority: userAuthority,
        requiredAuthority: authorityNeeded,
      }, 403);
    }

    await next();
  });
}

export function requireOrgAdmin() {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const apiKeyAuthorities = c.get('apiKeyAuthorities');
    const membership = c.get('membership');

    let isOrgAdmin: boolean;

    // Determine authority source: API key or human membership
    if (userId?.startsWith('api-key:') && apiKeyAuthorities) {
      isOrgAdmin = apiKeyAuthorities.isOrgAdmin;
    } else if (membership) {
      isOrgAdmin = membership.isOrgAdmin;
    } else {
      return c.json(
        { error: 'Unauthorized', message: 'No authorization context found' },
        401
      );
    }

    if (!isOrgAdmin) {
      return c.json(
        {
          error: 'Forbidden',
          message: 'This action requires Organization Admin privileges',
        },
        403
      );
    }

    await next();
  });
}

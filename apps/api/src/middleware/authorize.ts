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
    const membership = c.get('membership');

    // API key auth: allow org-level access
    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json(
        { error: 'Unauthorized', message: 'User context not found' },
        401
      );
    }

    // Get user's authority for this workspace
    const authorityKey = `${workspace}Authority` as keyof typeof membership;
    const userAuthority = membership[authorityKey] as WorkspaceAuthority;
    const userLevel = AUTHORITY_LEVELS[userAuthority];
    const requiredLevel = ACTION_REQUIREMENTS[action];

    if (userLevel < requiredLevel) {
      const authorityNeeded = Object.entries(AUTHORITY_LEVELS)
        .find(([_, level]) => level === requiredLevel)?.[0];

      return c.json(
        {
          error: 'Forbidden',
          message: `This action requires ${authorityNeeded} access to the ${workspace} workspace`,
          workspace,
          action,
          yourAuthority: userAuthority,
          requiredAuthority: authorityNeeded,
        },
        403
      );
    }

    await next();
  });
}

export function requireOrgAdmin() {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    // API key auth: allow (API keys are org-level credentials)
    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json(
        { error: 'Unauthorized', message: 'User context not found' },
        401
      );
    }

    if (!membership.isOrgAdmin) {
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

export function authorizeAnyWorkspace(action: Action) {
  return createMiddleware<Env>(async (c, next) => {
    const userId = c.get('userId');
    const membership = c.get('membership');

    if (userId?.startsWith('api-key:')) {
      await next();
      return;
    }

    if (!membership) {
      return c.json({ error: 'Unauthorized', message: 'User context not found' }, 401);
    }

    const requiredLevel = ACTION_REQUIREMENTS[action];

    // Check if user has required level in ANY workspace
    const hasAccess = (
      AUTHORITY_LEVELS[membership.designAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.operationsAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.marketingAuthority] >= requiredLevel ||
      AUTHORITY_LEVELS[membership.complianceAuthority] >= requiredLevel
    );

    if (!hasAccess) {
      return c.json({
        error: 'Forbidden',
        message: `Requires ${action} access to at least one workspace`,
      }, 403);
    }

    await next();
  });
}

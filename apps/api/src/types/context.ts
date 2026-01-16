import type { Context } from 'hono';
import type { TenantPrismaClient } from '@eurocomply/db';

export interface AuthUser {
  id: string;         // Our internal user ID
  clerkId: string;    // Clerk's user ID
  email: string;
  name: string | null;
}

export interface TenantInfo {
  organizationId: string;
  schemaName: string;
  name: string;
  subscriptionTier: string;
}

export interface UserPermissions {
  role: string;
  designAuthority: string;
  operationsAuthority: string;
  marketingAuthority: string;
  complianceAuthority: string;
}

export interface AppVariables {
  user: AuthUser;
  tenant: TenantInfo;
  permissions: UserPermissions;
  db: TenantPrismaClient;
}

export type AppContext = Context<{ Variables: AppVariables }>;

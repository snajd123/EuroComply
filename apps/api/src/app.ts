import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { secureHeaders } from 'hono/secure-headers';
import { User, OrganizationUser, WorkspaceAuthority } from '@eurocomply/database';
import { requestIdMiddleware } from './middleware/request-id.js';
import type { MikroORM } from '@eurocomply/database';
import { createOrganizationsRouter } from './routes/organizations.js';
import { createProductsRouter } from './routes/products.js';
import { createApiKeysRouter } from './routes/api-keys.js';
import { createCategoryAdoptionRouter } from './routes/category-adoption.js';
import { createTenantCategoriesRouter } from './routes/tenant-categories.js';
import { createComplianceStackRouter } from './routes/compliance-stack.js';
import { createExemptionRouter } from './routes/exemptions.js';
import { createEvidenceRouter } from './routes/evidence.js';
import { createUnitsRouter, type UnitsRepository, createSubstancesRouter, type SubstancesRepository } from './routes/taxonomy/index.js';
import { createIngestorRouter } from './routes/admin/ingestor.js';
import { tenantMiddleware, createTenantMiddlewareWithApiKeys } from './middleware/tenant.js';
import { adminAuthMiddleware } from './middleware/admin-auth.js';
import { createUserMiddleware } from './middleware/user.js';
import { success } from './utils/response.js';

export interface ApiKeyAuthorities {
  designAuthority: WorkspaceAuthority;
  operationsAuthority: WorkspaceAuthority;
  marketingAuthority: WorkspaceAuthority;
  complianceAuthority: WorkspaceAuthority;
  isOrgAdmin: boolean;
}

export type Env = {
  Variables: {
    requestId?: string;
    tenantSchema?: string;
    userId?: string;
    webhookPayload?: unknown;
    user?: User;
    membership?: OrganizationUser;
    apiKeyAuthorities?: ApiKeyAuthorities;
  };
};

export interface AppDependencies {
  /** MikroORM instance for database-backed routes */
  orm?: MikroORM;
  webhooksRouter?: Hono;
  organizationsAdminRouter?: Hono;
  unitsRepository?: UnitsRepository;
  substancesRepository?: SubstancesRepository;
}

export function createApp(deps?: AppDependencies): Hono<Env> {
  const app = new Hono<Env>();

  // Global middleware
  app.use('*', requestIdMiddleware());
  app.use('*', logger());
  app.use('*', secureHeaders());
  app.use(
    '*',
    cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
      credentials: true,
    })
  );

  // Create user middleware if orm is available
  // Note: Type assertion needed due to MikroORM's complex generic types
  const userMiddleware = deps?.orm
    ? createUserMiddleware({ orm: deps.orm })
    : undefined;

  // Health check
  app.get('/health', (c) => {
    return success(c, { status: 'healthy' });
  });

  // Webhooks (no CORS, no auth - signature verified)
  if (deps?.webhooksRouter) {
    app.route('/webhooks', deps.webhooksRouter);
  }

  // API version prefix
  const v1 = new Hono<Env>();

  v1.get('/', (c) => {
    return success(c, { message: 'EuroComply API v1' });
  });

  // Admin routes (protected by API key)
  // All organization management requires admin authentication
  v1.use('/admin/*', adminAuthMiddleware());

  // Organizations list/get - admin only (requires ORM)
  if (deps?.orm) {
    v1.route('/admin/organizations', createOrganizationsRouter({ orm: deps.orm }));
  }

  // Additional admin operations (status, provision, delete)
  if (deps?.organizationsAdminRouter) {
    v1.route('/admin/organizations', deps.organizationsAdminRouter);
  }

  // Ingestor admin routes (AI regulation ingestion)
  if (deps?.orm) {
    v1.route('/admin/ingestor', createIngestorRouter({ orm: deps.orm }));
  }

  // API key management routes (JWT-only authentication)
  // These routes allow tenants to create, list, and revoke their API keys
  if (deps?.orm) {
    v1.use('/api-keys/*', tenantMiddleware); // JWT only for key management
    if (userMiddleware) {
      v1.use('/api-keys/*', userMiddleware);
    }
    v1.route('/api-keys', createApiKeysRouter({ em: deps.orm.em }));
  }

  // Taxonomy routes (public, no auth required)
  const taxonomy = new Hono<Env>();
  if (deps?.unitsRepository) {
    taxonomy.route('/units', createUnitsRouter(deps.unitsRepository));
  }
  if (deps?.substancesRepository) {
    taxonomy.route('/substances', createSubstancesRouter(deps.substancesRepository));
  }
  v1.route('/taxonomy', taxonomy);

  // Tenant-scoped routes (require authentication via JWT or API key)
  // Apply tenant middleware explicitly to each protected route
  // This avoids catch-all patterns that would interfere with admin routes
  // NOTE: Products routes require ORM - no fallback (authorization requires database)
  if (deps?.orm) {
    // Products: Apply tenant + user middleware
    v1.use('/products/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
    if (userMiddleware) {
      v1.use('/products/*', userMiddleware);
    }
    v1.route('/products', createProductsRouter({ orm: deps.orm }));

    // Category Adoption: Apply tenant + user middleware (requires full auth stack)
    v1.use('/category-adoption/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
    if (userMiddleware) {
      v1.use('/category-adoption/*', userMiddleware);
    }
    v1.route('/category-adoption', createCategoryAdoptionRouter({ orm: deps.orm }));

    // Tenant Categories: Apply tenant + user middleware (requires full auth stack)
    v1.use('/tenant-categories/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
    if (userMiddleware) {
      v1.use('/tenant-categories/*', userMiddleware);
    }
    v1.route('/tenant-categories', createTenantCategoriesRouter({ orm: deps.orm }));

    // Compliance Stack: Apply tenant + user middleware (requires compliance:view)
    v1.use('/compliance-stack/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
    if (userMiddleware) {
      v1.use('/compliance-stack/*', userMiddleware);
    }
    v1.route('/compliance-stack', createComplianceStackRouter({ orm: deps.orm }));

    // Exemptions: Apply tenant + user middleware (requires compliance:view/edit)
    v1.use('/exemptions/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
    if (userMiddleware) {
      v1.use('/exemptions/*', userMiddleware);
    }
    v1.route('/exemptions', createExemptionRouter({ orm: deps.orm }));

    // Evidence: Apply tenant + user middleware (requires compliance:view/edit)
    v1.use('/evidence/*', createTenantMiddlewareWithApiKeys(deps.orm.em));
    if (userMiddleware) {
      v1.use('/evidence/*', userMiddleware);
    }
    v1.route('/evidence', createEvidenceRouter({ orm: deps.orm }));
  }

  app.route('/api/v1', v1);

  return app;
}

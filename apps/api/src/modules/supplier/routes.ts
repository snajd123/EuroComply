/**
 * Supplier Routes
 * API endpoints for supplier portal
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  registerSupplierSchema,
  loginSupplierSchema,
  updateSupplierProfileSchema,
  createSupplierProductSchema,
  updateSupplierProductSchema,
  catalogSearchSchema,
  submitVerificationSchema,
  adminReviewVerificationSchema,
} from './validators.js';
import * as supplierService from './supplier.service.js';
import * as earningsService from './earnings.service.js';
import { logger } from '../../common/utils/logger.js';

const router = Router();

// ===========================================
// MIDDLEWARE
// ===========================================

interface AuthenticatedRequest extends Request {
  supplier?: { supplierId: string; email: string };
}

async function supplierAuthMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
      });
    }

    const token = authHeader.substring(7);
    const decoded = supplierService.verifySupplierToken(token);
    req.supplier = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }
}

// ===========================================
// AUTH ROUTES (Public)
// ===========================================

// POST /api/suppliers/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const input = registerSupplierSchema.parse(req.body);
    const result = await supplierService.registerSupplier(input);

    logger.info(`Supplier registered: ${result.supplier.email}`);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Supplier registration failed:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors,
        },
      });
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'REGISTRATION_FAILED',
        message: error.message || 'Registration failed',
      },
    });
  }
});

// POST /api/suppliers/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const input = loginSupplierSchema.parse(req.body);
    const result = await supplierService.loginSupplier(input);

    logger.info(`Supplier logged in: ${result.supplier.email}`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.warn('Supplier login failed:', error.message);

    res.status(401).json({
      success: false,
      error: {
        code: 'LOGIN_FAILED',
        message: error.message || 'Invalid credentials',
      },
    });
  }
});

// ===========================================
// PROFILE ROUTES (Authenticated)
// ===========================================

// GET /api/suppliers/me
router.get('/me', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const supplier = await supplierService.getSupplierById(req.supplier!.supplierId);

    res.json({
      success: true,
      data: supplier,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: error.message,
      },
    });
  }
});

// PATCH /api/suppliers/me
router.patch('/me', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = updateSupplierProfileSchema.parse(req.body);
    const supplier = await supplierService.updateSupplierProfile(req.supplier!.supplierId, input);

    res.json({
      success: true,
      data: supplier,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors,
        },
      });
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// VERIFICATION ROUTES (Authenticated)
// ===========================================

// GET /api/suppliers/verification
router.get('/verification', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = await supplierService.getVerificationStatus(req.supplier!.supplierId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/verification
router.post('/verification', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = submitVerificationSchema.parse(req.body);
    const result = await supplierService.submitVerification(req.supplier!.supplierId, input);

    logger.info(`Supplier verification submitted: ${req.supplier!.email}`);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Verification submission failed:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid verification data',
          details: error.errors,
        },
      });
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// ADMIN ROUTES (for internal use)
// ===========================================

// GET /api/suppliers/admin/pending-verifications
router.get('/admin/pending-verifications', async (req: Request, res: Response) => {
  try {
    // TODO: Add admin authentication
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env['ADMIN_API_KEY']) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid admin key' },
      });
    }

    const suppliers = await supplierService.getPendingVerifications();

    res.json({
      success: true,
      data: suppliers,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/admin/review/:supplierId
router.post('/admin/review/:supplierId', async (req: Request, res: Response) => {
  try {
    // TODO: Add admin authentication
    const adminKey = req.headers['x-admin-key'];
    if (adminKey !== process.env['ADMIN_API_KEY']) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid admin key' },
      });
    }

    const adminId = req.headers['x-admin-id'] as string || 'system';
    const supplierId = req.params['supplierId'] as string;
    const input = adminReviewVerificationSchema.parse(req.body);
    const result = await supplierService.adminReviewVerification(
      supplierId,
      input,
      adminId
    );

    logger.info(`Supplier ${supplierId} verification ${input.decision} by ${adminId}`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid review data',
          details: error.errors,
        },
      });
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'REVIEW_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// PRODUCT ROUTES (Authenticated)
// ===========================================

// GET /api/suppliers/products
router.get('/products', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await supplierService.getSupplierProducts(req.supplier!.supplierId);

    res.json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/products
router.post('/products', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const input = createSupplierProductSchema.parse(req.body);
    const product = await supplierService.createSupplierProduct(req.supplier!.supplierId, input);

    logger.info(`Supplier product created: ${product.id} by ${req.supplier!.email}`);

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    logger.error('Product creation failed:', error);

    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid DPP data',
          details: error.errors,
        },
      });
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'CREATE_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/products/:id
router.get('/products/:id', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = req.params['id'] as string;
    const product = await supplierService.getSupplierProductById(
      req.supplier!.supplierId,
      productId
    );

    res.json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: error.message,
      },
    });
  }
});

// PATCH /api/suppliers/products/:id
router.patch('/products/:id', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = req.params['id'] as string;
    const input = updateSupplierProductSchema.parse(req.body);
    const product = await supplierService.updateSupplierProduct(
      req.supplier!.supplierId,
      productId,
      input
    );

    res.json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid input',
          details: error.errors,
        },
      });
    }

    res.status(400).json({
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        message: error.message,
      },
    });
  }
});

// DELETE /api/suppliers/products/:id
router.delete('/products/:id', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = req.params['id'] as string;
    await supplierService.deleteSupplierProduct(req.supplier!.supplierId, productId);

    res.json({
      success: true,
      message: 'Product deleted',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'DELETE_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// CATALOG ROUTES (Public - for merchants)
// ===========================================

// GET /api/catalog/products
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const input = catalogSearchSchema.parse(req.query);
    const merchantShop = req.headers['x-merchant-shop'] as string | undefined;

    const result = await supplierService.searchCatalog(input, merchantShop);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid query parameters',
          details: error.errors,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'SEARCH_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/catalog/products/:id
router.get('/catalog/:id', async (req: Request, res: Response) => {
  try {
    const productId = req.params['id'] as string;
    const merchantShop = req.headers['x-merchant-shop'] as string | undefined;
    const product = await supplierService.getCatalogProductById(productId, merchantShop);

    res.json({
      success: true,
      data: product,
    });
  } catch (error: any) {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: error.message,
      },
    });
  }
});

// ===========================================
// EARNINGS ROUTES (Authenticated)
// ===========================================

// GET /api/suppliers/earnings
router.get('/earnings', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const overview = await earningsService.getEarningsOverview(req.supplier!.supplierId);

    res.json({
      success: true,
      data: overview,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/earnings/products
router.get('/earnings/products', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await earningsService.getProductEarnings(req.supplier!.supplierId);

    res.json({
      success: true,
      data: products,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/earnings/history
router.get('/earnings/history', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 12;

    const history = await earningsService.getEarningsHistory(req.supplier!.supplierId, { page, limit });

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/earnings/recent
router.get('/earnings/recent', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = parseInt(req.query['limit'] as string) || 20;

    const events = await earningsService.getRecentUsageEvents(req.supplier!.supplierId, { limit });

    res.json({
      success: true,
      data: events,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/payouts/settings
router.get('/payouts/settings', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const settings = await earningsService.getPayoutSettings(req.supplier!.supplierId);

    res.json({
      success: true,
      data: settings,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/payouts/history
router.get('/payouts/history', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 20;

    const history = await earningsService.getPayoutHistory(req.supplier!.supplierId, { page, limit });

    res.json({
      success: true,
      data: history,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_FAILED',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/payouts/request
router.post('/payouts/request', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await earningsService.requestPayout(req.supplier!.supplierId);

    logger.info(`Payout requested by ${req.supplier!.email}: €${result.amount.toFixed(2)}`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.warn(`Payout request failed for ${req.supplier!.email}: ${error.message}`);

    res.status(400).json({
      success: false,
      error: {
        code: 'PAYOUT_FAILED',
        message: error.message,
      },
    });
  }
});

export default router;

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
} from './validators.js';
import * as supplierService from './supplier.service.js';
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
    const product = await supplierService.getSupplierProductById(
      req.supplier!.supplierId,
      req.params.id
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
    const input = updateSupplierProductSchema.parse(req.body);
    const product = await supplierService.updateSupplierProduct(
      req.supplier!.supplierId,
      req.params.id,
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
    await supplierService.deleteSupplierProduct(req.supplier!.supplierId, req.params.id);

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
    const merchantShop = req.headers['x-merchant-shop'] as string | undefined;
    const product = await supplierService.getCatalogProductById(req.params.id, merchantShop);

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

export default router;

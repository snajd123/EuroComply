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
import * as subscriptionService from './subscription.service.js';
import * as emailService from './email.service.js';
import * as viesService from './vies.service.js';
import * as exportService from './export.service.js';
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
// CATALOG ROUTES (Public - for retailers)
// ===========================================

// GET /api/catalog/products
router.get('/catalog', async (req: Request, res: Response) => {
  try {
    const input = catalogSearchSchema.parse(req.query);
    const retailerShop = req.headers['x-retailer-shop'] as string | undefined;

    const result = await supplierService.searchCatalog(input, retailerShop);

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
    const retailerShop = req.headers['x-retailer-shop'] as string | undefined;
    const product = await supplierService.getCatalogProductById(productId, retailerShop);

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
// SUBSCRIPTION ROUTES (Authenticated)
// ===========================================

// GET /api/suppliers/subscription
router.get('/subscription', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subscription = await subscriptionService.getSubscription(req.supplier!.supplierId);

    res.json({
      success: true,
      data: subscription,
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

// GET /api/suppliers/subscription/usage
router.get('/subscription/usage', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const usage = await subscriptionService.getSubscriptionUsage(req.supplier!.supplierId);

    res.json({
      success: true,
      data: usage,
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

// POST /api/suppliers/checkout
router.post('/checkout', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan } = req.body;

    if (!plan || !['STARTER', 'GROWTH', 'PRO'].includes(plan)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PLAN',
          message: 'Invalid plan. Choose from: STARTER, GROWTH, PRO',
        },
      });
    }

    const result = await subscriptionService.createCheckoutSession(
      req.supplier!.supplierId,
      plan
    );

    logger.info(`Checkout session created for ${req.supplier!.email}, plan: ${plan}`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error(`Checkout failed for ${req.supplier!.email}: ${error.message}`);

    res.status(400).json({
      success: false,
      error: {
        code: 'CHECKOUT_FAILED',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/billing-portal
router.post('/billing-portal', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await subscriptionService.createBillingPortalSession(req.supplier!.supplierId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'PORTAL_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// EMAIL VERIFICATION ROUTES
// ===========================================

// POST /api/suppliers/verify-email
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Verification token is required',
        },
      });
    }

    const result = await emailService.verifyEmail(token);

    logger.info(`Email verified: ${result.email}`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VERIFICATION_FAILED',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/resend-verification
router.post('/resend-verification', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    await emailService.resendVerificationEmail(req.supplier!.supplierId);

    res.json({
      success: true,
      message: 'Verification email sent',
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'SEND_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// VAT VERIFICATION ROUTES
// ===========================================

// POST /api/suppliers/verify-vat
router.post('/verify-vat', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { vatNumber } = req.body;

    if (!vatNumber) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_VAT',
          message: 'VAT number is required',
        },
      });
    }

    const result = await viesService.verifySupplierVat(req.supplier!.supplierId, vatNumber);

    if (result.verified) {
      logger.info(`VAT verified for ${req.supplier!.email}: ${vatNumber}`);
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'VAT_VERIFICATION_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/vies/check/:vatNumber
router.get('/vies/check/:vatNumber', async (req: Request, res: Response) => {
  try {
    const vatNumber = req.params['vatNumber'] as string;
    const result = await viesService.verifyVatNumber(vatNumber);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(400).json({
      success: false,
      error: {
        code: 'CHECK_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// EXPORT ROUTES (Data Sovereignty)
// ===========================================

// GET /api/suppliers/export/did - Get or create supplier's DID
router.get('/export/did', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await exportService.getOrCreateSupplierDid(req.supplier!.supplierId);

    res.json({
      success: true,
      data: {
        did: result.did,
        keyId: result.keyId,
        isNew: result.isNew,
      },
    });
  } catch (error: any) {
    logger.error('Failed to get/create supplier DID:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'DID_FAILED',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/export/dpp/:productId - Export DPP as portable package
router.post('/export/dpp/:productId', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = req.params['productId'] as string;
    const { includePrivateKey } = req.body || {};

    // Get product data
    const product = await supplierService.getSupplierProductById(
      req.supplier!.supplierId,
      productId
    );

    // Export DPP as portable package
    const exportPackage = await exportService.exportProductDpp(
      req.supplier!.supplierId,
      productId,
      product.dppData as Record<string, unknown>,
      { includePrivateKey }
    );

    logger.info(`DPP exported for product ${productId} by supplier ${req.supplier!.supplierId}`);

    res.json({
      success: true,
      data: exportPackage,
    });
  } catch (error: any) {
    logger.error('DPP export failed:', error);

    if (error.message?.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'EXPORT_FAILED',
        message: error.message,
      },
    });
  }
});

// POST /api/suppliers/export/keys - Export signing keys (SENSITIVE)
router.post('/export/keys', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Extra confirmation required for key export
    const { confirmKeyExport } = req.body || {};
    if (!confirmKeyExport) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'CONFIRMATION_REQUIRED',
          message: 'Key export requires explicit confirmation. Set confirmKeyExport: true to proceed.',
        },
      });
    }

    const result = await exportService.exportSupplierKeys(req.supplier!.supplierId);

    logger.warn(`Private key exported for supplier ${req.supplier!.supplierId} - security audit event`);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Key export failed:', error);

    res.status(500).json({
      success: false,
      error: {
        code: 'KEY_EXPORT_FAILED',
        message: error.message,
      },
    });
  }
});

// GET /api/suppliers/export/viewer/:productId - Generate offline HTML viewer
router.get('/export/viewer/:productId', supplierAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const productId = req.params['productId'] as string;

    // Get product data
    const product = await supplierService.getSupplierProductById(
      req.supplier!.supplierId,
      productId
    );

    // Generate offline viewer
    const html = await exportService.generateProductViewer(
      req.supplier!.supplierId,
      productId,
      product.dppData as Record<string, unknown>
    );

    // Return as HTML file
    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="dpp-viewer-${productId}.html"`);
    res.send(html);
  } catch (error: any) {
    logger.error('Viewer generation failed:', error);

    if (error.message?.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: error.message,
        },
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'VIEWER_FAILED',
        message: error.message,
      },
    });
  }
});

// ===========================================
// STRIPE WEBHOOK (Public)
// ===========================================

// POST /api/suppliers/webhooks/stripe
router.post('/webhooks/stripe', async (req: Request, res: Response) => {
  try {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env['STRIPE_WEBHOOK_SECRET'];

    if (!webhookSecret) {
      logger.warn('Stripe webhook secret not configured');
      return res.status(400).send('Webhook secret not configured');
    }

    // Verify signature (requires raw body)
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(process.env['STRIPE_SECRET_KEY']!);

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );
    } catch (err: any) {
      logger.error(`Stripe webhook signature verification failed: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed':
        await subscriptionService.handleCheckoutCompleted(event.data.object);
        break;
      case 'customer.subscription.updated':
        await subscriptionService.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await subscriptionService.handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await subscriptionService.handleInvoicePaymentFailed(event.data.object);
        break;
      default:
        logger.debug(`Unhandled Stripe event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error: any) {
    logger.error(`Stripe webhook error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

export default router;

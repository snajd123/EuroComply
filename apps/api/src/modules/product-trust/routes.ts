import { Router } from 'express';
import { authenticate, requireScopes } from '../../common/auth/middleware.js';
import { productController } from './controllers/product.controller.js';
import { passportController } from './controllers/passport.controller.js';
import { lifecycleController } from './controllers/lifecycle.controller.js';

const router = Router();

// All ProductTrust routes require authentication
router.use(authenticate);

// ===========================================
// Products
// ===========================================

router.post('/products', requireScopes('products:write'), productController.create);
router.get('/products', requireScopes('products:read'), productController.list);
router.get('/products/:id', requireScopes('products:read'), productController.get);
router.patch('/products/:id', requireScopes('products:write'), productController.update);
router.delete('/products/:id', requireScopes('products:write'), productController.delete);

// ===========================================
// Digital Product Passports
// ===========================================

router.post('/passports', requireScopes('passports:write'), passportController.create);
router.get('/passports', requireScopes('passports:read'), passportController.list);
router.get('/passports/:id', requireScopes('passports:read'), passportController.get);
router.patch('/passports/:id', requireScopes('passports:write'), passportController.update);

// QR Code generation
router.post('/passports/:id/qr', requireScopes('passports:write'), passportController.generateQr);

// Blockchain anchoring
router.post('/passports/:id/anchor', requireScopes('passports:write'), passportController.anchor);

// ===========================================
// Lifecycle Events (Unsold Goods Tracking)
// ===========================================

router.post('/products/:productId/lifecycle', requireScopes('products:write'), lifecycleController.create);
router.get('/products/:productId/lifecycle', requireScopes('products:read'), lifecycleController.list);

// ESPR Reports
router.get('/reports/unsold-goods', requireScopes('products:read'), lifecycleController.unsoldGoodsReport);
router.get('/reports/sustainability', requireScopes('products:read'), lifecycleController.sustainabilityReport);

export default router;

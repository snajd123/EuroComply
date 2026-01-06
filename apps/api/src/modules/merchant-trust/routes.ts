import { Router } from 'express';
import { authenticate, requireScopes } from '../../common/auth/middleware.js';
import { kybController } from './controllers/kyb.controller.js';
import { traderController } from './controllers/trader.controller.js';
import { sanctionsController } from './controllers/sanctions.controller.js';

const router = Router();

// All MerchantTrust routes require authentication
router.use(authenticate);

// ===========================================
// KYB Verification
// ===========================================

router.post('/kyb/verify', requireScopes('kyb:write'), kybController.startVerification);
router.get('/kyb/:id', requireScopes('kyb:read'), kybController.get);
router.get('/kyb/:id/report', requireScopes('kyb:read'), kybController.getReport);

// ===========================================
// Traders (DSA Compliance)
// ===========================================

router.post('/traders', requireScopes('merchants:write'), traderController.create);
router.get('/traders', requireScopes('merchants:read'), traderController.list);
router.get('/traders/:id', requireScopes('merchants:read'), traderController.get);
router.patch('/traders/:id', requireScopes('merchants:write'), traderController.update);
router.get('/traders/:id/compliance', requireScopes('merchants:read'), traderController.getCompliance);

// ===========================================
// Sanctions & Screening
// ===========================================

router.post('/sanctions/check', requireScopes('kyb:write'), sanctionsController.check);
router.post('/ubo/lookup', requireScopes('kyb:write'), sanctionsController.uboLookup);

export default router;

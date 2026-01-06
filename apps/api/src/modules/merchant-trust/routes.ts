import { Router } from 'express';
import { authenticate, requireScopes } from '../../common/auth/middleware.js';
import { kybController } from './controllers/kyb.controller.js';
import { traderController } from './controllers/trader.controller.js';
import { sanctionsController } from './controllers/sanctions.controller.js';
import { dsaController } from './controllers/dsa.controller.js';

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
// DSA Article 30 Compliance
// ===========================================

// Full DSA compliance status (replaces /compliance above with more detail)
router.get('/traders/:id/dsa-status', requireScopes('merchants:read'), dsaController.getFullComplianceStatus);

// Self-certification (Article 30(1)(e))
router.get('/traders/:id/self-certification', requireScopes('merchants:read'), dsaController.getSelfCertification);
router.post('/traders/:id/self-certification', requireScopes('merchants:write'), dsaController.submitSelfCertification);

// Bank accounts (Article 30(1)(d))
router.get('/traders/:id/bank-accounts', requireScopes('merchants:read'), dsaController.listBankAccounts);
router.post('/traders/:id/bank-accounts', requireScopes('merchants:write'), dsaController.addBankAccount);
router.delete('/traders/:id/bank-accounts/:accountId', requireScopes('merchants:write'), dsaController.deleteBankAccount);

// Document attestations (Article 30(1)(b))
router.get('/traders/:id/attestations', requireScopes('merchants:read'), dsaController.listDocumentAttestations);
router.post('/traders/:id/attestations', requireScopes('merchants:write'), dsaController.submitDocumentAttestation);

// ===========================================
// Sanctions & Screening
// ===========================================

router.post('/sanctions/check', requireScopes('kyb:write'), sanctionsController.check);
router.post('/ubo/lookup', requireScopes('kyb:write'), sanctionsController.uboLookup);

export default router;

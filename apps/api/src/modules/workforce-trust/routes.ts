import { Router } from 'express';
import { authenticate, requireScopes } from '../../common/auth/middleware.js';
import { credentialController } from './controllers/credential.controller.js';
import { schemaController } from './controllers/schema.controller.js';
import { verificationController } from './controllers/verification.controller.js';

const router = Router();

// All WorkforceTrust routes require authentication
router.use(authenticate);

// ===========================================
// Credential Schemas
// ===========================================

router.get('/schemas', requireScopes('credentials:read'), schemaController.list);
router.get('/schemas/:id', requireScopes('credentials:read'), schemaController.get);
router.post('/schemas', requireScopes('credentials:write'), schemaController.create);

// ===========================================
// Credentials
// ===========================================

router.post('/credentials/issue', requireScopes('credentials:write'), credentialController.issue);
router.post('/credentials/verify', requireScopes('credentials:read'), credentialController.verify);
router.get('/credentials', requireScopes('credentials:read'), credentialController.list);
router.get('/credentials/:id', requireScopes('credentials:read'), credentialController.get);
router.post('/credentials/:id/revoke', requireScopes('credentials:write'), credentialController.revoke);

// ===========================================
// Verifications (Background Checks, Diplomas, etc.)
// ===========================================

router.post('/verifications/background', requireScopes('credentials:write'), verificationController.backgroundCheck);
router.post('/verifications/diploma', requireScopes('credentials:write'), verificationController.diploma);
router.post('/verifications/employment', requireScopes('credentials:write'), verificationController.employment);
router.get('/verifications/:id', requireScopes('credentials:read'), verificationController.get);

export default router;

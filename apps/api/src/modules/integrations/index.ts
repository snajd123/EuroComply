// E-commerce Integrations Module for ProductTrust
// Shopify & WooCommerce product sync for Digital Product Passports

import { Router } from 'express';
import shopifyRoutes from './shopify.routes.js';
import woocommerceRoutes from './woocommerce.routes.js';

const router = Router();

// Mount integration routes
router.use('/shopify', shopifyRoutes);
router.use('/woocommerce', woocommerceRoutes);

export default router;

// E-commerce Integrations Module
// Shopify & WooCommerce support for DSA Compliance

import { Router } from 'express';
import shopifyRoutes from './shopify.routes.js';
import woocommerceRoutes from './woocommerce.routes.js';

const router = Router();

// Mount integration routes
router.use('/shopify', shopifyRoutes);
router.use('/woocommerce', woocommerceRoutes);

export default router;

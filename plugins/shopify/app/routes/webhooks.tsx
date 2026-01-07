import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createEuroComplyClient } from "../services/eurocomply.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    // The admin context isn't returned if the webhook is from an app uninstallation
    throw new Response();
  }

  console.log(`[Webhook] Received: ${topic} for shop: ${shop}`);

  switch (topic) {
    case "PRODUCTS_CREATE":
      await handleProductCreate(shop, payload, admin);
      break;
    case "PRODUCTS_UPDATE":
      await handleProductUpdate(shop, payload, admin);
      break;
    case "PRODUCTS_DELETE":
      await handleProductDelete(shop, payload);
      break;
    case "APP_UNINSTALLED":
      await handleAppUninstalled(shop);
      break;
    default:
      console.log(`[Webhook] Unhandled topic: ${topic}`);
  }

  return new Response();
};

async function handleProductCreate(shop: string, payload: any, admin: any) {
  console.log(`[Webhook] Product created in ${shop}: ${payload.id}`);

  // Check if auto-sync is enabled
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.autoSyncEnabled) {
    console.log("[Webhook] Auto-sync disabled, skipping DPP creation");
    return;
  }

  if (!settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
    console.log("[Webhook] EuroComply not configured, skipping DPP creation");
    return;
  }

  const eurocomply = createEuroComplyClient({
    eurocomplyApiKey: settings.eurocomplyApiKey,
    eurocomplyOrgId: settings.eurocomplyOrgId,
  });

  if (!eurocomply) {
    console.error("[Webhook] Failed to create EuroComply client");
    return;
  }

  const productId = String(payload.id);

  try {
    // Create sync record as pending
    await prisma.productSync.upsert({
      where: {
        shop_shopifyProductId: {
          shop,
          shopifyProductId: productId,
        },
      },
      create: {
        shop,
        shopifyProductId: productId,
        syncStatus: "pending",
      },
      update: {
        syncStatus: "pending",
        lastSyncedAt: new Date(),
      },
    });

    // Transform webhook payload to our format
    const firstVariant = payload.variants?.[0];
    const shopifyProduct = {
      id: productId,
      title: payload.title,
      handle: payload.handle,
      vendor: payload.vendor,
      productType: payload.product_type,
      description: payload.body_html?.replace(/<[^>]*>/g, '') || '',
      variants: payload.variants?.map((v: any) => ({
        sku: v.sku,
        barcode: v.barcode,
        weight: v.weight,
        weightUnit: v.weight_unit,
      })) || [],
      tags: payload.tags?.split(', ') || [],
    };

    // Create DPP with Verifiable Credential via EuroComply API
    console.log(`[Webhook] Creating DPP for product: ${payload.title}`);

    const result = await eurocomply.syncShopifyProduct(shopifyProduct, {
      manufacturerName: payload.vendor || 'Unknown Manufacturer',
      manufacturerCountry: 'EU', // Default, can be updated later
    });

    // Update sync record with success
    await prisma.productSync.update({
      where: {
        shop_shopifyProductId: {
          shop,
          shopifyProductId: productId,
        },
      },
      data: {
        syncStatus: "synced",
        eurocomplyDppId: result.dpp.id,
        lastSyncedAt: new Date(),
        errorMessage: null,
      },
    });

    console.log(`[Webhook] DPP created successfully: ${result.dpp.id} (VC: ${result.dpp.credentialId})`);

  } catch (error) {
    console.error("[Webhook] DPP creation failed:", error);

    await prisma.productSync.update({
      where: {
        shop_shopifyProductId: {
          shop,
          shopifyProductId: productId,
        },
      },
      data: {
        syncStatus: "error",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      },
    });
  }
}

async function handleProductUpdate(shop: string, payload: any, admin: any) {
  console.log(`[Webhook] Product updated in ${shop}: ${payload.id}`);

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.autoSyncEnabled || !settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
    return;
  }

  const productId = String(payload.id);

  // Check if we have an existing DPP for this product
  const existingSync = await prisma.productSync.findUnique({
    where: {
      shop_shopifyProductId: {
        shop,
        shopifyProductId: productId,
      },
    },
  });

  if (!existingSync?.eurocomplyDppId) {
    // No existing DPP, create one
    await handleProductCreate(shop, payload, admin);
    return;
  }

  // Product has a DPP - for now, we don't update the VC
  // In production, you might want to issue a new version of the credential
  console.log(`[Webhook] Product ${productId} already has DPP ${existingSync.eurocomplyDppId}, skipping update`);

  // Update the sync timestamp
  await prisma.productSync.update({
    where: {
      shop_shopifyProductId: {
        shop,
        shopifyProductId: productId,
      },
    },
    data: {
      lastSyncedAt: new Date(),
    },
  });
}

async function handleProductDelete(shop: string, payload: any) {
  console.log(`[Webhook] Product deleted in ${shop}: ${payload.id}`);

  const productId = String(payload.id);

  // Get the sync record before deleting
  const sync = await prisma.productSync.findUnique({
    where: {
      shop_shopifyProductId: {
        shop,
        shopifyProductId: productId,
      },
    },
  });

  if (sync?.eurocomplyDppId) {
    // TODO: Optionally revoke the Verifiable Credential
    // This would require adding a revoke endpoint to EuroComply API
    console.log(`[Webhook] Product deleted, DPP ${sync.eurocomplyDppId} should be revoked`);
  }

  // Remove sync record
  await prisma.productSync.deleteMany({
    where: {
      shop,
      shopifyProductId: productId,
    },
  });
}

async function handleAppUninstalled(shop: string) {
  console.log(`[Webhook] App uninstalled from ${shop}`);

  // Get all DPPs for this shop before cleanup
  const syncs = await prisma.productSync.findMany({
    where: { shop },
    select: { eurocomplyDppId: true },
  });

  console.log(`[Webhook] Found ${syncs.length} DPPs to potentially revoke`);

  // TODO: Revoke all VCs for this shop
  // This would be important in production to invalidate credentials
  // when a merchant uninstalls the app

  // Clean up shop data
  await prisma.shopSettings.deleteMany({
    where: { shop },
  });

  await prisma.productSync.deleteMany({
    where: { shop },
  });

  // Session cleanup is handled by Prisma session storage
  console.log(`[Webhook] Cleaned up data for ${shop}`);
}

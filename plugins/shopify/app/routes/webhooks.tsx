import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, admin, payload } = await authenticate.webhook(request);

  if (!admin) {
    // The admin context isn't returned if the webhook is from an app uninstallation
    throw new Response();
  }

  console.log(`Received webhook: ${topic} for shop: ${shop}`);

  switch (topic) {
    case "PRODUCTS_CREATE":
      await handleProductCreate(shop, payload);
      break;
    case "PRODUCTS_UPDATE":
      await handleProductUpdate(shop, payload);
      break;
    case "PRODUCTS_DELETE":
      await handleProductDelete(shop, payload);
      break;
    case "APP_UNINSTALLED":
      await handleAppUninstalled(shop);
      break;
    default:
      console.log(`Unhandled webhook topic: ${topic}`);
  }

  return new Response();
};

async function handleProductCreate(shop: string, payload: any) {
  console.log(`Product created in ${shop}: ${payload.id}`);

  // Check if auto-sync is enabled
  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.autoSyncEnabled || !settings?.eurocomplyApiKey) {
    console.log("Auto-sync disabled or not configured, skipping");
    return;
  }

  // Create sync record
  await prisma.productSync.create({
    data: {
      shop,
      shopifyProductId: String(payload.id),
      syncStatus: "pending",
    },
  });

  // TODO: Queue job to sync with EuroComply API
  // This would integrate with a job queue (e.g., Bull/BullMQ)
  // to handle the actual DPP creation asynchronously
}

async function handleProductUpdate(shop: string, payload: any) {
  console.log(`Product updated in ${shop}: ${payload.id}`);

  const settings = await prisma.shopSettings.findUnique({
    where: { shop },
  });

  if (!settings?.autoSyncEnabled || !settings?.eurocomplyApiKey) {
    return;
  }

  // Update sync record
  await prisma.productSync.upsert({
    where: {
      shop_shopifyProductId: {
        shop,
        shopifyProductId: String(payload.id),
      },
    },
    create: {
      shop,
      shopifyProductId: String(payload.id),
      syncStatus: "pending",
    },
    update: {
      syncStatus: "pending",
      lastSyncedAt: new Date(),
    },
  });

  // TODO: Queue job to update DPP
}

async function handleProductDelete(shop: string, payload: any) {
  console.log(`Product deleted in ${shop}: ${payload.id}`);

  // Remove sync record
  await prisma.productSync.deleteMany({
    where: {
      shop,
      shopifyProductId: String(payload.id),
    },
  });

  // TODO: Optionally revoke/delete the DPP in EuroComply
}

async function handleAppUninstalled(shop: string) {
  console.log(`App uninstalled from ${shop}`);

  // Clean up shop data
  await prisma.shopSettings.deleteMany({
    where: { shop },
  });

  await prisma.productSync.deleteMany({
    where: { shop },
  });

  // Session cleanup is handled by Prisma session storage
}

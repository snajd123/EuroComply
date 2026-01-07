/**
 * App Proxy Route: QR Code Generation
 *
 * Accessible at: /apps/eurocomply/api/qr/:dppId
 *
 * Returns a QR code that links to the verification page.
 */

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { createEuroComplyClient } from "../services/eurocomply.server";
import prisma from "../db.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const dppId = params.dppId;
  const shop = url.searchParams.get("shop");

  if (!dppId) {
    return json({ error: "DPP ID required" }, { status: 400 });
  }

  const headers: HeadersInit = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Cache-Control": "public, max-age=3600", // Cache for 1 hour
  };

  try {
    // Get shop settings
    let settings;
    if (shop) {
      settings = await prisma.shopSettings.findUnique({
        where: { shop },
      });
    } else {
      const sync = await prisma.productSync.findFirst({
        where: { eurocomplyDppId: dppId },
      });
      if (sync) {
        settings = await prisma.shopSettings.findUnique({
          where: { shop: sync.shop },
        });
      }
    }

    if (!settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
      return json({ error: "Not configured" }, { status: 400, headers });
    }

    const eurocomply = createEuroComplyClient({
      eurocomplyApiKey: settings.eurocomplyApiKey,
      eurocomplyOrgId: settings.eurocomplyOrgId,
    });

    if (!eurocomply) {
      return json({ error: "Client error" }, { status: 500, headers });
    }

    const qrCode = await eurocomply.generateQrCode(dppId);

    return json(
      {
        dataUrl: qrCode.dataUrl,
        url: qrCode.url,
      },
      { headers }
    );
  } catch (error) {
    console.error("QR generation error:", error);
    return json({ error: "QR generation failed" }, { status: 500, headers });
  }
};

export const options = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
};

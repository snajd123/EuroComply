/**
 * App Proxy Route: Public DPP Verification API
 *
 * Accessible at: /apps/eurocomply/api/verify/:dppId
 *
 * This endpoint is called by the theme JavaScript to:
 * 1. Fetch the current DPP data from EuroComply
 * 2. Compare with the VC-signed data hash
 * 3. Return integrity status for display in the badge
 *
 * No authentication required (public endpoint for customers).
 */

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  verifyDataIntegrity,
  computeDataHash,
  generateVerificationJson,
  generateVerificationWidget,
  generateBadgeHtml,
} from "../services/data-integrity.server";
import { createEuroComplyClient } from "../services/eurocomply.server";
import prisma from "../db.server";

// App proxy adds shop info to query params
interface AppProxyQuery {
  shop?: string;
  logged_in_customer_id?: string;
  path_prefix?: string;
  timestamp?: string;
  signature?: string;
}

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const dppId = params.dppId;

  // App proxy adds shop parameter
  const shop = url.searchParams.get("shop");
  const format = url.searchParams.get("format") || "json"; // json, html, widget

  if (!dppId) {
    return json({ error: "DPP ID required" }, { status: 400 });
  }

  // For public access, we need to look up the shop from the DPP
  // In a real implementation, you'd validate the app proxy signature

  try {
    // Get shop settings (in production, derive from DPP or app proxy signature)
    let settings;
    if (shop) {
      settings = await prisma.shopSettings.findUnique({
        where: { shop },
      });
    } else {
      // Try to find by DPP ID in sync records
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
      return json(
        {
          status: "ERROR",
          verified: false,
          message: "Verification service not configured",
        },
        {
          status: 200, // Return 200 so badge can display error state
          headers: getCorsHeaders(),
        }
      );
    }

    const eurocomply = createEuroComplyClient({
      eurocomplyApiKey: settings.eurocomplyApiKey,
      eurocomplyOrgId: settings.eurocomplyOrgId,
    });

    if (!eurocomply) {
      return json(
        {
          status: "ERROR",
          verified: false,
          message: "Unable to connect to verification service",
        },
        { headers: getCorsHeaders() }
      );
    }

    // Fetch DPP from EuroComply
    const dpp = await eurocomply.getDpp(dppId);

    // Get verification result from EuroComply (VC verification)
    let vcVerification;
    try {
      vcVerification = await eurocomply.verifyDpp(dppId);
    } catch (e) {
      // VC not issued or verification failed
    }

    // Compute data integrity status
    const currentDataHash = computeDataHash(dpp.data);

    // The VC contains the data hash at issuance time
    // In production, this would be extracted from the VC claims
    const vcDataHash = dpp.dataHash || currentDataHash; // Fallback if no hash stored

    const integrityResult = verifyDataIntegrity({
      currentData: dpp.data,
      vcData: dpp.vcData || dpp.data, // The data at VC issuance time
      vcIssuedAt: dpp.anchoredAt || dpp.createdAt,
      vcExpiresAt: dpp.expiresAt,
      vcRevoked: dpp.anchorStatus === "REVOKED",
      dataModifiedAt: dpp.updatedAt,
    });

    // Combine VC verification with data integrity
    const isVcValid = vcVerification?.valid ?? false;
    const combinedStatus = !isVcValid && integrityResult.status === "VERIFIED"
      ? "PENDING"
      : integrityResult.status;

    const verifyUrl = `${process.env.EUROCOMPLY_API_URL || "https://app.eurocomply.eu"}/verify/${dppId}`;

    // Return based on format
    if (format === "widget") {
      // Return full HTML widget (for embedding)
      let qrDataUrl = "";
      try {
        const qr = await eurocomply.generateQrCode(dppId);
        qrDataUrl = qr.dataUrl;
      } catch (e) {}

      const html = generateVerificationWidget(integrityResult, qrDataUrl, verifyUrl);

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...getCorsHeaders(),
        },
      });
    }

    if (format === "badge") {
      // Return just the badge HTML
      const html = generateBadgeHtml(integrityResult);

      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...getCorsHeaders(),
        },
      });
    }

    // Default: JSON response
    const jsonResponse = generateVerificationJson(
      { ...integrityResult, status: combinedStatus as any },
      verifyUrl
    );

    // Add additional context
    const response = {
      ...jsonResponse,
      dppId,
      productName: dpp.data.productName,
      category: dpp.data.category || "textile",
      vcVerification: vcVerification
        ? {
            valid: vcVerification.valid,
            checks: vcVerification.checks,
            issuer: vcVerification.issuer,
          }
        : null,
    };

    return json(response, {
      headers: getCorsHeaders(),
    });
  } catch (error) {
    console.error("Verification error:", error);

    return json(
      {
        status: "ERROR",
        verified: false,
        message: error instanceof Error ? error.message : "Verification failed",
        badge: {
          color: "red",
          icon: "✕",
          text: "Error",
          tooltip: "Unable to verify credential",
        },
      },
      {
        status: 200, // Return 200 so client can handle gracefully
        headers: getCorsHeaders(),
      }
    );
  }
};

/**
 * Get CORS headers for cross-origin requests from theme
 */
function getCorsHeaders(): HeadersInit {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=60", // Cache for 1 minute
  };
}

/**
 * Handle OPTIONS preflight for CORS
 */
export const options = async () => {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(),
  });
};

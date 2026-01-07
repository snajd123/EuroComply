import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  Box,
  Divider,
  DescriptionList,
  Button,
  Icon,
} from "@shopify/polaris";
import { CheckCircleIcon, XCircleIcon, ClockIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createEuroComplyClient } from "../services/eurocomply.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const dppId = params.id;

  if (!dppId) {
    throw new Response("DPP ID required", { status: 400 });
  }

  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
    throw new Response("EuroComply not configured", { status: 400 });
  }

  const eurocomply = createEuroComplyClient({
    eurocomplyApiKey: settings.eurocomplyApiKey,
    eurocomplyOrgId: settings.eurocomplyOrgId,
  });

  if (!eurocomply) {
    throw new Response("Failed to create client", { status: 500 });
  }

  try {
    // Fetch DPP details
    const dpp = await eurocomply.getDpp(dppId);

    // Fetch verification result
    let verification = null;
    try {
      verification = await eurocomply.verifyDpp(dppId);
    } catch (e) {
      console.error("Verification failed:", e);
    }

    // Generate QR code
    let qrCode = null;
    try {
      qrCode = await eurocomply.generateQrCode(dppId);
    } catch (e) {
      console.error("QR generation failed:", e);
    }

    return json({
      dpp,
      verification,
      qrCode,
      eurocomplyUrl: process.env.EUROCOMPLY_API_URL || 'http://localhost:3000',
    });
  } catch (error) {
    throw new Response(
      error instanceof Error ? error.message : "Failed to load DPP",
      { status: 500 }
    );
  }
};

export default function DppViewer() {
  const { dpp, verification, qrCode, eurocomplyUrl } = useLoaderData<typeof loader>();

  const publicVerifyUrl = `${eurocomplyUrl}/v1/passports/${dpp.id}/verify`;

  const renderVerificationStatus = () => {
    if (!verification) {
      return (
        <Banner tone="warning">
          <p>Verification unavailable - walt.id services may not be running.</p>
        </Banner>
      );
    }

    if (verification.valid) {
      return (
        <Banner tone="success">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={CheckCircleIcon} />
            <Text as="span" fontWeight="bold">
              Verifiable Credential Verified
            </Text>
          </InlineStack>
          <BlockStack gap="200">
            <Text as="p">
              This DPP is backed by a cryptographically signed W3C Verifiable Credential.
              The signature has been verified against the issuer's DID.
            </Text>
            <InlineStack gap="300">
              <Badge tone="success">Signature: Valid</Badge>
              <Badge tone="success">Not Expired</Badge>
              <Badge tone="success">Not Revoked</Badge>
            </InlineStack>
          </BlockStack>
        </Banner>
      );
    }

    return (
      <Banner tone="critical">
        <InlineStack gap="200" blockAlign="center">
          <Icon source={XCircleIcon} />
          <Text as="span" fontWeight="bold">
            Verification Failed
          </Text>
        </InlineStack>
        <BlockStack gap="200">
          <InlineStack gap="300">
            <Badge tone={verification.checks.signature ? "success" : "critical"}>
              Signature: {verification.checks.signature ? "Valid" : "Invalid"}
            </Badge>
            <Badge tone={verification.checks.expiration ? "success" : "critical"}>
              Expiration: {verification.checks.expiration ? "OK" : "Expired"}
            </Badge>
            <Badge tone={verification.checks.revocation ? "success" : "critical"}>
              Revocation: {verification.checks.revocation ? "OK" : "Revoked"}
            </Badge>
          </InlineStack>
        </BlockStack>
      </Banner>
    );
  };

  const renderAnchorStatus = () => {
    switch (dpp.anchorStatus) {
      case "ANCHORED":
        return <Badge tone="success">VC Issued</Badge>;
      case "PENDING":
        return (
          <Badge tone="warning">
            <InlineStack gap="100" blockAlign="center">
              <Icon source={ClockIcon} />
              <span>Pending</span>
            </InlineStack>
          </Badge>
        );
      case "FAILED":
        return <Badge tone="critical">Failed</Badge>;
      default:
        return <Badge tone="attention">Not Issued</Badge>;
    }
  };

  return (
    <Page
      title={`Digital Product Passport`}
      subtitle={dpp.data.productName}
      backAction={{ content: "Products", url: "/app/products" }}
    >
      <BlockStack gap="500">
        {renderVerificationStatus()}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    DPP Details
                  </Text>
                  {renderAnchorStatus()}
                </InlineStack>

                <Divider />

                <DescriptionList
                  items={[
                    {
                      term: "DPP ID",
                      description: dpp.id,
                    },
                    {
                      term: "Product Name",
                      description: dpp.data.productName,
                    },
                    {
                      term: "Manufacturer",
                      description: `${dpp.data.manufacturerName}${dpp.data.manufacturerCountry ? ` (${dpp.data.manufacturerCountry})` : ''}`,
                    },
                    {
                      term: "Version",
                      description: dpp.version || "1.0",
                    },
                    {
                      term: "Created",
                      description: new Date(dpp.createdAt).toLocaleString(),
                    },
                    {
                      term: "Last Updated",
                      description: new Date(dpp.updatedAt).toLocaleString(),
                    },
                  ]}
                />

                {dpp.credentialId && (
                  <>
                    <Divider />
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingSm">
                        Verifiable Credential
                      </Text>
                      <DescriptionList
                        items={[
                          {
                            term: "Credential ID",
                            description: dpp.credentialId,
                          },
                          {
                            term: "Issuer DID",
                            description: verification?.issuer?.did || "Loading...",
                          },
                        ]}
                      />
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Sustainability Data */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Sustainability Data
                </Text>

                <Divider />

                <DescriptionList
                  items={[
                    ...(dpp.data.carbonFootprint ? [{
                      term: "Carbon Footprint",
                      description: `${dpp.data.carbonFootprint.value} ${dpp.data.carbonFootprint.unit}${dpp.data.carbonFootprint.methodology ? ` (${dpp.data.carbonFootprint.methodology})` : ''}`,
                    }] : []),
                    ...(dpp.data.recyclability ? [{
                      term: "Recyclability",
                      description: `${dpp.data.recyclability.percentage}%${dpp.data.recyclability.instructions ? ` - ${dpp.data.recyclability.instructions}` : ''}`,
                    }] : []),
                    ...(dpp.data.durability ? [{
                      term: "Expected Lifespan",
                      description: `${dpp.data.durability.expectedLifespan} ${dpp.data.durability.unit}`,
                    }] : []),
                    ...(dpp.data.repairability ? [{
                      term: "Repairability Score",
                      description: `${dpp.data.repairability.score}/10`,
                    }] : []),
                  ]}
                />

                {(!dpp.data.carbonFootprint && !dpp.data.recyclability && !dpp.data.durability && !dpp.data.repairability) && (
                  <Text as="p" tone="subdued">
                    No sustainability data added yet. Edit the DPP to add carbon footprint, recyclability, and other sustainability metrics.
                  </Text>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            {/* QR Code */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  QR Code
                </Text>

                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  {qrCode?.dataUrl ? (
                    <img
                      src={qrCode.dataUrl}
                      alt="DPP QR Code"
                      style={{ width: '100%', maxWidth: '200px', margin: '0 auto', display: 'block' }}
                    />
                  ) : (
                    <Text as="p" tone="subdued" alignment="center">
                      QR code generation pending...
                    </Text>
                  )}
                </Box>

                <Text as="p" tone="subdued">
                  Scan this QR code to verify the DPP. Anyone can verify the authenticity of this product's sustainability claims.
                </Text>

                {qrCode?.url && (
                  <Button url={qrCode.url} external>
                    Open Verification Page
                  </Button>
                )}
              </BlockStack>
            </Card>

            {/* Technical Details */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Technical Details
                </Text>

                <DescriptionList
                  items={[
                    {
                      term: "Format",
                      description: "W3C Verifiable Credential",
                    },
                    {
                      term: "Signature",
                      description: "ES256 (ECDSA)",
                    },
                    {
                      term: "DID Method",
                      description: "did:web",
                    },
                    {
                      term: "Public Verify URL",
                      description: (
                        <Text as="span" variant="bodySm" breakWord>
                          {publicVerifyUrl}
                        </Text>
                      ),
                    },
                  ]}
                />

                <Button
                  url={publicVerifyUrl}
                  external
                  variant="plain"
                >
                  View Raw Verification Response
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

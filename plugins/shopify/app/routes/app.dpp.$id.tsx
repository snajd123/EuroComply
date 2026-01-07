import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams } from "@remix-run/react";
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
  DataTable,
  ProgressBar,
  Tooltip,
  Tag,
} from "@shopify/polaris";
import {
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  LeafIcon,
  GlobeIcon,
  ShieldCheckIcon,
} from "@shopify/polaris-icons";
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
  const [searchParams] = useSearchParams();
  const justCreated = searchParams.get("created") === "true";

  const publicVerifyUrl = `${eurocomplyUrl}/v1/passports/${dpp.id}/verify`;

  // Extract textile-specific data
  const fiberComposition = dpp.data.fiberComposition || [];
  const careInstructions = dpp.data.careInstructions;
  const certifications = dpp.data.certifications || [];
  const hazardousSubstances = dpp.data.hazardousSubstances;

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

  const renderFiberComposition = () => {
    if (fiberComposition.length === 0) return null;

    const rows = fiberComposition.map((fiber: any) => [
      fiber.fiberType?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      `${fiber.percentage}%`,
      fiber.origin?.replace(/_/g, " "),
      fiber.countryOfOrigin || "-",
    ]);

    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={LeafIcon} tone="success" />
            <Text as="h2" variant="headingMd">
              Fiber Composition
            </Text>
          </InlineStack>

          <DataTable
            columnContentTypes={["text", "numeric", "text", "text"]}
            headings={["Fiber Type", "Percentage", "Origin", "Country"]}
            rows={rows}
          />

          {/* Visual composition bar */}
          <Box paddingBlockStart="200">
            <InlineStack gap="100">
              {fiberComposition.map((fiber: any, index: number) => (
                <Tooltip key={index} content={`${fiber.fiberType}: ${fiber.percentage}%`}>
                  <Box
                    background={getFiberColor(fiber.fiberType)}
                    minHeight="20px"
                    borderRadius="100"
                    style={{ width: `${fiber.percentage}%`, minWidth: fiber.percentage > 5 ? "20px" : "8px" }}
                  />
                </Tooltip>
              ))}
            </InlineStack>
          </Box>
        </BlockStack>
      </Card>
    );
  };

  const renderCareInstructions = () => {
    if (!careInstructions) return null;

    return (
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Care Instructions
          </Text>
          <Divider />

          <InlineStack gap="300" wrap>
            {careInstructions.maxWashTemperature !== null && (
              <Tag>Wash: {careInstructions.maxWashTemperature}°C</Tag>
            )}
            {careInstructions.maxWashTemperature === null && (
              <Tag>Do not wash</Tag>
            )}
            <Tag>{careInstructions.bleachAllowed ? "Bleach OK" : "No bleach"}</Tag>
            <Tag>{careInstructions.tumbleDryAllowed ? "Tumble dry OK" : "No tumble dry"}</Tag>
            <Tag>Iron: {careInstructions.ironTemperature}</Tag>
            <Tag>{careInstructions.dryCleanAllowed ? "Dry clean OK" : "No dry clean"}</Tag>
          </InlineStack>

          {careInstructions.specialInstructions && (
            <BlockStack gap="100">
              <Text as="span" fontWeight="semibold">Special Instructions:</Text>
              <Text as="p" tone="subdued">{careInstructions.specialInstructions}</Text>
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    );
  };

  const renderCertifications = () => {
    if (certifications.length === 0) return null;

    return (
      <Card>
        <BlockStack gap="400">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={ShieldCheckIcon} tone="success" />
            <Text as="h2" variant="headingMd">
              Certifications ({certifications.length})
            </Text>
          </InlineStack>
          <Divider />

          {certifications.map((cert: any, index: number) => (
            <BlockStack key={index} gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="span" fontWeight="semibold">{cert.type}</Text>
                <Badge tone="success">Valid</Badge>
              </InlineStack>
              <DescriptionList
                items={[
                  { term: "Certificate #", description: cert.certificateNumber },
                  { term: "Issuing Body", description: cert.issuingBody },
                  { term: "Valid Until", description: new Date(cert.validUntil).toLocaleDateString() },
                ]}
              />
              {index < certifications.length - 1 && <Divider />}
            </BlockStack>
          ))}
        </BlockStack>
      </Card>
    );
  };

  const renderHazardousSubstances = () => {
    if (!hazardousSubstances) return null;

    return (
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            Chemical Safety
          </Text>
          <Divider />

          <InlineStack gap="200" blockAlign="center">
            <Badge tone={hazardousSubstances.reachCompliant ? "success" : "critical"}>
              REACH: {hazardousSubstances.reachCompliant ? "Compliant" : "Non-compliant"}
            </Badge>
            {hazardousSubstances.scipNotificationId && (
              <Badge tone="info">SCIP: {hazardousSubstances.scipNotificationId}</Badge>
            )}
          </InlineStack>

          {hazardousSubstances.substancesOfConcern?.length > 0 && (
            <BlockStack gap="100">
              <Text as="span" fontWeight="semibold">Substances of Concern:</Text>
              {hazardousSubstances.substancesOfConcern.map((substance: any, index: number) => (
                <Text key={index} as="p" tone="subdued">
                  • {substance.name} ({substance.concentration}% in {substance.location})
                </Text>
              ))}
            </BlockStack>
          )}
        </BlockStack>
      </Card>
    );
  };

  return (
    <Page
      title={`Digital Product Passport`}
      subtitle={dpp.data.productName}
      backAction={{ content: "Products", url: "/app/products" }}
      secondaryActions={[
        {
          content: "Edit DPP",
          url: `/app/dpp/${dpp.id}/edit`,
        },
      ]}
    >
      <BlockStack gap="500">
        {justCreated && (
          <Banner tone="success" title="DPP Created Successfully">
            <p>
              Your Digital Product Passport has been created with a Verifiable Credential.
              The sustainability data is now cryptographically protected and independently verifiable.
            </p>
          </Banner>
        )}

        {renderVerificationStatus()}

        <Layout>
          <Layout.Section>
            {/* Product Info */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <Text as="h2" variant="headingMd">
                    Product Information
                  </Text>
                  {renderAnchorStatus()}
                </InlineStack>

                <Divider />

                <DescriptionList
                  items={[
                    { term: "DPP ID", description: dpp.id },
                    { term: "Product Name", description: dpp.data.productName },
                    { term: "Category", description: dpp.data.category || "textile" },
                    {
                      term: "Manufacturer",
                      description: `${dpp.data.manufacturerName || dpp.data.manufacturer?.name}${
                        dpp.data.manufacturerCountry || dpp.data.manufacturer?.country
                          ? ` (${dpp.data.manufacturerCountry || dpp.data.manufacturer?.country})`
                          : ""
                      }`,
                    },
                    {
                      term: "Country of Manufacture",
                      description: dpp.data.countryOfManufacture || "Not specified",
                    },
                    { term: "Created", description: new Date(dpp.createdAt).toLocaleString() },
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
                          { term: "Credential ID", description: dpp.credentialId },
                          { term: "Issuer DID", description: verification?.issuer?.did || "Loading..." },
                        ]}
                      />
                    </BlockStack>
                  </>
                )}
              </BlockStack>
            </Card>

            {/* Fiber Composition */}
            {renderFiberComposition()}

            {/* Care Instructions */}
            {renderCareInstructions()}

            {/* Certifications */}
            {renderCertifications()}

            {/* Hazardous Substances */}
            {renderHazardousSubstances()}

            {/* Sustainability Data */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Environmental Impact
                </Text>

                <Divider />

                {dpp.data.carbonFootprint ? (
                  <BlockStack gap="200">
                    <InlineStack align="space-between">
                      <Text as="span" fontWeight="semibold">Carbon Footprint</Text>
                      <Text as="span" variant="headingLg">
                        {dpp.data.carbonFootprint.value} kgCO2e
                      </Text>
                    </InlineStack>
                    <InlineStack gap="200">
                      <Badge>{dpp.data.carbonFootprint.methodology}</Badge>
                      <Badge>{dpp.data.carbonFootprint.scope?.replace(/_/g, " ")}</Badge>
                      <Badge tone={dpp.data.carbonFootprint.confidence === "third_party_verified" ? "success" : "attention"}>
                        {dpp.data.carbonFootprint.confidence?.replace(/_/g, " ")}
                      </Badge>
                    </InlineStack>
                  </BlockStack>
                ) : (
                  <Text as="p" tone="subdued">Carbon footprint not calculated</Text>
                )}

                <Divider />

                <DescriptionList
                  items={[
                    ...(dpp.data.recyclability ? [{
                      term: "Recyclability",
                      description: `${dpp.data.recyclability.recyclablePercentage || dpp.data.recyclability.percentage}%`,
                    }] : []),
                    ...(dpp.data.durability ? [{
                      term: "Expected Lifespan",
                      description: `${dpp.data.durability.expectedLifespanYears || dpp.data.durability.expectedLifespan} years`,
                    }] : []),
                    ...(dpp.data.durability?.warrantyYears ? [{
                      term: "Warranty",
                      description: `${dpp.data.durability.warrantyYears} years`,
                    }] : []),
                    ...(dpp.data.waterFootprint ? [{
                      term: "Water Footprint",
                      description: `${dpp.data.waterFootprint.value} liters`,
                    }] : []),
                  ]}
                />

                {dpp.data.recyclability?.endOfLifeInstructions && (
                  <BlockStack gap="100">
                    <Text as="span" fontWeight="semibold">End of Life Instructions:</Text>
                    <Text as="p" tone="subdued">{dpp.data.recyclability.endOfLifeInstructions}</Text>
                  </BlockStack>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            {/* QR Code */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Verification QR Code
                </Text>

                <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                  {qrCode?.dataUrl ? (
                    <img
                      src={qrCode.dataUrl}
                      alt="DPP QR Code"
                      style={{ width: "100%", maxWidth: "200px", margin: "0 auto", display: "block" }}
                    />
                  ) : (
                    <Text as="p" tone="subdued" alignment="center">
                      QR code generation pending...
                    </Text>
                  )}
                </Box>

                <Text as="p" tone="subdued">
                  Scan to verify the authenticity of this product's sustainability claims.
                </Text>

                {qrCode?.url && (
                  <Button url={qrCode.url} external fullWidth>
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
                    { term: "Format", description: "W3C Verifiable Credential" },
                    { term: "Signature", description: "ES256 (ECDSA)" },
                    { term: "DID Method", description: "did:web" },
                    { term: "Compliance", description: "EU ESPR 2027" },
                  ]}
                />

                <Divider />

                <BlockStack gap="200">
                  <Text as="span" variant="bodySm" fontWeight="semibold">Public Verify URL:</Text>
                  <Text as="span" variant="bodySm" breakWord tone="subdued">
                    {publicVerifyUrl}
                  </Text>
                </BlockStack>

                <Button url={publicVerifyUrl} external variant="plain">
                  View Raw Verification Response
                </Button>
              </BlockStack>
            </Card>

            {/* ESPR Compliance */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={GlobeIcon} />
                  <Text as="h2" variant="headingMd">
                    EU ESPR Compliance
                  </Text>
                </InlineStack>

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span">2027 Minimal DPP</Text>
                    <Badge tone="success">Ready</Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span">2030 Advanced DPP</Text>
                    <Badge tone={dpp.data.carbonFootprint ? "success" : "attention"}>
                      {dpp.data.carbonFootprint ? "Ready" : "Partial"}
                    </Badge>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span">2033 Full Circular</Text>
                    <Badge tone={dpp.data.supplyChain?.length > 0 ? "success" : "attention"}>
                      {dpp.data.supplyChain?.length > 0 ? "Ready" : "Pending"}
                    </Badge>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

// Helper function to get fiber color for visualization
function getFiberColor(fiberType: string): string {
  const colors: Record<string, string> = {
    cotton: "bg-fill-success",
    organic_cotton: "bg-fill-success-secondary",
    polyester: "bg-fill-info",
    recycled_polyester: "bg-fill-info-secondary",
    wool: "bg-fill-warning",
    silk: "bg-fill-magic",
    linen: "bg-fill-success",
    nylon: "bg-fill-info",
    elastane: "bg-fill-caution",
    viscose: "bg-fill-emphasis",
  };
  return colors[fiberType] || "bg-fill-secondary";
}

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, Link } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Banner,
  Button,
  EmptyState,
  Icon,
  Box,
  Divider,
} from "@shopify/polaris";
import { CheckCircleIcon, LockIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Get shop settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  // Get product sync stats
  const syncStats = await prisma.productSync.groupBy({
    by: ["syncStatus"],
    where: { shop: session.shop },
    _count: { syncStatus: true },
  });

  // Get recent synced products with DPP IDs
  const recentSyncs = await prisma.productSync.findMany({
    where: { shop: session.shop },
    orderBy: { lastSyncedAt: "desc" },
    take: 5,
  });

  // Get total products from Shopify
  const response = await admin.graphql(`
    query {
      productsCount {
        count
      }
    }
  `);
  const data = await response.json();
  const totalProducts = data.data?.productsCount?.count || 0;

  return json({
    shop: session.shop,
    isConfigured: !!settings?.eurocomplyApiKey && !!settings?.eurocomplyOrgId,
    autoSyncEnabled: settings?.autoSyncEnabled ?? true,
    totalProducts,
    syncStats: syncStats.reduce((acc, stat) => {
      acc[stat.syncStatus] = stat._count.syncStatus;
      return acc;
    }, {} as Record<string, number>),
    recentSyncs,
  });
};

export default function Index() {
  const { shop, isConfigured, autoSyncEnabled, totalProducts, syncStats, recentSyncs } = useLoaderData<typeof loader>();

  const syncedCount = syncStats.synced || 0;
  const pendingCount = syncStats.pending || 0;
  const errorCount = syncStats.error || 0;
  const vcIssuedCount = syncedCount; // All synced products have VCs

  return (
    <Page title="EuroComply Digital Product Passports">
      <BlockStack gap="500">
        {!isConfigured && (
          <Banner
            title="Complete your setup"
            tone="warning"
            action={{ content: "Configure", url: "/app/settings" }}
          >
            <p>Connect your EuroComply account to start issuing Verifiable Credentials for your products.</p>
          </Banner>
        )}

        {isConfigured && (
          <Banner tone="success">
            <InlineStack gap="200" blockAlign="center">
              <Icon source={LockIcon} />
              <Text as="span" fontWeight="bold">
                Cryptographic Protection Active
              </Text>
            </InlineStack>
            <Text as="p">
              Your DPPs are backed by W3C Verifiable Credentials signed with your organization's DID.
              Sustainability claims are tamper-proof and independently verifiable.
            </Text>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  DPP Overview
                </Text>
                <InlineStack gap="800" align="start">
                  <BlockStack gap="100">
                    <Text as="p" variant="headingXl">
                      {totalProducts}
                    </Text>
                    <Text as="p" tone="subdued">
                      Total Products
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="p" variant="headingXl">
                        {vcIssuedCount}
                      </Text>
                      {vcIssuedCount > 0 && <Icon source={CheckCircleIcon} tone="success" />}
                    </InlineStack>
                    <Text as="p" tone="subdued">
                      VCs Issued
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingXl">
                      {pendingCount}
                    </Text>
                    <Text as="p" tone="subdued">
                      Pending
                    </Text>
                  </BlockStack>
                  {errorCount > 0 && (
                    <BlockStack gap="100">
                      <Text as="p" variant="headingXl" tone="critical">
                        {errorCount}
                      </Text>
                      <Text as="p" tone="subdued">
                        Errors
                      </Text>
                    </BlockStack>
                  )}
                </InlineStack>

                <Divider />

                <InlineStack gap="300">
                  <Badge tone={autoSyncEnabled ? "success" : "attention"}>
                    Auto-sync: {autoSyncEnabled ? "ON" : "OFF"}
                  </Badge>
                  <Badge tone="info">DID Method: did:web</Badge>
                  <Badge tone="info">Signature: ES256</Badge>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Your Competitive Edge
                </Text>
                <Text as="p" tone="subdued">
                  Unlike basic DPP solutions, EuroComply issues <strong>W3C Verifiable Credentials</strong> that can't be forged or modified.
                </Text>
                <BlockStack gap="200">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="span">Tamper-proof sustainability claims</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="span">Greenwashing defense</Text>
                  </InlineStack>
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="span">EBSI-compatible DIDs</Text>
                  </InlineStack>
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <Layout>
          <Layout.Section>
            {recentSyncs.length > 0 ? (
              <Card>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h2" variant="headingMd">
                      Recent Activity
                    </Text>
                    <Button url="/app/products" variant="plain">
                      View All Products
                    </Button>
                  </InlineStack>

                  {recentSyncs.map((sync) => (
                    <InlineStack key={sync.id} align="space-between" blockAlign="center">
                      <BlockStack gap="050">
                        <Text as="span" fontWeight="semibold">
                          Product #{sync.shopifyProductId}
                        </Text>
                        {sync.eurocomplyDppId && (
                          <Text as="span" tone="subdued" variant="bodySm">
                            DPP: {sync.eurocomplyDppId}
                          </Text>
                        )}
                      </BlockStack>
                      <InlineStack gap="200" blockAlign="center">
                        <Badge
                          tone={
                            sync.syncStatus === "synced"
                              ? "success"
                              : sync.syncStatus === "error"
                              ? "critical"
                              : "attention"
                          }
                        >
                          {sync.syncStatus === "synced" ? "VC Issued" : sync.syncStatus}
                        </Badge>
                        {sync.eurocomplyDppId && (
                          <Link to={`/app/dpp/${sync.eurocomplyDppId}`}>
                            <Button size="slim" variant="plain">View</Button>
                          </Link>
                        )}
                      </InlineStack>
                    </InlineStack>
                  ))}
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <EmptyState
                  heading="No products synced yet"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  action={{ content: "View Products", url: "/app/products" }}
                >
                  <p>
                    Start syncing your products to generate Digital Product Passports with Verifiable Credentials.
                    Each DPP will be cryptographically signed and tamper-proof.
                  </p>
                </EmptyState>
              </Card>
            )}
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  ESPR Compliance
                </Text>
                <Text as="p" tone="subdued">
                  The EU Ecodesign for Sustainable Products Regulation requires Digital Product Passports starting 2026.
                </Text>
                <Text as="p" tone="subdued">
                  Get ahead of compliance with cryptographically verifiable DPPs.
                </Text>
                <Button url="/app/products" variant="primary">
                  Create DPPs Now
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

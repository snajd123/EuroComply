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
  Button,
  EmptyState,
} from "@shopify/polaris";
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

  // Get recent synced products
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
    isConfigured: !!settings?.eurocomplyApiKey,
    totalProducts,
    syncStats: syncStats.reduce((acc, stat) => {
      acc[stat.syncStatus] = stat._count.syncStatus;
      return acc;
    }, {} as Record<string, number>),
    recentSyncs,
  });
};

export default function Index() {
  const { shop, isConfigured, totalProducts, syncStats, recentSyncs } = useLoaderData<typeof loader>();

  const syncedCount = syncStats.synced || 0;
  const pendingCount = syncStats.pending || 0;
  const errorCount = syncStats.error || 0;

  return (
    <Page title="EuroComply Digital Product Passports">
      <BlockStack gap="500">
        {!isConfigured && (
          <Banner
            title="Complete your setup"
            tone="warning"
            action={{ content: "Configure", url: "/app/settings" }}
          >
            <p>Connect your EuroComply account to start generating Digital Product Passports.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  DPP Overview
                </Text>
                <InlineStack gap="400" align="start">
                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg">
                      {totalProducts}
                    </Text>
                    <Text as="p" tone="subdued">
                      Total Products
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg">
                      {syncedCount}
                    </Text>
                    <Text as="p" tone="subdued">
                      DPPs Created
                    </Text>
                  </BlockStack>
                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg">
                      {pendingCount}
                    </Text>
                    <Text as="p" tone="subdued">
                      Pending Sync
                    </Text>
                  </BlockStack>
                  {errorCount > 0 && (
                    <BlockStack gap="100">
                      <Text as="p" variant="headingLg" tone="critical">
                        {errorCount}
                      </Text>
                      <Text as="p" tone="subdued">
                        Errors
                      </Text>
                    </BlockStack>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  ESPR Compliance
                </Text>
                <Text as="p" tone="subdued">
                  Digital Product Passports enable compliance with the EU Ecodesign for Sustainable Products Regulation.
                </Text>
                <Button url="https://eurocomply.io/docs/espr" external>
                  Learn More
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        {recentSyncs.length > 0 ? (
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">
                Recent Activity
              </Text>
              {recentSyncs.map((sync) => (
                <InlineStack key={sync.id} align="space-between">
                  <Text as="span">Product #{sync.shopifyProductId}</Text>
                  <Badge
                    tone={
                      sync.syncStatus === "synced"
                        ? "success"
                        : sync.syncStatus === "error"
                        ? "critical"
                        : "attention"
                    }
                  >
                    {sync.syncStatus}
                  </Badge>
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
              <p>Start syncing your products to generate Digital Product Passports.</p>
            </EmptyState>
          </Card>
        )}
      </BlockStack>
    </Page>
  );
}

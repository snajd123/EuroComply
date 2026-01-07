import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation } from "@remix-run/react";
import {
  Page,
  Layout,
  Card,
  ResourceList,
  ResourceItem,
  Text,
  Thumbnail,
  Badge,
  Button,
  BlockStack,
  InlineStack,
  Banner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Get settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  // Get products from Shopify
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            status
            featuredImage {
              url
              altText
            }
            variants(first: 1) {
              edges {
                node {
                  sku
                }
              }
            }
          }
        }
      }
    }
  `);

  const data = await response.json();
  const products = data.data?.products?.edges?.map((edge: any) => edge.node) || [];

  // Get product IDs (extract numeric ID from GID)
  const productIds = products.map((p: any) => {
    const match = p.id.match(/Product\/(\d+)/);
    return match ? match[1] : null;
  }).filter(Boolean);

  // Get sync status for these products
  const syncs = await prisma.productSync.findMany({
    where: {
      shop: session.shop,
      shopifyProductId: { in: productIds },
    },
  });

  const syncMap = syncs.reduce((acc, sync) => {
    acc[sync.shopifyProductId] = sync;
    return acc;
  }, {} as Record<string, typeof syncs[0]>);

  return json({
    products,
    syncMap,
    isConfigured: !!settings?.eurocomplyApiKey,
    eurocomplyOrgId: settings?.eurocomplyOrgId,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();
  const action = formData.get("action");
  const productId = formData.get("productId") as string;

  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings?.eurocomplyApiKey) {
    return json({ error: "EuroComply not configured" }, { status: 400 });
  }

  if (action === "sync") {
    // Create or update sync record
    await prisma.productSync.upsert({
      where: {
        shop_shopifyProductId: {
          shop: session.shop,
          shopifyProductId: productId,
        },
      },
      create: {
        shop: session.shop,
        shopifyProductId: productId,
        syncStatus: "pending",
      },
      update: {
        syncStatus: "pending",
        lastSyncedAt: new Date(),
      },
    });

    // TODO: Call EuroComply API to create DPP
    // This would integrate with packages/integrations for the actual sync

    return json({ success: true, message: "Sync initiated" });
  }

  if (action === "syncAll") {
    // Bulk sync all products
    const allProductIds = formData.getAll("productIds") as string[];

    for (const pid of allProductIds) {
      await prisma.productSync.upsert({
        where: {
          shop_shopifyProductId: {
            shop: session.shop,
            shopifyProductId: pid,
          },
        },
        create: {
          shop: session.shop,
          shopifyProductId: pid,
          syncStatus: "pending",
        },
        update: {
          syncStatus: "pending",
          lastSyncedAt: new Date(),
        },
      });
    }

    return json({ success: true, message: `${allProductIds.length} products queued for sync` });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function Products() {
  const { products, syncMap, isConfigured, eurocomplyOrgId } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const handleSync = (productId: string) => {
    const formData = new FormData();
    formData.append("action", "sync");
    formData.append("productId", productId);
    submit(formData, { method: "post" });
  };

  const handleSyncAll = () => {
    const formData = new FormData();
    formData.append("action", "syncAll");
    products.forEach((product: any) => {
      const match = product.id.match(/Product\/(\d+)/);
      if (match) {
        formData.append("productIds", match[1]);
      }
    });
    submit(formData, { method: "post" });
  };

  const getSyncBadge = (productId: string) => {
    const match = productId.match(/Product\/(\d+)/);
    if (!match) return null;

    const sync = syncMap[match[1]];
    if (!sync) return <Badge tone="attention">No DPP</Badge>;

    switch (sync.syncStatus) {
      case "synced":
        return <Badge tone="success">DPP Active</Badge>;
      case "pending":
        return <Badge tone="warning">Syncing...</Badge>;
      case "error":
        return <Badge tone="critical">Error</Badge>;
      default:
        return null;
    }
  };

  return (
    <Page
      title="Products"
      primaryAction={{
        content: "Sync All Products",
        onAction: handleSyncAll,
        loading: isLoading,
        disabled: !isConfigured,
      }}
    >
      <BlockStack gap="500">
        {!isConfigured && (
          <Banner
            title="EuroComply not configured"
            tone="warning"
            action={{ content: "Configure", url: "/app/settings" }}
          >
            <p>Connect your EuroComply account before syncing products.</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: "product", plural: "products" }}
                items={products}
                renderItem={(product: any) => {
                  const { id, title, handle, featuredImage, variants } = product;
                  const sku = variants?.edges?.[0]?.node?.sku || "No SKU";
                  const media = featuredImage ? (
                    <Thumbnail source={featuredImage.url} alt={featuredImage.altText || title} />
                  ) : (
                    <Thumbnail source="" alt="" />
                  );

                  return (
                    <ResourceItem
                      id={id}
                      media={media}
                      accessibilityLabel={`View details for ${title}`}
                    >
                      <InlineStack align="space-between" blockAlign="center">
                        <BlockStack gap="100">
                          <Text variant="bodyMd" fontWeight="bold" as="h3">
                            {title}
                          </Text>
                          <Text as="p" tone="subdued">
                            SKU: {sku}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="300" blockAlign="center">
                          {getSyncBadge(id)}
                          <Button
                            size="slim"
                            onClick={() => {
                              const match = id.match(/Product\/(\d+)/);
                              if (match) handleSync(match[1]);
                            }}
                            disabled={!isConfigured || isLoading}
                          >
                            Create DPP
                          </Button>
                        </InlineStack>
                      </InlineStack>
                    </ResourceItem>
                  );
                }}
              />
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}

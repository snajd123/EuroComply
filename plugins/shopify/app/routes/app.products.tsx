import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, Link } from "@remix-run/react";
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
  Icon,
} from "@shopify/polaris";
import { CheckCircleIcon, AlertTriangleIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { createEuroComplyClient } from "../services/eurocomply.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Get settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  // Get products from Shopify with more details for DPP creation
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            status
            vendor
            productType
            descriptionHtml
            featuredImage {
              url
              altText
            }
            variants(first: 1) {
              edges {
                node {
                  sku
                  barcode
                  weight
                  weightUnit
                }
              }
            }
            tags
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
    isConfigured: !!settings?.eurocomplyApiKey && !!settings?.eurocomplyOrgId,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const actionType = formData.get("action");
  const shopifyProductId = formData.get("productId") as string;

  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
    return json({ error: "EuroComply not configured" }, { status: 400 });
  }

  const eurocomply = createEuroComplyClient({
    eurocomplyApiKey: settings.eurocomplyApiKey,
    eurocomplyOrgId: settings.eurocomplyOrgId,
  });

  if (!eurocomply) {
    return json({ error: "Failed to create EuroComply client" }, { status: 500 });
  }

  if (actionType === "sync") {
    try {
      // Mark as pending
      await prisma.productSync.upsert({
        where: {
          shop_shopifyProductId: {
            shop: session.shop,
            shopifyProductId,
          },
        },
        create: {
          shop: session.shop,
          shopifyProductId,
          syncStatus: "pending",
        },
        update: {
          syncStatus: "pending",
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      });

      // Fetch full product data from Shopify
      const productResponse = await admin.graphql(`
        query getProduct($id: ID!) {
          product(id: $id) {
            id
            title
            handle
            vendor
            productType
            descriptionHtml
            variants(first: 10) {
              edges {
                node {
                  sku
                  barcode
                  weight
                  weightUnit
                }
              }
            }
            tags
          }
        }
      `, {
        variables: { id: `gid://shopify/Product/${shopifyProductId}` }
      });

      const productData = await productResponse.json();
      const shopifyProduct = productData.data?.product;

      if (!shopifyProduct) {
        throw new Error("Product not found in Shopify");
      }

      // Transform Shopify product for EuroComply
      const firstVariant = shopifyProduct.variants?.edges?.[0]?.node;
      const transformedProduct = {
        id: shopifyProductId,
        title: shopifyProduct.title,
        handle: shopifyProduct.handle,
        vendor: shopifyProduct.vendor,
        productType: shopifyProduct.productType,
        description: shopifyProduct.descriptionHtml?.replace(/<[^>]*>/g, '') || '',
        variants: shopifyProduct.variants?.edges?.map((e: any) => e.node) || [],
        tags: shopifyProduct.tags || [],
      };

      // Call EuroComply API to sync product and create DPP with Verifiable Credential
      const result = await eurocomply.syncShopifyProduct(transformedProduct, {
        // Default sustainability data - can be customized later
        manufacturerName: shopifyProduct.vendor || 'Unknown',
        manufacturerCountry: 'EU',
      });

      // Generate QR code
      const qrCode = await eurocomply.generateQrCode(result.dpp.id);

      // Update sync record with success
      await prisma.productSync.update({
        where: {
          shop_shopifyProductId: {
            shop: session.shop,
            shopifyProductId,
          },
        },
        data: {
          syncStatus: "synced",
          eurocomplyDppId: result.dpp.id,
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      });

      return json({
        success: true,
        message: "DPP created with Verifiable Credential",
        dppId: result.dpp.id,
        credentialId: result.dpp.credentialId,
      });

    } catch (error) {
      console.error("DPP sync error:", error);

      // Update sync record with error
      await prisma.productSync.update({
        where: {
          shop_shopifyProductId: {
            shop: session.shop,
            shopifyProductId,
          },
        },
        data: {
          syncStatus: "error",
          errorMessage: error instanceof Error ? error.message : "Unknown error",
        },
      });

      return json({
        error: error instanceof Error ? error.message : "Failed to create DPP",
      }, { status: 500 });
    }
  }

  if (actionType === "syncAll") {
    const allProductIds = formData.getAll("productIds") as string[];
    let successCount = 0;
    let errorCount = 0;

    for (const pid of allProductIds) {
      try {
        // Mark as pending
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

        // Fetch product from Shopify
        const productResponse = await admin.graphql(`
          query getProduct($id: ID!) {
            product(id: $id) {
              id
              title
              handle
              vendor
              productType
              descriptionHtml
              variants(first: 1) {
                edges {
                  node {
                    sku
                    barcode
                  }
                }
              }
            }
          }
        `, {
          variables: { id: `gid://shopify/Product/${pid}` }
        });

        const productData = await productResponse.json();
        const shopifyProduct = productData.data?.product;

        if (!shopifyProduct) {
          throw new Error("Product not found");
        }

        const transformedProduct = {
          id: pid,
          title: shopifyProduct.title,
          handle: shopifyProduct.handle,
          vendor: shopifyProduct.vendor,
          productType: shopifyProduct.productType,
          description: shopifyProduct.descriptionHtml?.replace(/<[^>]*>/g, '') || '',
          variants: shopifyProduct.variants?.edges?.map((e: any) => e.node) || [],
        };

        // Sync to EuroComply
        const result = await eurocomply.syncShopifyProduct(transformedProduct, {
          manufacturerName: shopifyProduct.vendor || 'Unknown',
        });

        // Update as synced
        await prisma.productSync.update({
          where: {
            shop_shopifyProductId: {
              shop: session.shop,
              shopifyProductId: pid,
            },
          },
          data: {
            syncStatus: "synced",
            eurocomplyDppId: result.dpp.id,
            lastSyncedAt: new Date(),
            errorMessage: null,
          },
        });

        successCount++;
      } catch (error) {
        errorCount++;
        await prisma.productSync.update({
          where: {
            shop_shopifyProductId: {
              shop: session.shop,
              shopifyProductId: pid,
            },
          },
          data: {
            syncStatus: "error",
            errorMessage: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    return json({
      success: true,
      message: `${successCount} DPPs created, ${errorCount} errors`,
    });
  }

  return json({ error: "Unknown action" }, { status: 400 });
};

export default function Products() {
  const { products, syncMap, isConfigured } = useLoaderData<typeof loader>();
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

  const getProductId = (gid: string) => {
    const match = gid.match(/Product\/(\d+)/);
    return match ? match[1] : null;
  };

  const getSyncInfo = (productId: string) => {
    const pid = getProductId(productId);
    if (!pid) return null;
    return syncMap[pid];
  };

  const renderSyncStatus = (productId: string) => {
    const sync = getSyncInfo(productId);
    if (!sync) {
      return <Badge tone="attention">No DPP</Badge>;
    }

    switch (sync.syncStatus) {
      case "synced":
        return (
          <InlineStack gap="200" blockAlign="center">
            <Badge tone="success">
              <InlineStack gap="100" blockAlign="center">
                <Icon source={CheckCircleIcon} />
                <span>VC Issued</span>
              </InlineStack>
            </Badge>
            {sync.eurocomplyDppId && (
              <Link to={`/app/dpp/${sync.eurocomplyDppId}`}>
                <Button size="slim" variant="plain">View DPP</Button>
              </Link>
            )}
          </InlineStack>
        );
      case "pending":
        return <Badge tone="warning">Issuing VC...</Badge>;
      case "error":
        return (
          <Badge tone="critical">
            <InlineStack gap="100" blockAlign="center">
              <Icon source={AlertTriangleIcon} />
              <span>Error</span>
            </InlineStack>
          </Badge>
        );
      default:
        return null;
    }
  };

  return (
    <Page
      title="Products & Digital Product Passports"
      primaryAction={{
        content: "Create All DPPs",
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
            <p>Connect your EuroComply account to issue Verifiable Credentials for your products.</p>
          </Banner>
        )}

        <Banner tone="info">
          <p>
            Each DPP is backed by a <strong>W3C Verifiable Credential</strong> signed with your organization's DID.
            This makes your sustainability claims cryptographically verifiable and tamper-proof.
          </p>
        </Banner>

        <Layout>
          <Layout.Section>
            <Card padding="0">
              <ResourceList
                resourceName={{ singular: "product", plural: "products" }}
                items={products}
                renderItem={(product: any) => {
                  const { id, title, handle, featuredImage, variants, vendor } = product;
                  const sku = variants?.edges?.[0]?.node?.sku || "No SKU";
                  const barcode = variants?.edges?.[0]?.node?.barcode;
                  const media = featuredImage ? (
                    <Thumbnail source={featuredImage.url} alt={featuredImage.altText || title} />
                  ) : (
                    <Thumbnail source="" alt="" />
                  );
                  const sync = getSyncInfo(id);

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
                            {vendor && `${vendor} • `}SKU: {sku}
                            {barcode && ` • GTIN: ${barcode}`}
                          </Text>
                        </BlockStack>
                        <InlineStack gap="300" blockAlign="center">
                          {renderSyncStatus(id)}
                          {(!sync || sync.syncStatus === "error") && (
                            <Button
                              size="slim"
                              variant="primary"
                              onClick={() => {
                                const pid = getProductId(id);
                                if (pid) handleSync(pid);
                              }}
                              disabled={!isConfigured || isLoading}
                            >
                              {sync?.syncStatus === "error" ? "Retry" : "Issue DPP"}
                            </Button>
                          )}
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

/**
 * Link Supplier Product
 * "Use as-is" flow - link supplier DPP to merchant's Shopify product
 */

import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit, Form } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Button,
  Banner,
  Badge,
  Box,
  Divider,
  Modal,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Spinner,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import {
  getSupplierProductById,
  LINK_PRICE_MONTHLY,
  SUPPLIER_SHARE,
} from "../services/supplier-catalog.server";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const supplierProductId = params.productId;

  if (!supplierProductId) {
    throw new Response("Product ID required", { status: 400 });
  }

  try {
    // Get supplier product details
    const supplierProduct = await getSupplierProductById(supplierProductId, session.shop);

    // Get merchant's Shopify products that don't have DPPs yet
    const response = await admin.graphql(`
      query {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              vendor
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
    const allProducts = data.data?.products?.edges?.map((edge: any) => ({
      id: edge.node.id.replace("gid://shopify/Product/", ""),
      title: edge.node.title,
      handle: edge.node.handle,
      vendor: edge.node.vendor,
      imageUrl: edge.node.featuredImage?.url,
      sku: edge.node.variants?.edges?.[0]?.node?.sku,
    })) || [];

    // Filter out products that already have DPPs or supplier links
    const existingSyncs = await prisma.productSync.findMany({
      where: { shop: session.shop },
      select: { shopifyProductId: true },
    });
    const existingIds = new Set(existingSyncs.map(s => s.shopifyProductId));
    const availableProducts = allProducts.filter((p: any) => !existingIds.has(p.id));

    return json({
      shop: session.shop,
      supplierProduct,
      availableProducts,
      linkPrice: LINK_PRICE_MONTHLY,
      supplierShare: SUPPLIER_SHARE,
    });
  } catch (error) {
    console.error("Failed to load supplier product:", error);
    throw new Response("Supplier product not found", { status: 404 });
  }
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const supplierProductId = params.productId;
  const formData = await request.formData();
  const shopifyProductId = formData.get("shopifyProductId") as string;

  if (!supplierProductId || !shopifyProductId) {
    return json({ success: false, error: "Missing required fields" });
  }

  try {
    // Get supplier product to get supplier info
    const supplierProduct = await getSupplierProductById(supplierProductId, session.shop);

    // Create the link in our database
    // Note: In production, this would also:
    // 1. Create a DppUsageEvent for billing
    // 2. Increment timesLinked on SupplierProduct
    // 3. Record usage with Shopify billing API

    await prisma.productSync.create({
      data: {
        shop: session.shop,
        shopifyProductId,
        // Store supplier link info
        // Note: We're using JSON in eurocomplyDppId field for now
        // In production, extend the schema properly
        eurocomplyDppId: JSON.stringify({
          type: 'SUPPLIER_LINKED',
          supplierProductId,
          supplierId: supplierProduct.supplier.id,
          supplierName: supplierProduct.supplier.name,
          supplierVerified: supplierProduct.supplier.verified,
          vcId: supplierProduct.vcId,
          linkedAt: new Date().toISOString(),
        }),
        syncStatus: "synced",
      },
    });

    return redirect(`/app/products?linked=${supplierProductId}`);
  } catch (error) {
    console.error("Failed to link supplier product:", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Failed to link product",
    });
  }
};

export default function LinkSupplierProduct() {
  const {
    supplierProduct,
    availableProducts,
    linkPrice,
    supplierShare,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);

  const isSubmitting = navigation.state === "submitting";

  const handleSubmit = useCallback(() => {
    if (!selectedProduct) return;

    const formData = new FormData();
    formData.append("shopifyProductId", selectedProduct.id);
    submit(formData, { method: "post" });
  }, [selectedProduct, submit]);

  return (
    <Page
      title="Link Supplier DPP"
      subtitle="Use this supplier's DPP for your product"
      backAction={{ content: "Catalog", url: "/app/supplier-catalog" }}
    >
      <BlockStack gap="500">
        {actionData?.error && (
          <Banner tone="critical" title="Error">
            <p>{actionData.error}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            {/* Supplier Product Info */}
            <Card>
              <BlockStack gap="400">
                <InlineStack gap="400" blockAlign="start">
                  <BlockStack gap="200">
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="h2" variant="headingLg">
                        {supplierProduct.name}
                      </Text>
                      {supplierProduct.vcAnchored && (
                        <Badge tone="info">VC Anchored</Badge>
                      )}
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      <Text as="span" tone="subdued">
                        by {supplierProduct.supplier.name}
                      </Text>
                      {supplierProduct.supplier.verified && (
                        <Badge tone="success" size="small">Verified</Badge>
                      )}
                    </InlineStack>
                  </BlockStack>
                </InlineStack>

                <Divider />

                {/* DPP Summary */}
                <BlockStack gap="200">
                  <Text as="h3" variant="headingMd">DPP Data Included</Text>
                  {supplierProduct.dppSummary.fiberComposition && (
                    <Text as="p">
                      <strong>Composition:</strong> {supplierProduct.dppSummary.fiberComposition}
                    </Text>
                  )}
                  {supplierProduct.dppSummary.manufacturer && (
                    <Text as="p">
                      <strong>Manufacturer:</strong> {supplierProduct.dppSummary.manufacturer}
                    </Text>
                  )}
                  {supplierProduct.dppSummary.countryOfManufacture && (
                    <Text as="p">
                      <strong>Made in:</strong> {supplierProduct.dppSummary.countryOfManufacture}
                    </Text>
                  )}
                  {supplierProduct.dppSummary.carbonFootprint && (
                    <Text as="p">
                      <strong>Carbon Footprint:</strong> {supplierProduct.dppSummary.carbonFootprint.toFixed(2)} kgCO2e
                    </Text>
                  )}
                  {supplierProduct.dppSummary.certifications?.length > 0 && (
                    <InlineStack gap="100">
                      <Text as="span" fontWeight="semibold">Certifications:</Text>
                      {supplierProduct.dppSummary.certifications.map((cert: string) => (
                        <Badge key={cert}>{cert}</Badge>
                      ))}
                    </InlineStack>
                  )}
                </BlockStack>
              </BlockStack>
            </Card>

            {/* Select Shopify Product */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Select Your Shopify Product
                </Text>
                <Text as="p" tone="subdued">
                  Choose which of your products should use this supplier's DPP.
                </Text>

                {selectedProduct ? (
                  <InlineStack gap="400" blockAlign="center">
                    {selectedProduct.imageUrl && (
                      <Thumbnail source={selectedProduct.imageUrl} alt={selectedProduct.title} />
                    )}
                    <BlockStack gap="050">
                      <Text as="span" fontWeight="bold">
                        {selectedProduct.title}
                      </Text>
                      <Text as="span" tone="subdued">
                        SKU: {selectedProduct.sku || "N/A"}
                      </Text>
                    </BlockStack>
                    <Button onClick={() => setProductPickerOpen(true)} variant="plain">
                      Change
                    </Button>
                  </InlineStack>
                ) : (
                  <Button onClick={() => setProductPickerOpen(true)}>
                    Select a Product
                  </Button>
                )}
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section variant="oneThird">
            {/* Pricing Info */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Pricing</Text>
                <Divider />

                <BlockStack gap="200">
                  <InlineStack align="space-between">
                    <Text as="span">Monthly fee</Text>
                    <Text as="span" fontWeight="bold">€{linkPrice.toFixed(2)}/month</Text>
                  </InlineStack>
                  <InlineStack align="space-between">
                    <Text as="span" tone="subdued">Supplier receives</Text>
                    <Text as="span" tone="subdued">€{(linkPrice * supplierShare).toFixed(2)}</Text>
                  </InlineStack>
                </BlockStack>

                <Divider />

                <Banner tone="info">
                  <BlockStack gap="100">
                    <Text as="p" variant="bodySm">
                      <strong>What "Use as-is" means:</strong>
                    </Text>
                    <Text as="p" variant="bodySm">
                      • Supplier's Verifiable Credential is used
                    </Text>
                    <Text as="p" variant="bodySm">
                      • Your product shows "DPP by {supplierProduct.supplier.name}"
                    </Text>
                    <Text as="p" variant="bodySm">
                      • You cannot edit the DPP data
                    </Text>
                    <Text as="p" variant="bodySm">
                      • Supplier updates apply to your product
                    </Text>
                  </BlockStack>
                </Banner>

                <Button
                  variant="primary"
                  size="large"
                  fullWidth
                  onClick={handleSubmit}
                  disabled={!selectedProduct || isSubmitting}
                  loading={isSubmitting}
                >
                  Link Product (€{linkPrice.toFixed(2)}/mo)
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>

      {/* Product Picker Modal */}
      <Modal
        open={productPickerOpen}
        onClose={() => setProductPickerOpen(false)}
        title="Select a Product"
        primaryAction={{
          content: "Select",
          disabled: !selectedProduct,
          onAction: () => setProductPickerOpen(false),
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setProductPickerOpen(false),
          },
        ]}
      >
        <Modal.Section>
          {availableProducts.length === 0 ? (
            <Banner>
              <p>All your products already have DPPs. Create a new product in Shopify first.</p>
            </Banner>
          ) : (
            <ResourceList
              resourceName={{ singular: "product", plural: "products" }}
              items={availableProducts}
              renderItem={(item: any) => (
                <ResourceItem
                  id={item.id}
                  media={
                    <Thumbnail
                      source={item.imageUrl || ""}
                      alt={item.title}
                    />
                  }
                  onClick={() => setSelectedProduct(item)}
                  selected={selectedProduct?.id === item.id}
                >
                  <Text as="span" fontWeight="bold">
                    {item.title}
                  </Text>
                  <div>
                    <Text as="span" tone="subdued">
                      {item.vendor} • SKU: {item.sku || "N/A"}
                    </Text>
                  </div>
                </ResourceItem>
              )}
            />
          )}
        </Modal.Section>
      </Modal>
    </Page>
  );
}

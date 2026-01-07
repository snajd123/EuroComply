/**
 * Supplier Catalog Browser
 * Allows merchants to browse and use supplier DPPs
 */

import { json } from "@remix-run/node";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSearchParams, useNavigate } from "@remix-run/react";
import { useState, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Button,
  Badge,
  Box,
  Thumbnail,
  Pagination,
  EmptyState,
  Banner,
  Spinner,
  Filters,
  ChoiceList,
  Modal,
  Divider,
} from "@shopify/polaris";
import { SearchIcon } from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import {
  searchSupplierCatalog,
  type CatalogProduct,
  LINK_PRICE_MONTHLY,
  FORK_PRICE_ONETIME,
} from "../services/supplier-catalog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || undefined;
  const category = url.searchParams.get("category") || undefined;
  const page = parseInt(url.searchParams.get("page") || "1");

  try {
    const result = await searchSupplierCatalog(
      { search, category, page, limit: 12 },
      session.shop
    );

    return json({
      shop: session.shop,
      ...result,
      searchQuery: search,
      selectedCategory: category,
    });
  } catch (error) {
    console.error("Catalog search failed:", error);
    return json({
      shop: session.shop,
      products: [],
      pagination: { page: 1, limit: 12, total: 0, totalPages: 0 },
      searchQuery: search,
      selectedCategory: category,
      error: error instanceof Error ? error.message : "Failed to load catalog",
    });
  }
};

export default function SupplierCatalog() {
  const {
    products,
    pagination,
    searchQuery,
    selectedCategory,
    error,
  } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState(searchQuery || "");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);

  const handleSearch = useCallback(() => {
    const params = new URLSearchParams(searchParams);
    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
    params.set("page", "1");
    setSearchParams(params);
  }, [search, searchParams, setSearchParams]);

  const handleCategoryChange = useCallback((value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("category", value);
    } else {
      params.delete("category");
    }
    params.set("page", "1");
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handlePageChange = useCallback((newPage: number) => {
    const params = new URLSearchParams(searchParams);
    params.set("page", newPage.toString());
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const handleViewProduct = useCallback((product: CatalogProduct) => {
    setSelectedProduct(product);
    setDetailModalOpen(true);
  }, []);

  const handleUseAsIs = useCallback((product: CatalogProduct) => {
    navigate(`/app/supplier-catalog/link/${product.id}`);
  }, [navigate]);

  const handleCustomize = useCallback((product: CatalogProduct) => {
    navigate(`/app/supplier-catalog/fork/${product.id}`);
  }, [navigate]);

  return (
    <Page
      title="Supplier DPP Catalog"
      subtitle="Browse verified supplier products with ready-to-use Digital Product Passports"
      backAction={{ content: "Products", url: "/app/products" }}
    >
      <BlockStack gap="500">
        {error && (
          <Banner tone="critical" title="Error loading catalog">
            <p>{error}</p>
          </Banner>
        )}

        {/* Search and Filters */}
        <Card>
          <BlockStack gap="400">
            <InlineStack gap="400" blockAlign="end">
              <Box minWidth="300px">
                <TextField
                  label="Search"
                  value={search}
                  onChange={setSearch}
                  placeholder="Search products, suppliers..."
                  autoComplete="off"
                  connectedRight={
                    <Button icon={SearchIcon} onClick={handleSearch}>
                      Search
                    </Button>
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSearch();
                  }}
                />
              </Box>
              <Select
                label="Category"
                options={[
                  { label: "All Categories", value: "" },
                  { label: "Textiles", value: "TEXTILE" },
                  { label: "Electronics", value: "ELECTRONICS" },
                  { label: "Furniture", value: "FURNITURE" },
                  { label: "Batteries", value: "BATTERY" },
                ]}
                value={selectedCategory || ""}
                onChange={handleCategoryChange}
              />
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Results */}
        {products.length === 0 ? (
          <Card>
            <EmptyState
              heading="No products found"
              image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
            >
              <p>Try adjusting your search or filters to find supplier products.</p>
            </EmptyState>
          </Card>
        ) : (
          <Layout>
            {products.map((product: CatalogProduct) => (
              <Layout.Section key={product.id} variant="oneThird">
                <Card>
                  <BlockStack gap="400">
                    {/* Header */}
                    <InlineStack gap="300" blockAlign="start">
                      {product.supplier.logoUrl ? (
                        <Thumbnail
                          source={product.supplier.logoUrl}
                          alt={product.supplier.name}
                          size="small"
                        />
                      ) : (
                        <Box
                          background="bg-surface-secondary"
                          padding="200"
                          borderRadius="100"
                        >
                          <Text as="span" fontWeight="bold">
                            {product.supplier.name.charAt(0)}
                          </Text>
                        </Box>
                      )}
                      <BlockStack gap="050">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" fontWeight="semibold">
                            {product.supplier.name}
                          </Text>
                          {product.supplier.verified && (
                            <Badge tone="success" size="small">
                              Verified
                            </Badge>
                          )}
                        </InlineStack>
                        <Text as="span" tone="subdued" variant="bodySm">
                          {product.supplier.country}
                        </Text>
                      </BlockStack>
                    </InlineStack>

                    <Divider />

                    {/* Product Info */}
                    <BlockStack gap="200">
                      <Text as="h3" variant="headingMd">
                        {product.name}
                      </Text>
                      {product.description && (
                        <Text as="p" tone="subdued" truncate>
                          {product.description}
                        </Text>
                      )}
                    </BlockStack>

                    {/* DPP Summary */}
                    <BlockStack gap="100">
                      {product.dppSummary.fiberComposition && (
                        <Text as="p" variant="bodySm">
                          📦 {product.dppSummary.fiberComposition}
                        </Text>
                      )}
                      {product.dppSummary.countryOfManufacture && (
                        <Text as="p" variant="bodySm">
                          🏭 Made in {product.dppSummary.countryOfManufacture}
                        </Text>
                      )}
                      {product.dppSummary.carbonFootprint && (
                        <Text as="p" variant="bodySm">
                          🌿 {product.dppSummary.carbonFootprint.toFixed(2)} kgCO2e
                        </Text>
                      )}
                      {product.dppSummary.certifications?.length > 0 && (
                        <InlineStack gap="100" wrap>
                          {product.dppSummary.certifications.slice(0, 3).map((cert) => (
                            <Badge key={cert} size="small">
                              {cert}
                            </Badge>
                          ))}
                        </InlineStack>
                      )}
                    </BlockStack>

                    {/* Stats */}
                    <InlineStack gap="200">
                      {product.vcAnchored && (
                        <Badge tone="info" size="small">
                          🔐 VC Anchored
                        </Badge>
                      )}
                      <Text as="span" tone="subdued" variant="bodySm">
                        Used by {product.timesUsed} merchants
                      </Text>
                    </InlineStack>

                    <Divider />

                    {/* Actions */}
                    <InlineStack gap="200">
                      <Button onClick={() => handleUseAsIs(product)}>
                        Use as-is (€{LINK_PRICE_MONTHLY}/mo)
                      </Button>
                      <Button
                        variant="plain"
                        onClick={() => handleCustomize(product)}
                      >
                        Customize (€{FORK_PRICE_ONETIME})
                      </Button>
                    </InlineStack>
                  </BlockStack>
                </Card>
              </Layout.Section>
            ))}
          </Layout>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <Box paddingBlockStart="400">
            <InlineStack align="center">
              <Pagination
                hasPrevious={pagination.page > 1}
                hasNext={pagination.page < pagination.totalPages}
                onPrevious={() => handlePageChange(pagination.page - 1)}
                onNext={() => handlePageChange(pagination.page + 1)}
              />
            </InlineStack>
          </Box>
        )}

        {/* Info Banner */}
        <Banner tone="info">
          <BlockStack gap="200">
            <Text as="p" fontWeight="semibold">
              How supplier DPPs work:
            </Text>
            <Text as="p">
              • <strong>Use as-is (€{LINK_PRICE_MONTHLY}/month):</strong> Link directly to the supplier's DPP. Their Verifiable Credential is used, and they maintain responsibility for the data.
            </Text>
            <Text as="p">
              • <strong>Customize (€{FORK_PRICE_ONETIME} one-time):</strong> Fork the DPP and modify it. You sign your own VC and take responsibility. Original supplier credited as "based on".
            </Text>
          </BlockStack>
        </Banner>
      </BlockStack>
    </Page>
  );
}

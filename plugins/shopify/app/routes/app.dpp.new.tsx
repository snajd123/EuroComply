import { json, redirect } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData, useNavigation, useSubmit, Form } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineStack,
  TextField,
  Select,
  Checkbox,
  Button,
  Banner,
  Badge,
  Box,
  Divider,
  FormLayout,
  ChoiceList,
  Tag,
  Icon,
  ProgressBar,
  Tooltip,
  Modal,
  ResourceList,
  ResourceItem,
  Thumbnail,
  Spinner,
  InlineGrid,
} from "@shopify/polaris";
import {
  PlusIcon,
  DeleteIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import type {
  TextileDppData,
  FiberComposition,
  FiberType,
  FiberOrigin,
  CareInstructions,
  ManufacturerInfo,
  HazardousSubstances,
  Certification,
  CarbonFootprint,
} from "../types/dpp-schemas";
import { validateDppData, canIssueVC } from "../services/dpp-validation.server";
import { calculateCarbonFootprint } from "../services/higg-integration.server";
import { TEXTILE_TEMPLATE, CARE_PRESETS, DEFAULT_CARE_INSTRUCTIONS } from "../data/textile-templates";

// Country options for ISO 3166-1 alpha-2
const COUNTRY_OPTIONS = [
  { label: "Select country...", value: "" },
  { label: "Austria", value: "AT" },
  { label: "Bangladesh", value: "BD" },
  { label: "Belgium", value: "BE" },
  { label: "Bulgaria", value: "BG" },
  { label: "Cambodia", value: "KH" },
  { label: "China", value: "CN" },
  { label: "Croatia", value: "HR" },
  { label: "Cyprus", value: "CY" },
  { label: "Czech Republic", value: "CZ" },
  { label: "Denmark", value: "DK" },
  { label: "Estonia", value: "EE" },
  { label: "Finland", value: "FI" },
  { label: "France", value: "FR" },
  { label: "Germany", value: "DE" },
  { label: "Greece", value: "GR" },
  { label: "Hungary", value: "HU" },
  { label: "India", value: "IN" },
  { label: "Indonesia", value: "ID" },
  { label: "Ireland", value: "IE" },
  { label: "Italy", value: "IT" },
  { label: "Latvia", value: "LV" },
  { label: "Lithuania", value: "LT" },
  { label: "Luxembourg", value: "LU" },
  { label: "Malta", value: "MT" },
  { label: "Myanmar", value: "MM" },
  { label: "Netherlands", value: "NL" },
  { label: "Pakistan", value: "PK" },
  { label: "Poland", value: "PL" },
  { label: "Portugal", value: "PT" },
  { label: "Romania", value: "RO" },
  { label: "Slovakia", value: "SK" },
  { label: "Slovenia", value: "SI" },
  { label: "Spain", value: "ES" },
  { label: "Sri Lanka", value: "LK" },
  { label: "Sweden", value: "SE" },
  { label: "Thailand", value: "TH" },
  { label: "Turkey", value: "TR" },
  { label: "United Kingdom", value: "GB" },
  { label: "United States", value: "US" },
  { label: "Vietnam", value: "VN" },
];

const FIBER_TYPE_OPTIONS: { label: string; value: FiberType }[] = [
  { label: "Cotton (Conventional)", value: "cotton" },
  { label: "Cotton (Organic)", value: "organic_cotton" },
  { label: "Linen", value: "linen" },
  { label: "Hemp", value: "hemp" },
  { label: "Wool", value: "wool" },
  { label: "Silk", value: "silk" },
  { label: "Cashmere", value: "cashmere" },
  { label: "Bamboo", value: "bamboo" },
  { label: "Jute", value: "jute" },
  { label: "Polyester", value: "polyester" },
  { label: "Polyester (Recycled)", value: "recycled_polyester" },
  { label: "Nylon", value: "nylon" },
  { label: "Nylon (Recycled)", value: "recycled_nylon" },
  { label: "Acrylic", value: "acrylic" },
  { label: "Elastane / Spandex", value: "elastane" },
  { label: "Viscose", value: "viscose" },
  { label: "Modal", value: "modal" },
  { label: "Lyocell / TENCEL", value: "lyocell" },
  { label: "Other", value: "other" },
];

const FIBER_ORIGIN_OPTIONS: { label: string; value: FiberOrigin }[] = [
  { label: "Conventional", value: "conventional" },
  { label: "Organic Certified", value: "organic" },
  { label: "Recycled (Pre-consumer)", value: "recycled_pre_consumer" },
  { label: "Recycled (Post-consumer)", value: "recycled_post_consumer" },
  { label: "Bio-based", value: "bio_based" },
  { label: "Unknown", value: "unknown" },
];

const CERTIFICATION_TYPES = [
  { label: "GOTS (Global Organic Textile Standard)", value: "GOTS" },
  { label: "OEKO-TEX Standard 100", value: "OEKO-TEX Standard 100" },
  { label: "OEKO-TEX Made in Green", value: "OEKO-TEX Made in Green" },
  { label: "GRS (Global Recycled Standard)", value: "GRS" },
  { label: "OCS (Organic Content Standard)", value: "OCS" },
  { label: "Bluesign", value: "Bluesign" },
  { label: "Fair Trade Certified", value: "Fair Trade" },
  { label: "EU Ecolabel", value: "EU Ecolabel" },
  { label: "Cradle to Cradle", value: "Cradle to Cradle" },
  { label: "Better Cotton Initiative (BCI)", value: "BCI" },
  { label: "Other", value: "other" },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);

  // Get shop settings
  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  if (!settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
    return redirect("/app/settings?setup=required");
  }

  // Get products from Shopify that don't have DPPs yet
  const response = await admin.graphql(`
    query {
      products(first: 50) {
        edges {
          node {
            id
            title
            handle
            vendor
            productType
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
          }
        }
      }
    }
  `);

  const data = await response.json();
  const products = data.data?.products?.edges?.map((edge: any) => ({
    id: edge.node.id.replace("gid://shopify/Product/", ""),
    title: edge.node.title,
    handle: edge.node.handle,
    vendor: edge.node.vendor,
    productType: edge.node.productType,
    imageUrl: edge.node.featuredImage?.url,
    sku: edge.node.variants?.edges?.[0]?.node?.sku,
    weight: edge.node.variants?.edges?.[0]?.node?.weight,
    weightUnit: edge.node.variants?.edges?.[0]?.node?.weightUnit,
  })) || [];

  // Get existing DPPs to filter out
  const existingSyncs = await prisma.productSync.findMany({
    where: { shop: session.shop },
    select: { shopifyProductId: true },
  });
  const existingProductIds = new Set(existingSyncs.map((s) => s.shopifyProductId));

  const availableProducts = products.filter((p: any) => !existingProductIds.has(p.id));

  return json({
    shop: session.shop,
    products: availableProducts,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const actionType = formData.get("_action");

  if (actionType === "calculate_carbon") {
    // Handle carbon footprint calculation
    const fiberCompositionJson = formData.get("fiberComposition") as string;
    const productWeight = parseFloat(formData.get("productWeight") as string) || 0.2;
    const countryOfManufacture = formData.get("countryOfManufacture") as string || "CN";

    try {
      const fiberComposition = JSON.parse(fiberCompositionJson) as FiberComposition[];

      const result = await calculateCarbonFootprint({
        fiberComposition,
        productWeight,
        countryOfManufacture,
      });

      return json({
        success: true,
        carbonResult: result,
      });
    } catch (error) {
      return json({
        success: false,
        error: error instanceof Error ? error.message : "Carbon calculation failed",
      });
    }
  }

  if (actionType === "create_dpp") {
    // Get shop settings
    const settings = await prisma.shopSettings.findUnique({
      where: { shop: session.shop },
    });

    if (!settings?.eurocomplyApiKey || !settings?.eurocomplyOrgId) {
      return json({ success: false, error: "EuroComply not configured" });
    }

    try {
      // Parse all form data into TextileDppData
      const dppData = parseDppFormData(formData);

      // Validate
      const validationResult = validateDppData(dppData);

      if (!canIssueVC(validationResult)) {
        return json({
          success: false,
          error: "Validation failed - cannot issue VC",
          validation: validationResult,
        });
      }

      const productId = formData.get("shopifyProductId") as string;
      const productTitle = formData.get("productTitle") as string;

      // Create DPP via EuroComply API
      const { createEuroComplyClient } = await import("../services/eurocomply.server");
      const eurocomply = createEuroComplyClient({
        eurocomplyApiKey: settings.eurocomplyApiKey,
        eurocomplyOrgId: settings.eurocomplyOrgId,
      });

      if (!eurocomply) {
        return json({ success: false, error: "Failed to create EuroComply client" });
      }

      // Create the DPP with full textile data
      const result = await eurocomply.createFullDpp({
        productName: productTitle,
        category: "textile",
        data: dppData,
      });

      // Save sync record
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
          syncStatus: "synced",
          eurocomplyDppId: result.dpp.id,
        },
        update: {
          syncStatus: "synced",
          eurocomplyDppId: result.dpp.id,
          lastSyncedAt: new Date(),
          errorMessage: null,
        },
      });

      return redirect(`/app/dpp/${result.dpp.id}?created=true`);
    } catch (error) {
      console.error("DPP creation failed:", error);
      return json({
        success: false,
        error: error instanceof Error ? error.message : "DPP creation failed",
      });
    }
  }

  return json({ success: false, error: "Unknown action" });
};

function parseDppFormData(formData: FormData): TextileDppData {
  // Parse fiber composition
  const fiberCompositionJson = formData.get("fiberComposition") as string;
  const fiberComposition = fiberCompositionJson ? JSON.parse(fiberCompositionJson) : [];

  // Parse care instructions
  const careInstructions: CareInstructions = {
    maxWashTemperature: formData.get("maxWashTemperature")
      ? parseInt(formData.get("maxWashTemperature") as string)
      : null,
    bleachAllowed: formData.get("bleachAllowed") === "true",
    tumbleDryAllowed: formData.get("tumbleDryAllowed") === "true",
    ironTemperature: (formData.get("ironTemperature") as CareInstructions["ironTemperature"]) || "none",
    dryCleanAllowed: formData.get("dryCleanAllowed") === "true",
    specialInstructions: (formData.get("specialInstructions") as string) || undefined,
  };

  // Parse manufacturer info
  const manufacturer: ManufacturerInfo = {
    name: formData.get("manufacturerName") as string,
    country: formData.get("manufacturerCountry") as string,
    address: (formData.get("manufacturerAddress") as string) || undefined,
    registrationNumber: (formData.get("manufacturerRegNumber") as string) || undefined,
    website: (formData.get("manufacturerWebsite") as string) || undefined,
  };

  // Parse hazardous substances
  const hazardousSubstances: HazardousSubstances = {
    reachCompliant: formData.get("reachCompliant") === "true",
    substancesOfConcern: [],
    scipNotificationId: (formData.get("scipNotificationId") as string) || undefined,
  };

  // Parse certifications
  const certificationsJson = formData.get("certifications") as string;
  const certifications = certificationsJson ? JSON.parse(certificationsJson) : [];

  // Parse carbon footprint
  const carbonFootprintJson = formData.get("carbonFootprint") as string;
  const carbonFootprint = carbonFootprintJson ? JSON.parse(carbonFootprintJson) : undefined;

  // Build the full DPP data
  const dppData: TextileDppData = {
    category: "textile",
    fiberComposition,
    countryOfManufacture: formData.get("countryOfManufacture") as string,
    manufacturer,
    careInstructions,
    hazardousSubstances,
    carbonFootprint,
    certifications: certifications.length > 0 ? certifications : undefined,
    recyclability: formData.get("recyclablePercentage")
      ? {
          recyclablePercentage: parseInt(formData.get("recyclablePercentage") as string),
          recyclableComponents: [],
          endOfLifeInstructions: (formData.get("endOfLifeInstructions") as string) || "Check local recycling guidelines",
        }
      : undefined,
    durability: formData.get("expectedLifespanYears")
      ? {
          expectedLifespanYears: parseInt(formData.get("expectedLifespanYears") as string),
          warrantyYears: formData.get("warrantyYears")
            ? parseInt(formData.get("warrantyYears") as string)
            : undefined,
        }
      : undefined,
  };

  return dppData;
}

export default function NewDpp() {
  const { products } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isSubmitting = navigation.state === "submitting";

  // State
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [selectedCarePreset, setSelectedCarePreset] = useState<string>("standard");

  // Form state - initialized from template defaults
  const templateDefaults = TEXTILE_TEMPLATE.defaults;
  const [fiberComposition, setFiberComposition] = useState<FiberComposition[]>(
    templateDefaults.fiberComposition || [{ fiberType: "cotton", percentage: 100, origin: "conventional" }]
  );
  const [countryOfManufacture, setCountryOfManufacture] = useState("");
  const [manufacturerName, setManufacturerName] = useState("");
  const [manufacturerCountry, setManufacturerCountry] = useState("");
  const [manufacturerAddress, setManufacturerAddress] = useState("");
  const [manufacturerRegNumber, setManufacturerRegNumber] = useState("");
  const [manufacturerWebsite, setManufacturerWebsite] = useState("");

  // Care instructions - initialized from template defaults
  const defaultCare = templateDefaults.careInstructions || DEFAULT_CARE_INSTRUCTIONS;
  const [maxWashTemperature, setMaxWashTemperature] = useState(defaultCare.maxWashTemperature?.toString() || "40");
  const [bleachAllowed, setBleachAllowed] = useState(defaultCare.bleachAllowed || false);
  const [tumbleDryAllowed, setTumbleDryAllowed] = useState(defaultCare.tumbleDryAllowed || false);
  const [ironTemperature, setIronTemperature] = useState<string>(defaultCare.ironTemperature || "medium");
  const [dryCleanAllowed, setDryCleanAllowed] = useState(defaultCare.dryCleanAllowed || false);
  const [specialInstructions, setSpecialInstructions] = useState(defaultCare.specialInstructions || "");

  // Hazardous substances
  const [reachCompliant, setReachCompliant] = useState(true);
  const [scipNotificationId, setScipNotificationId] = useState("");

  // Certifications
  const [certifications, setCertifications] = useState<Certification[]>([]);

  // Carbon footprint
  const [carbonFootprint, setCarbonFootprint] = useState<CarbonFootprint | null>(null);
  const [isCalculatingCarbon, setIsCalculatingCarbon] = useState(false);
  const [productWeight, setProductWeight] = useState("0.2");

  // Recyclability
  const [recyclablePercentage, setRecyclablePercentage] = useState("");
  const [endOfLifeInstructions, setEndOfLifeInstructions] = useState("");

  // Durability
  const [expectedLifespanYears, setExpectedLifespanYears] = useState("");
  const [warrantyYears, setWarrantyYears] = useState("");

  // Validation
  const [validationResult, setValidationResult] = useState<any>(null);

  // Calculate fiber composition total
  const fiberTotal = fiberComposition.reduce((sum, f) => sum + f.percentage, 0);
  const fiberTotalValid = fiberTotal === 100;

  // Apply care preset
  const handleApplyCarePreset = useCallback((presetKey: string) => {
    const preset = CARE_PRESETS[presetKey as keyof typeof CARE_PRESETS];
    if (!preset) return;

    setSelectedCarePreset(presetKey);
    const care = preset.value;
    setMaxWashTemperature(care.maxWashTemperature?.toString() || "40");
    setBleachAllowed(care.bleachAllowed || false);
    setTumbleDryAllowed(care.tumbleDryAllowed || false);
    setIronTemperature(care.ironTemperature || "medium");
    setDryCleanAllowed(care.dryCleanAllowed || false);
    if ('specialInstructions' in care) {
      setSpecialInstructions(care.specialInstructions || "");
    }
  }, []);

  // Add fiber
  const addFiber = useCallback(() => {
    setFiberComposition([
      ...fiberComposition,
      { fiberType: "polyester", percentage: 0, origin: "conventional" },
    ]);
  }, [fiberComposition]);

  // Remove fiber
  const removeFiber = useCallback(
    (index: number) => {
      const newComposition = [...fiberComposition];
      newComposition.splice(index, 1);
      setFiberComposition(newComposition);
    },
    [fiberComposition]
  );

  // Update fiber
  const updateFiber = useCallback(
    (index: number, field: keyof FiberComposition, value: any) => {
      const newComposition = [...fiberComposition];
      newComposition[index] = { ...newComposition[index], [field]: value };
      setFiberComposition(newComposition);
    },
    [fiberComposition]
  );

  // Add certification
  const addCertification = useCallback(() => {
    setCertifications([
      ...certifications,
      {
        type: "",
        certificateNumber: "",
        issuingBody: "",
        validFrom: new Date().toISOString().split("T")[0],
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      },
    ]);
  }, [certifications]);

  // Remove certification
  const removeCertification = useCallback(
    (index: number) => {
      const newCerts = [...certifications];
      newCerts.splice(index, 1);
      setCertifications(newCerts);
    },
    [certifications]
  );

  // Update certification
  const updateCertification = useCallback(
    (index: number, field: keyof Certification, value: any) => {
      const newCerts = [...certifications];
      newCerts[index] = { ...newCerts[index], [field]: value };
      setCertifications(newCerts);
    },
    [certifications]
  );

  // Calculate carbon footprint
  const handleCalculateCarbon = useCallback(async () => {
    setIsCalculatingCarbon(true);

    const formData = new FormData();
    formData.append("_action", "calculate_carbon");
    formData.append("fiberComposition", JSON.stringify(fiberComposition));
    formData.append("productWeight", productWeight);
    formData.append("countryOfManufacture", countryOfManufacture || "CN");

    submit(formData, { method: "post" });
  }, [fiberComposition, productWeight, countryOfManufacture, submit]);

  // Handle carbon calculation result
  useEffect(() => {
    if (actionData?.carbonResult) {
      setCarbonFootprint({
        value: actionData.carbonResult.totalEmissions,
        unit: "kgCO2e",
        methodology: "Higg_MSI",
        scope: "cradle_to_gate",
        dataSource: "higg_calculated",
        confidence: actionData.carbonResult.confidence,
      });
      setIsCalculatingCarbon(false);
    }
  }, [actionData]);

  // Validate current data
  useEffect(() => {
    const dppData: TextileDppData = {
      category: "textile",
      fiberComposition,
      countryOfManufacture,
      manufacturer: {
        name: manufacturerName,
        country: manufacturerCountry,
      },
      careInstructions: {
        maxWashTemperature: maxWashTemperature ? parseInt(maxWashTemperature) : null,
        bleachAllowed,
        tumbleDryAllowed,
        ironTemperature: ironTemperature as CareInstructions["ironTemperature"],
        dryCleanAllowed,
      },
      hazardousSubstances: {
        reachCompliant,
        substancesOfConcern: [],
      },
      carbonFootprint: carbonFootprint || undefined,
      certifications: certifications.length > 0 ? certifications : undefined,
    };

    try {
      const result = validateDppData(dppData);
      setValidationResult(result);
    } catch (e) {
      // Ignore validation errors during editing
    }
  }, [
    fiberComposition,
    countryOfManufacture,
    manufacturerName,
    manufacturerCountry,
    maxWashTemperature,
    bleachAllowed,
    tumbleDryAllowed,
    ironTemperature,
    dryCleanAllowed,
    reachCompliant,
    carbonFootprint,
    certifications,
  ]);

  // Submit form
  const handleSubmit = useCallback(() => {
    if (!selectedProduct) return;

    const formData = new FormData();
    formData.append("_action", "create_dpp");
    formData.append("shopifyProductId", selectedProduct.id);
    formData.append("productTitle", selectedProduct.title);
    formData.append("fiberComposition", JSON.stringify(fiberComposition));
    formData.append("countryOfManufacture", countryOfManufacture);
    formData.append("manufacturerName", manufacturerName);
    formData.append("manufacturerCountry", manufacturerCountry);
    formData.append("manufacturerAddress", manufacturerAddress);
    formData.append("manufacturerRegNumber", manufacturerRegNumber);
    formData.append("manufacturerWebsite", manufacturerWebsite);
    formData.append("maxWashTemperature", maxWashTemperature);
    formData.append("bleachAllowed", bleachAllowed.toString());
    formData.append("tumbleDryAllowed", tumbleDryAllowed.toString());
    formData.append("ironTemperature", ironTemperature);
    formData.append("dryCleanAllowed", dryCleanAllowed.toString());
    formData.append("specialInstructions", specialInstructions);
    formData.append("reachCompliant", reachCompliant.toString());
    formData.append("scipNotificationId", scipNotificationId);
    formData.append("certifications", JSON.stringify(certifications));
    if (carbonFootprint) {
      formData.append("carbonFootprint", JSON.stringify(carbonFootprint));
    }
    formData.append("recyclablePercentage", recyclablePercentage);
    formData.append("endOfLifeInstructions", endOfLifeInstructions);
    formData.append("expectedLifespanYears", expectedLifespanYears);
    formData.append("warrantyYears", warrantyYears);

    submit(formData, { method: "post" });
  }, [
    selectedProduct,
    fiberComposition,
    countryOfManufacture,
    manufacturerName,
    manufacturerCountry,
    manufacturerAddress,
    manufacturerRegNumber,
    manufacturerWebsite,
    maxWashTemperature,
    bleachAllowed,
    tumbleDryAllowed,
    ironTemperature,
    dryCleanAllowed,
    specialInstructions,
    reachCompliant,
    scipNotificationId,
    certifications,
    carbonFootprint,
    recyclablePercentage,
    endOfLifeInstructions,
    expectedLifespanYears,
    warrantyYears,
    submit,
  ]);

  const canSubmit =
    selectedProduct &&
    fiberTotalValid &&
    countryOfManufacture &&
    manufacturerName &&
    manufacturerCountry &&
    reachCompliant !== undefined &&
    validationResult?.mandatoryFieldsComplete;

  return (
    <Page
      title="Create Digital Product Passport"
      subtitle="Add complete textile data for EU ESPR compliance"
      backAction={{ content: "Products", url: "/app/products" }}
      primaryAction={{
        content: "Create DPP & Issue VC",
        disabled: !canSubmit || isSubmitting,
        loading: isSubmitting,
        onAction: handleSubmit,
      }}
    >
      <BlockStack gap="500">
        {/* Validation Status */}
        {validationResult && (
          <Banner
            tone={validationResult.mandatoryFieldsComplete ? "success" : "warning"}
          >
            <InlineStack gap="400" blockAlign="center">
              <Icon
                source={validationResult.mandatoryFieldsComplete ? CheckCircleIcon : AlertTriangleIcon}
              />
              <BlockStack gap="100">
                <Text as="span" fontWeight="bold">
                  Completeness: {validationResult.completenessScore}%
                </Text>
                <Text as="span" tone="subdued">
                  {validationResult.mandatoryFieldsComplete
                    ? "All mandatory fields complete - ready to issue Verifiable Credential"
                    : `${validationResult.errors.length} mandatory field(s) missing`}
                </Text>
              </BlockStack>
            </InlineStack>
            <Box paddingBlockStart="200">
              <ProgressBar progress={validationResult.completenessScore} size="small" />
            </Box>
          </Banner>
        )}

        {/* Error Banner */}
        {actionData?.error && (
          <Banner tone="critical" title="Error">
            <p>{actionData.error}</p>
          </Banner>
        )}

        <Layout>
          {/* Main Form */}
          <Layout.Section>
            {/* Product Selection */}
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  1. Select Product
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
                        {selectedProduct.vendor} • SKU: {selectedProduct.sku || "N/A"}
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

            {/* Fiber Composition */}
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between">
                  <BlockStack gap="050">
                    <Text as="h2" variant="headingMd">
                      2. Fiber Composition
                    </Text>
                    <Text as="span" tone="subdued">
                      MANDATORY - Must sum to exactly 100%
                    </Text>
                  </BlockStack>
                  <Badge tone={fiberTotalValid ? "success" : "critical"}>
                    {fiberTotal}% total
                  </Badge>
                </InlineStack>

                <Divider />

                {fiberComposition.map((fiber, index) => (
                  <InlineGrid columns={4} gap="300" key={index}>
                    <Select
                      label={index === 0 ? "Fiber Type" : ""}
                      options={FIBER_TYPE_OPTIONS}
                      value={fiber.fiberType}
                      onChange={(v) => updateFiber(index, "fiberType", v)}
                    />
                    <TextField
                      label={index === 0 ? "Percentage" : ""}
                      type="number"
                      value={fiber.percentage.toString()}
                      onChange={(v) => updateFiber(index, "percentage", parseInt(v) || 0)}
                      suffix="%"
                      autoComplete="off"
                    />
                    <Select
                      label={index === 0 ? "Origin" : ""}
                      options={FIBER_ORIGIN_OPTIONS}
                      value={fiber.origin}
                      onChange={(v) => updateFiber(index, "origin", v)}
                    />
                    <Box paddingBlockStart={index === 0 ? "600" : "0"}>
                      {fiberComposition.length > 1 && (
                        <Button
                          icon={DeleteIcon}
                          onClick={() => removeFiber(index)}
                          variant="plain"
                          tone="critical"
                        />
                      )}
                    </Box>
                  </InlineGrid>
                ))}

                <Button icon={PlusIcon} onClick={addFiber}>
                  Add Fiber
                </Button>
              </BlockStack>
            </Card>

            {/* Manufacturer Info */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    3. Manufacturer Information
                  </Text>
                  <Text as="span" tone="subdued">
                    MANDATORY - Required for product traceability
                  </Text>
                </BlockStack>

                <Divider />

                <FormLayout>
                  <FormLayout.Group>
                    <TextField
                      label="Manufacturer Name"
                      value={manufacturerName}
                      onChange={setManufacturerName}
                      autoComplete="organization"
                      requiredIndicator
                    />
                    <Select
                      label="Manufacturer Country"
                      options={COUNTRY_OPTIONS}
                      value={manufacturerCountry}
                      onChange={setManufacturerCountry}
                      requiredIndicator
                    />
                  </FormLayout.Group>
                  <Select
                    label="Country of Manufacture"
                    options={COUNTRY_OPTIONS}
                    value={countryOfManufacture}
                    onChange={setCountryOfManufacture}
                    requiredIndicator
                    helpText="Where the final product was manufactured"
                  />
                  <TextField
                    label="Address"
                    value={manufacturerAddress}
                    onChange={setManufacturerAddress}
                    autoComplete="street-address"
                  />
                  <FormLayout.Group>
                    <TextField
                      label="Registration/VAT Number"
                      value={manufacturerRegNumber}
                      onChange={setManufacturerRegNumber}
                      autoComplete="off"
                    />
                    <TextField
                      label="Website"
                      value={manufacturerWebsite}
                      onChange={setManufacturerWebsite}
                      autoComplete="url"
                    />
                  </FormLayout.Group>
                </FormLayout>
              </BlockStack>
            </Card>

            {/* Care Instructions */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    4. Care Instructions
                  </Text>
                  <Text as="span" tone="subdued">
                    MANDATORY - Required care and maintenance information
                  </Text>
                </BlockStack>

                <Divider />

                <Select
                  label="Quick Preset"
                  helpText="Apply common care settings"
                  options={Object.entries(CARE_PRESETS).map(([key, preset]) => ({
                    label: preset.label,
                    value: key,
                  }))}
                  value={selectedCarePreset}
                  onChange={handleApplyCarePreset}
                />

                <FormLayout>
                  <FormLayout.Group>
                    <Select
                      label="Max Wash Temperature"
                      options={[
                        { label: "Do not wash", value: "" },
                        { label: "30°C (Cold)", value: "30" },
                        { label: "40°C (Warm)", value: "40" },
                        { label: "60°C (Hot)", value: "60" },
                        { label: "95°C (Very Hot)", value: "95" },
                      ]}
                      value={maxWashTemperature}
                      onChange={setMaxWashTemperature}
                    />
                    <Select
                      label="Iron Temperature"
                      options={[
                        { label: "Do not iron", value: "none" },
                        { label: "Low (110°C)", value: "low" },
                        { label: "Medium (150°C)", value: "medium" },
                        { label: "High (200°C)", value: "high" },
                      ]}
                      value={ironTemperature}
                      onChange={setIronTemperature}
                    />
                  </FormLayout.Group>
                  <InlineStack gap="400">
                    <Checkbox
                      label="Bleach allowed"
                      checked={bleachAllowed}
                      onChange={setBleachAllowed}
                    />
                    <Checkbox
                      label="Tumble dry allowed"
                      checked={tumbleDryAllowed}
                      onChange={setTumbleDryAllowed}
                    />
                    <Checkbox
                      label="Dry clean allowed"
                      checked={dryCleanAllowed}
                      onChange={setDryCleanAllowed}
                    />
                  </InlineStack>
                  <TextField
                    label="Special Care Instructions"
                    value={specialInstructions}
                    onChange={setSpecialInstructions}
                    multiline={2}
                    autoComplete="off"
                    helpText="Any additional care notes (optional)"
                  />
                </FormLayout>
              </BlockStack>
            </Card>

            {/* Hazardous Substances */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    5. Hazardous Substances Declaration
                  </Text>
                  <Text as="span" tone="subdued">
                    MANDATORY - EU REACH compliance declaration
                  </Text>
                </BlockStack>

                <Divider />

                <Checkbox
                  label="This product is REACH compliant"
                  helpText="Complies with EU REACH regulation (EC) No 1907/2006"
                  checked={reachCompliant}
                  onChange={setReachCompliant}
                />

                {!reachCompliant && (
                  <Banner tone="critical">
                    <p>
                      Products that are not REACH compliant cannot receive a Verifiable Credential.
                      Please ensure your product meets EU chemical safety requirements.
                    </p>
                  </Banner>
                )}

                <TextField
                  label="SCIP Notification ID (Optional)"
                  value={scipNotificationId}
                  onChange={setScipNotificationId}
                  autoComplete="off"
                  helpText="ECHA SCIP database notification ID if applicable"
                />
              </BlockStack>
            </Card>

            {/* Certifications */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    6. Certifications
                  </Text>
                  <Text as="span" tone="subdued">
                    RECOMMENDED - Third-party certifications strengthen your VC
                  </Text>
                </BlockStack>

                <Divider />

                {certifications.map((cert, index) => (
                  <Card key={index}>
                    <BlockStack gap="300">
                      <InlineStack align="space-between">
                        <Text as="span" fontWeight="bold">
                          Certification {index + 1}
                        </Text>
                        <Button
                          icon={DeleteIcon}
                          onClick={() => removeCertification(index)}
                          variant="plain"
                          tone="critical"
                        />
                      </InlineStack>
                      <FormLayout>
                        <FormLayout.Group>
                          <Select
                            label="Certification Type"
                            options={CERTIFICATION_TYPES}
                            value={cert.type}
                            onChange={(v) => updateCertification(index, "type", v)}
                          />
                          <TextField
                            label="Certificate Number"
                            value={cert.certificateNumber}
                            onChange={(v) => updateCertification(index, "certificateNumber", v)}
                            autoComplete="off"
                          />
                        </FormLayout.Group>
                        <TextField
                          label="Issuing Body"
                          value={cert.issuingBody}
                          onChange={(v) => updateCertification(index, "issuingBody", v)}
                          autoComplete="organization"
                        />
                        <FormLayout.Group>
                          <TextField
                            label="Valid From"
                            type="date"
                            value={cert.validFrom}
                            onChange={(v) => updateCertification(index, "validFrom", v)}
                            autoComplete="off"
                          />
                          <TextField
                            label="Valid Until"
                            type="date"
                            value={cert.validUntil}
                            onChange={(v) => updateCertification(index, "validUntil", v)}
                            autoComplete="off"
                          />
                        </FormLayout.Group>
                      </FormLayout>
                    </BlockStack>
                  </Card>
                ))}

                <Button icon={PlusIcon} onClick={addCertification}>
                  Add Certification
                </Button>
              </BlockStack>
            </Card>
          </Layout.Section>

          {/* Sidebar */}
          <Layout.Section variant="oneThird">
            {/* Carbon Footprint Calculator */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    Carbon Footprint
                  </Text>
                  <Text as="span" tone="subdued">
                    RECOMMENDED - Auto-calculate from fiber data
                  </Text>
                </BlockStack>

                <Divider />

                <TextField
                  label="Product Weight"
                  type="number"
                  value={productWeight}
                  onChange={setProductWeight}
                  suffix="kg"
                  autoComplete="off"
                  helpText="Total weight of finished product"
                />

                <Button
                  onClick={handleCalculateCarbon}
                  loading={isCalculatingCarbon}
                  disabled={!fiberTotalValid || !countryOfManufacture}
                >
                  Calculate Carbon Footprint
                </Button>

                {carbonFootprint && (
                  <Banner tone="success">
                    <BlockStack gap="200">
                      <Text as="span" fontWeight="bold">
                        {carbonFootprint.value.toFixed(2)} kgCO2e
                      </Text>
                      <Text as="span" tone="subdued">
                        Methodology: {carbonFootprint.methodology}
                      </Text>
                      <Text as="span" tone="subdued">
                        Scope: {carbonFootprint.scope.replace(/_/g, " ")}
                      </Text>
                    </BlockStack>
                  </Banner>
                )}
              </BlockStack>
            </Card>

            {/* Recyclability */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    Recyclability
                  </Text>
                  <Text as="span" tone="subdued">
                    RECOMMENDED - End-of-life information
                  </Text>
                </BlockStack>

                <Divider />

                <TextField
                  label="Recyclable Percentage"
                  type="number"
                  value={recyclablePercentage}
                  onChange={setRecyclablePercentage}
                  suffix="%"
                  autoComplete="off"
                  helpText="Percentage of product that can be recycled"
                />

                <TextField
                  label="End-of-Life Instructions"
                  value={endOfLifeInstructions}
                  onChange={setEndOfLifeInstructions}
                  multiline={2}
                  autoComplete="off"
                  helpText="How to properly dispose or recycle"
                />
              </BlockStack>
            </Card>

            {/* Durability */}
            <Card>
              <BlockStack gap="400">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingMd">
                    Durability
                  </Text>
                  <Text as="span" tone="subdued">
                    RECOMMENDED - Product lifespan information
                  </Text>
                </BlockStack>

                <Divider />

                <TextField
                  label="Expected Lifespan"
                  type="number"
                  value={expectedLifespanYears}
                  onChange={setExpectedLifespanYears}
                  suffix="years"
                  autoComplete="off"
                />

                <TextField
                  label="Warranty Period"
                  type="number"
                  value={warrantyYears}
                  onChange={setWarrantyYears}
                  suffix="years"
                  autoComplete="off"
                />
              </BlockStack>
            </Card>

            {/* Validation Summary */}
            {validationResult && validationResult.errors.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Required Fields
                  </Text>

                  <Divider />

                  <BlockStack gap="200">
                    {validationResult.errors.map((error: any, index: number) => (
                      <InlineStack key={index} gap="200" blockAlign="start">
                        <Icon source={AlertTriangleIcon} tone="critical" />
                        <Text as="span" tone="critical">
                          {error.message}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}

            {validationResult && validationResult.warnings.length > 0 && (
              <Card>
                <BlockStack gap="400">
                  <Text as="h2" variant="headingMd">
                    Recommendations
                  </Text>

                  <Divider />

                  <BlockStack gap="200">
                    {validationResult.warnings.slice(0, 5).map((warning: any, index: number) => (
                      <InlineStack key={index} gap="200" blockAlign="start">
                        <Icon source={InfoIcon} tone="warning" />
                        <Text as="span" tone="subdued">
                          {warning.message}
                        </Text>
                      </InlineStack>
                    ))}
                  </BlockStack>
                </BlockStack>
              </Card>
            )}
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
          {products.length === 0 ? (
            <Banner>
              <p>All your products already have DPPs. Create a new product in Shopify first.</p>
            </Banner>
          ) : (
            <ResourceList
              resourceName={{ singular: "product", plural: "products" }}
              items={products}
              renderItem={(item) => (
                <ResourceItem
                  id={item.id}
                  media={
                    <Thumbnail
                      source={item.imageUrl || ""}
                      alt={item.title}
                    />
                  }
                  onClick={() => {
                    setSelectedProduct(item);
                    if (item.vendor) {
                      setManufacturerName(item.vendor);
                    }
                  }}
                  selected={selectedProduct?.id === item.id}
                >
                  <Text as="span" fontWeight="bold">
                    {item.title}
                  </Text>
                  <div>
                    <Text as="span" tone="subdued">
                      {item.vendor} • {item.productType || "No type"}
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

import { json } from "@remix-run/node";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData, useSubmit, useNavigation, useActionData } from "@remix-run/react";
import { useState, useCallback, useEffect } from "react";
import {
  Page,
  Layout,
  Card,
  FormLayout,
  TextField,
  Button,
  Text,
  BlockStack,
  InlineStack,
  Banner,
  Checkbox,
  Link,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const settings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  return json({
    shop: session.shop,
    settings: {
      eurocomplyApiKey: settings?.eurocomplyApiKey ? "••••••••" : "",
      eurocomplyOrgId: settings?.eurocomplyOrgId || "",
      autoSyncEnabled: settings?.autoSyncEnabled ?? true,
      dppTemplateId: settings?.dppTemplateId || "",
    },
    hasApiKey: !!settings?.eurocomplyApiKey,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const formData = await request.formData();

  const eurocomplyApiKey = formData.get("eurocomplyApiKey") as string;
  const eurocomplyOrgId = formData.get("eurocomplyOrgId") as string;
  const autoSyncEnabled = formData.get("autoSyncEnabled") === "true";
  const dppTemplateId = formData.get("dppTemplateId") as string;

  // Validate API key if provided (not the masked version)
  if (eurocomplyApiKey && !eurocomplyApiKey.includes("••••")) {
    // TODO: Validate API key against EuroComply API
    const isValid = eurocomplyApiKey.startsWith("ec_"); // Simple validation
    if (!isValid) {
      return json(
        { error: "Invalid API key format. Keys should start with 'ec_'" },
        { status: 400 }
      );
    }
  }

  const existingSettings = await prisma.shopSettings.findUnique({
    where: { shop: session.shop },
  });

  const updateData: any = {
    eurocomplyOrgId,
    autoSyncEnabled,
    dppTemplateId,
  };

  // Only update API key if a new one was provided
  if (eurocomplyApiKey && !eurocomplyApiKey.includes("••••")) {
    updateData.eurocomplyApiKey = eurocomplyApiKey;
  }

  await prisma.shopSettings.upsert({
    where: { shop: session.shop },
    create: {
      shop: session.shop,
      eurocomplyApiKey: eurocomplyApiKey.includes("••••") ? existingSettings?.eurocomplyApiKey : eurocomplyApiKey,
      eurocomplyOrgId,
      autoSyncEnabled,
      dppTemplateId,
    },
    update: updateData,
  });

  return json({ success: true, message: "Settings saved successfully" });
};

export default function Settings() {
  const { shop, settings, hasApiKey } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isLoading = navigation.state === "submitting";

  const [formState, setFormState] = useState({
    eurocomplyApiKey: settings.eurocomplyApiKey,
    eurocomplyOrgId: settings.eurocomplyOrgId,
    autoSyncEnabled: settings.autoSyncEnabled,
    dppTemplateId: settings.dppTemplateId,
  });

  const handleSubmit = useCallback(() => {
    const formData = new FormData();
    formData.append("eurocomplyApiKey", formState.eurocomplyApiKey);
    formData.append("eurocomplyOrgId", formState.eurocomplyOrgId);
    formData.append("autoSyncEnabled", String(formState.autoSyncEnabled));
    formData.append("dppTemplateId", formState.dppTemplateId);
    submit(formData, { method: "post" });
  }, [formState, submit]);

  return (
    <Page title="Settings">
      <BlockStack gap="500">
        {actionData?.success && (
          <Banner title="Settings saved" tone="success" onDismiss={() => {}}>
            <p>Your EuroComply settings have been updated.</p>
          </Banner>
        )}

        {actionData?.error && (
          <Banner title="Error" tone="critical" onDismiss={() => {}}>
            <p>{actionData.error}</p>
          </Banner>
        )}

        <Layout>
          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  EuroComply API Configuration
                </Text>
                <Text as="p" tone="subdued">
                  Connect your EuroComply account to generate Digital Product Passports for your products.
                  Get your API credentials from your{" "}
                  <Link url="https://eurocomply.io/dashboard/api-keys" external>
                    EuroComply dashboard
                  </Link>
                  .
                </Text>

                <FormLayout>
                  <TextField
                    label="API Key"
                    value={formState.eurocomplyApiKey}
                    onChange={(value) =>
                      setFormState((prev) => ({ ...prev, eurocomplyApiKey: value }))
                    }
                    type="password"
                    autoComplete="off"
                    helpText="Your EuroComply API key (starts with ec_)"
                  />

                  <TextField
                    label="Organization ID"
                    value={formState.eurocomplyOrgId}
                    onChange={(value) =>
                      setFormState((prev) => ({ ...prev, eurocomplyOrgId: value }))
                    }
                    autoComplete="off"
                    helpText="Your EuroComply organization identifier"
                  />

                  <TextField
                    label="DPP Template ID (Optional)"
                    value={formState.dppTemplateId}
                    onChange={(value) =>
                      setFormState((prev) => ({ ...prev, dppTemplateId: value }))
                    }
                    autoComplete="off"
                    helpText="Use a specific DPP template for all products from this store"
                  />
                </FormLayout>
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Sync Settings
                </Text>

                <Checkbox
                  label="Enable automatic sync"
                  helpText="Automatically create/update DPPs when products are created or modified"
                  checked={formState.autoSyncEnabled}
                  onChange={(value) =>
                    setFormState((prev) => ({ ...prev, autoSyncEnabled: value }))
                  }
                />
              </BlockStack>
            </Card>
          </Layout.Section>

          <Layout.Section>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">
                  Shop Information
                </Text>
                <Text as="p" tone="subdued">
                  Shop: {shop}
                </Text>
                <Text as="p" tone="subdued">
                  Status: {hasApiKey ? "Connected to EuroComply" : "Not connected"}
                </Text>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>

        <InlineStack align="end">
          <Button variant="primary" onClick={handleSubmit} loading={isLoading}>
            Save Settings
          </Button>
        </InlineStack>
      </BlockStack>
    </Page>
  );
}

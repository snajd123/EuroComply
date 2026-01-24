# Postman Webhook Tests

Individual Postman collections for testing Clerk webhooks.

## Setup

1. Import any file into Postman
2. Set `webhookSecret` in collection variables (your `CLERK_WEBHOOK_SECRET`)
3. Run requests in order

## Files

| File | Description |
|------|-------------|
| `1-organization-created.json` | Creates org + provisions tenant schema |
| `2-membership-created-first-user.json` | Adds first user (MANAGER + isOrgAdmin) |
| `3-membership-created-second-user.json` | Adds second user (NONE permissions) |
| `4-user-updated.json` | Updates user profile |
| `5-membership-deleted.json` | Removes second user (soft delete) |
| `6-organization-deleted.json` | Deletes org + drops schema |

## Variable Passing

Each file stores variables that subsequent files need:

```
1-organization-created → sets clerkOrgId, schemaName
2-membership-first    → needs clerkOrgId, sets clerkUserId
3-membership-second   → needs clerkOrgId, sets clerkUserId2
4-user-updated        → needs clerkOrgId, clerkUserId
5-membership-deleted  → needs clerkOrgId, clerkUserId2
6-organization-deleted→ needs clerkOrgId
```

**Important:** If you import files separately, you must manually copy variable values between collections, or import all files you need together.

## Quick Test

For a full test flow, import files 1 and 2, then:

1. Set `webhookSecret`
2. Run `organization.created`
3. Copy `clerkOrgId` value to file 2's variables
4. Run `organizationMembership.created (First User)`
5. Check database:
   ```sql
   SELECT * FROM tenant_org_<suffix>.users;
   SELECT * FROM tenant_org_<suffix>.organization_users;
   ```

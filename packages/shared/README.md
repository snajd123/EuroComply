# @eurocomply/shared

Shared types, constants, and utilities for the EuroComply platform.

## Installation

```bash
# Internal monorepo package
pnpm add @eurocomply/shared
```

## Exports

### API Response Helpers

```typescript
import { ok, err, type ApiResponse } from '@eurocomply/shared';

// Success response
return ok({ id: '123', name: 'Product' });

// Error response
return err('VALIDATION_ERROR', 'Invalid input');
```

### Product Types

```typescript
import {
  PRODUCT_TYPES,
  PRODUCT_WORKSPACES,
  IDENTIFIER_TYPES,
  type ProductType,
  type ProductWorkspace,
  type CreateProductInput,
} from '@eurocomply/shared';
```

### Authorities & Permissions

```typescript
import {
  WORKSPACE_AUTHORITIES,
  canWrite,
  canRelease,
  type WorkspaceAuthority,
} from '@eurocomply/shared';
```

### Operations Events

```typescript
import {
  OperationsEventSchema,
  type OperationsEvent,
  type OperationsEventType,
} from '@eurocomply/shared';
```

### Forensic Context

```typescript
import {
  type UserForensicContext,
  type OrgForensicContext,
} from '@eurocomply/shared';
```

### Timestamp Types

```typescript
import {
  type TimestampProof,
  type TimestampProvider,
} from '@eurocomply/shared';
```

### Status List 2021

```typescript
import {
  encodeStatusList,
  decodeStatusList,
  isBitSet,
} from '@eurocomply/shared';
```

## Development

```bash
pnpm build     # Build TypeScript
pnpm test      # Run tests
pnpm typecheck # Type check without emitting
```

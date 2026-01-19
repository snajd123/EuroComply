# @eurocomply/walt-id

TypeScript client for walt.id Community Stack services (SSI/DID operations).

## Installation

```bash
# Internal monorepo package
pnpm add @eurocomply/walt-id
```

## Usage

### Create Client

```typescript
import { createWaltIdClient, WaltIdClient } from '@eurocomply/walt-id';

// From environment variables
const client = createWaltIdClient();

// Manual configuration
const client = new WaltIdClient({
  coreApiUrl: 'http://localhost:7000',
  signatoryUrl: 'http://localhost:7001',
  custodianUrl: 'http://localhost:7002',
  auditorUrl: 'http://localhost:7003',
  timeout: 30000,
});
```

### DID Operations (Core API)

```typescript
// Create DID
const { did, didDocument } = await client.createDid({
  method: 'key',
  keyAlgorithm: 'Ed25519',
});

// Resolve DID
const didDocument = await client.resolveDid('did:key:z6Mk...');
```

### Key Operations (Custodian)

```typescript
// List keys
const keys = await client.listKeys();

// Get key by ID
const key = await client.getKey('key-id');

// Delete key
await client.deleteKey('key-id');
```

### Signing Operations (Signatory)

```typescript
// Sign payload
const { jws } = await client.sign({
  keyId: 'key-id',
  payload: { claim: 'value' },
  proofType: 'JsonWebSignature2020',
});

// Issue Verifiable Credential
const { vcJwt } = await client.issueVc({
  issuerDid: 'did:key:...',
  issuerKeyId: 'key-id',
  subjectDid: 'did:key:...',
  credentialType: ['VerifiableCredential', 'ProductPassport'],
  credentialSubject: { /* ... */ },
});
```

### Verification Operations (Auditor)

```typescript
const result = await client.verify({
  vcJwt: 'eyJ...',
  policies: ['signature', 'expired'],
});
```

## Error Handling

```typescript
import {
  WaltIdError,
  WaltIdConnectionError,
  WaltIdSigningError,
  WaltIdKeyNotFoundError,
} from '@eurocomply/walt-id';

try {
  await client.sign(request);
} catch (error) {
  if (error instanceof WaltIdKeyNotFoundError) {
    console.error('Key not found:', error.keyId);
  } else if (error instanceof WaltIdConnectionError) {
    console.error('Connection failed:', error.url);
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `WALTID_CORE_URL` | Core API URL | `http://localhost:7000` |
| `WALTID_SIGNATORY_URL` | Signatory URL | `http://localhost:7001` |
| `WALTID_CUSTODIAN_URL` | Custodian URL | `http://localhost:7002` |
| `WALTID_AUDITOR_URL` | Auditor URL | `http://localhost:7003` |
| `WALTID_API_KEY` | API key (optional) | - |
| `WALTID_ALLOW_INSECURE` | Allow HTTP in production | `false` |

## Security

HTTP URLs are blocked in production by default. Use HTTPS or set `WALTID_ALLOW_INSECURE=true` (not recommended).

## Development

```bash
pnpm build     # Build TypeScript
pnpm test      # Run tests
pnpm typecheck # Type check without emitting
```

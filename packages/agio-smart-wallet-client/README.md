# agio-smart-wallet-client

Client-side SDK for Agio smart wallet operations. Framework-agnostic - use with Vue, React, Svelte, or vanilla JavaScript.

## Installation

```bash
npm install agio-smart-wallet-client @account-kit/signer
# or
yarn add agio-smart-wallet-client @account-kit/signer
```

Note: `@account-kit/signer` is a peer dependency required for the AlchemyWebSigner.

## Usage

### Basic Setup

```typescript
import { SmartWalletClient } from "agio-smart-wallet-client";
import { sepolia } from "viem/chains";

const client = new SmartWalletClient({
  alchemyApiKey: "your-alchemy-api-key",
  policyId: "your-gas-policy-id",
  chain: sepolia,
});
```

### Create Wallet

```typescript
import { AlchemyWebSigner } from "@account-kit/signer";

// Initialize signer (typically done once at app startup)
const signer = new AlchemyWebSigner({
  client: {
    connection: { apiKey: "your-alchemy-api-key" },
    iframeConfig: { iframeContainerId: "signer-iframe" },
  },
});

// Authenticate user
await signer.authenticate({
  type: "oauth",
  authProviderId: "auth0",
  mode: "redirect",
  redirectUrl: window.location.href,
});

// Create smart wallet (counterfactual - deployed on first tx)
const accountAddress = await client.createWallet(signer);
console.log(`Wallet address: ${accountAddress}`);
```

### Create Session Key

```typescript
import { EXPIRY_PRESETS } from "agio-smart-wallet-client";

// Create session with permissions
const session = await client.createSession(signer, accountAddress, {
  expiryHours: EXPIRY_PRESETS["7d"], // 7 days
  permissions: [
    {
      type: "native-token-transfer",
      data: { maxAmount: "1000000000000000000" }, // 1 ETH
    },
  ],
});

// Send session to your backend for storage
await fetch("/api/session", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    sessionId: session.sessionId,
    sessionKey: session.sessionKey,
    sessionKeyAddress: session.sessionKeyAddress,
    accountAddress,
    signature: session.signature,
    permissionsContext: session.permissionsContext,
    permissions: session.permissions,
    expiresAt: session.expiresAt,
  }),
});
```

### Direct Transaction (No Session Key)

```typescript
// User signs directly - bypasses session keys
const txHash = await client.sendDirectTransaction(signer, {
  to: "0x...",
  value: "0.01", // ETH (will be converted to wei)
  data: "0x", // optional calldata
});
```

### Utility Methods

```typescript
// Check if account is deployed on-chain
const isDeployed = await client.isAccountDeployed(accountAddress);

// Get native token balance
const balance = await client.getBalance(accountAddress);
console.log(`Balance: ${balance} wei`);
```

### Multi-Account Support

```typescript
// Create multiple accounts for the same signer
const account1 = await client.createWallet(signer, { accountId: "trading" });
const account2 = await client.createWallet(signer, { accountId: "savings" });

// Create session for specific account
const session = await client.createSession(signer, account1, {
  accountId: "trading",
  expiryHours: 24,
});
```

## Re-exported Utilities

The package re-exports utilities from `agio-smart-wallet-core` for convenience:

```typescript
import {
  // Validation
  isSessionActive,
  validateSession,

  // Expiry
  calculateExpiry,
  formatExpiry,
  EXPIRY_PRESETS,
  MAX_EXPIRY_MS,

  // Context extraction
  extractSessionId,
  extractSignature,
} from "agio-smart-wallet-client";
```

## API Reference

### SmartWalletClient

#### Constructor

```typescript
new SmartWalletClient({
  alchemyApiKey: string,
  policyId: string,
  chain: Chain,
})
```

#### Methods

- `createWallet(signer, options?)` - Create smart wallet, returns address
- `createSession(signer, accountAddress, options?)` - Create session key
- `sendDirectTransaction(signer, tx)` - Send transaction (user signs)
- `isAccountDeployed(accountAddress)` - Check if deployed on-chain
- `getBalance(accountAddress)` - Get native token balance

### Types

```typescript
interface CreateWalletOptions {
  accountId?: string; // For multi-account support
}

interface CreateSessionResult {
  sessionId: string;
  sessionKey: Hex;
  sessionKeyAddress: Address;
  signature: Hex;
  permissionsContext: Hex;
  permissions: Permission[];
  expiresAt: number;
}
```

## License

MIT

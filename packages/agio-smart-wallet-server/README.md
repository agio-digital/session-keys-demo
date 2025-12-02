# agio-smart-wallet-server

Server-side SDK for Agio smart wallet session key management. Transport-agnostic - use with Express, Fastify, tRPC, GraphQL, or any Node.js framework.

## Installation

```bash
npm install agio-smart-wallet-server
# or
yarn add agio-smart-wallet-server
```

## Usage

### Basic Setup

```typescript
import { SmartWalletService, InMemoryStorage } from "agio-smart-wallet-server";
import { sepolia } from "viem/chains";

const storage = new InMemoryStorage();

const walletService = new SmartWalletService({
  alchemyApiKey: process.env.ALCHEMY_API_KEY,
  policyId: process.env.ALCHEMY_GAS_POLICY_ID,
  chain: sepolia,
  sessionStorage: storage,
  walletStorage: storage,
});
```

### Wallet Operations

```typescript
// Save wallet for user
await walletService.saveWallet(userId, accountAddress);

// Get wallet
const wallet = await walletService.getWallet(userId);
```

### Session Operations

```typescript
// Store session (after client-side grantPermissions)
await walletService.storeSession(userId, {
  sessionId,
  sessionKey,
  sessionKeyAddress,
  accountAddress,
  signature,
  permissionsContext,
  permissions,
  expiresAt,
});

// Get session
const session = await walletService.getSession(userId);

// Validate session
const validation = await walletService.validateUserSession(userId);
if (!validation.valid) {
  console.log(`Session invalid: ${validation.reason}`);
}

// Revoke session
await walletService.revokeSession(userId);
```

### Send Transaction

```typescript
// Execute transaction using stored session key
const result = await walletService.sendTransaction(userId, {
  to: "0x...",
  value: "1000000000000000", // wei
  data: "0x", // optional calldata
});

console.log(`Transaction hash: ${result.transactionHash}`);
```

### Custom Storage

Implement the storage interfaces for your database:

```typescript
import type { SessionStorage, WalletStorage } from "agio-smart-wallet-server";
import type { SessionData, WalletData } from "agio-smart-wallet-core";

class PostgresStorage implements SessionStorage, WalletStorage {
  async saveSession(userId: string, session: SessionData): Promise<void> {
    // Save to PostgreSQL
  }

  async getSession(userId: string): Promise<SessionData | null> {
    // Fetch from PostgreSQL
  }

  async revokeSession(userId: string): Promise<void> {
    // Update revoked flag
  }

  async saveWallet(userId: string, wallet: WalletData): Promise<void> {
    // Save to PostgreSQL
  }

  async getWallet(userId: string): Promise<WalletData | null> {
    // Fetch from PostgreSQL
  }
}
```

## API Reference

### SmartWalletService

#### Constructor

```typescript
new SmartWalletService({
  alchemyApiKey: string,
  policyId: string,
  chain: Chain,
  sessionStorage: SessionStorage,
  walletStorage: WalletStorage,
})
```

#### Methods

- `saveWallet(userId, accountAddress, accountId?)` - Save wallet address
- `getWallet(userId, accountId?)` - Get wallet data
- `storeSession(userId, session)` - Store session key
- `getSession(userId, sessionId?)` - Get session data
- `validateUserSession(userId, sessionId?)` - Validate session
- `revokeSession(userId, sessionId?)` - Revoke session
- `sendTransaction(userId, tx, sessionId?)` - Send transaction

### Storage Interfaces

#### SessionStorage

```typescript
interface SessionStorage {
  saveSession(userId: string, session: SessionData): Promise<void>;
  getSession(userId: string, sessionId?: string): Promise<SessionData | null>;
  getSessions?(userId: string): Promise<SessionData[]>;
  revokeSession(userId: string, sessionId?: string): Promise<void>;
  deleteSession?(userId: string, sessionId?: string): Promise<void>;
}
```

#### WalletStorage

```typescript
interface WalletStorage {
  saveWallet(userId: string, wallet: WalletData): Promise<void>;
  getWallet(userId: string): Promise<WalletData | null>;
  deleteWallet?(userId: string): Promise<void>;
}
```

## Security Considerations

- **Session keys should be stored securely** - Use KMS (AWS KMS, Google Cloud KMS) in production
- **Validate permissions** - Implement permission validation before executing transactions
- **Rate limiting** - Add rate limiting to transaction endpoints
- **Audit logging** - Log all session and transaction operations

## License

MIT

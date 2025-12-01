# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Full-stack Alchemy session keys demo implementing delegated transaction signing using smart contract wallets (ERC-4337). The architecture separates concerns between client-side wallet management and server-side transaction signing using ephemeral session keys.

## Monorepo Structure

Yarn workspaces with two packages:
- **app/** - Vue 3 frontend (Vite, TypeScript, HTTPS on port 8080)
- **server/** - Express backend (TypeScript, tsx, HTTPS on port 3001)

## Development Commands

```bash
# Install dependencies (run from root)
yarn install

# Run both app and server concurrently
yarn dev

# Build all workspaces
yarn build

# Type checking across all workspaces
yarn typecheck

# Run tests across all workspaces
yarn test

# Watch mode for tests
yarn test:watch

# Lint (app only)
yarn lint

# Format (app only)
yarn format
```

### Workspace-specific Commands

```bash
# Run commands in specific workspace
yarn workspace app [command]
yarn workspace server [command]

# Examples:
yarn workspace app dev          # Run frontend only
yarn workspace server dev       # Run backend only
yarn workspace app test:run     # Run app tests once
yarn workspace server test:ui   # Run server tests with UI
```

## Environment Setup

### app/.env
Required environment variables:
- `VITE_AUTH0_DOMAIN` - Auth0 domain for authentication
- `VITE_AUTH0_CLIENT_ID` - Auth0 client ID
- `VITE_API_URL` - Backend API URL (default: https://localhost:3001)
- `VITE_ALCHEMY_API_KEY` - Alchemy API key for smart account operations

**Note**: Both frontend and backend run on HTTPS for Auth0 compatibility and security. SSL certificates are auto-generated on first run using openssl. Browser will show certificate warnings for local development - accept them to proceed.

### server/.env
Required environment variables:
- `PORT` - Server port (default: 3001)
- `ALCHEMY_API_KEY` - Alchemy API key for transaction signing

Copy `.env.example` files in both directories to get started.

## Architecture

### Session Key Flow

1. **Client (app/src/views/Wallet.vue)**
   - User authenticates via Auth0
   - Creates Alchemy Modular Account (smart contract wallet) with randomly generated EOA as owner
   - Generates ephemeral session key (temporary private key) with scoped permissions
   - User's main signer signs authorization message (main key never leaves client)
   - Sends session key to backend via HTTPS POST to `/api/session`

2. **Server (server/src/index.ts)**
   - Receives session key, stores in-memory (production: use KMS + database)
   - Validates session expiry and revocation status on transaction requests
   - Uses session key to sign UserOperations via Alchemy Account Kit
   - Executes transactions on Sepolia testnet respecting permission boundaries

3. **Key Security Properties**
   - Main private key: stored in browser localStorage, NEVER transmitted to server
   - Session keys: ephemeral, scoped permissions (spending limits, time windows), sent to server for delegated signing
   - Backend stores session keys in filesystem (WARNING: production should use KMS + database)
   - Backend only stores account addresses for wallet tracking, never main private keys
   - Sessions can be revoked instantly via DELETE `/api/session/:userId`

### Frontend Architecture

- **main.ts**: Initializes Vue app, Auth0 plugin, router
- **router/index.ts**: Routes with Auth0 auth guard protecting /wallet
- **views/Login.vue**: Landing page with Auth0 login flow
- **views/Wallet.vue**: Main interface for wallet creation, session management, transactions
  - Uses `@alchemy/aa-alchemy` for smart account client creation
  - Uses `LocalAccountSigner` for EOA owner and session key signing
  - Communicates with backend API for session storage and transaction execution

### Backend Architecture

- **server/src/index.ts**: Express server with 4 endpoints:
  - `POST /api/session` - Store session key with permissions
  - `GET /api/session/:userId` - Get session info
  - `DELETE /api/session/:userId` - Revoke session
  - `POST /api/transaction` - Execute transaction using stored session key
- In-memory Map for session storage (keyed by userId from Auth0)
- Uses `LocalAccountSigner.privateKeyToAccountSigner()` to reconstruct signer from stored key
- Creates Alchemy client with session signer and existing account address

### Key Dependencies

- **@alchemy/aa-alchemy**: Alchemy Account Kit for modular account creation
- **@alchemy/aa-core**: Core AA primitives (LocalAccountSigner, SmartAccountSigner types)
- **@auth0/auth0-vue**: Auth0 authentication for Vue
- **viem**: Ethereum library for account and key generation
- **vue-router**: Client-side routing with auth guards

### Network Configuration

Demo runs on **Sepolia testnet**. All Alchemy clients configured with `sepolia` chain from `viem/chains`.

### Gas Sponsorship Configuration

**Alchemy Gas Manager** is configured to sponsor all transaction fees - users never need to fund their accounts!

Configuration in both client and server:
```typescript
const client = await createModularAccountAlchemyClient({
  transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
  chain: sepolia,
  signer,
  policyId: ALCHEMY_GAS_POLICY_ID, // Gas Manager Policy ID
});
```

**Environment Variables Required:**
- `ALCHEMY_GAS_POLICY_ID` / `VITE_ALCHEMY_GAS_POLICY_ID` - Gas Manager Policy ID from Alchemy Dashboard
- `ALCHEMY_APP_ID` / `VITE_ALCHEMY_APP_ID` - Alchemy App ID for tracking

**How it works:**
1. **Create Wallet**: Generates a counterfactual address (no deployment, no funding needed)
2. **Create Session**: Session keys created and stored server-side
3. **First Transaction**: Account automatically deploys on-chain with gas sponsored by Alchemy
4. **Subsequent Transactions**: All gas fees sponsored by the Gas Manager Policy

No manual funding required - Alchemy sponsors all gas fees within policy limits.

## Important Implementation Details

### Session Permissions Structure

Permissions are defined as objects with type and data:
```typescript
const permissions = [
  {
    type: "native-token-transfer",
    data: {
      maxAmount: "1000000000000000000", // 1 ETH in wei
    },
  },
];
```

### Session Expiry Handling

Backend validates on every transaction:
- Check if session exists
- Check `session.revoked` flag
- Check `Date.now() > session.expiresAt`

### Smart Account Creation

Client creates account with:
```typescript
const client = await createModularAccountAlchemyClient({
  apiKey: ALCHEMY_API_KEY,
  chain: sepolia,
  signer,  // LocalAccountSigner with owner EOA
});
```

Backend reuses existing account with:
```typescript
const client = await createModularAccountAlchemyClient({
  apiKey: ALCHEMY_API_KEY,
  chain: sepolia,
  signer: sessionSigner,
  accountAddress: session.accountAddress,  // Existing account
});
```

### UserOperation Execution

Backend sends transactions via UserOperations:
```typescript
const result = await client.sendUserOperation({
  uo: {
    target: to as Hex,
    data: (data || '0x') as Hex,
    value: BigInt(value || 0),
  },
});
const txHash = await client.waitForUserOperationTransaction(result);
```

## Testing

Tests use Vitest. Located in:
- `app/src/__tests__/` - Frontend tests
- `server/src/__tests__/` - Backend tests (session validation logic)

Run single test file:
```bash
yarn workspace app test App.test.ts
yarn workspace server test session.test.ts
```

## Production Considerations

The README references `/Users/chris/git/middleware/docs/alchemy-session-keys.md` for detailed architecture and production guidance. Key production changes needed:

1. Replace in-memory session storage with database
2. Store session keys in KMS (AWS KMS, Google Cloud KMS, etc.)
3. Add proper authentication/authorization on backend endpoints
4. Implement permission validation logic before transaction execution
5. Add rate limiting and monitoring
6. Use production network instead of Sepolia testnet

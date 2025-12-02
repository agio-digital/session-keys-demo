# Alchemy Session Keys Demo

Full-stack implementation of Alchemy session keys for delegated transaction signing using smart contract wallets (ERC-4337).

## Package Architecture

This monorepo contains reusable SDK packages:

| Package | Description |
|---------|-------------|
| `agio-smart-wallet-core` | Shared types, constants, utilities |
| `agio-smart-wallet-client` | Client-side SDK (`SmartWalletClient`) |
| `agio-smart-wallet-server` | Server-side SDK (`SmartWalletService`) |

Plus demo applications:
- **app/** - Vue 3 frontend demonstrating wallet creation, session management
- **server/** - Express backend demonstrating session storage and transaction execution

## Architecture

**Frontend (Vue 3 + Vite + TypeScript)**
- Smart wallet provisioning with Alchemy Account Kit
- Session key generation and authorization via `SmartWalletClient`
- User signs session creation (main key never leaves client)
- Sends session key to backend API over HTTPS

**Backend (Express + TypeScript)**
- Receives and stores session keys via `SmartWalletService`
- Signs transactions using session keys
- Validates session expiry and permissions
- Executes ERC-4337 UserOperations via Alchemy

## Flow

1. **Create Smart Wallet**: User creates Alchemy modular account (smart contract wallet)
2. **Create Session Key**: User generates ephemeral session key with scoped permissions
3. **Delegate Signing**: Session key sent to backend, stored securely
4. **Execute Transactions**: Backend signs transactions using session key within defined limits
5. **Revoke**: User can revoke session at any time

## Setup

```bash
# Install dependencies
yarn install

# Run dev servers (app: 8080, server: 3001)
yarn dev

# Typecheck
yarn typecheck

# Build
yarn build

# Test
yarn test
```

## Environment Variables

**app/.env**
```
VITE_API_URL=https://localhost:3001
VITE_ALCHEMY_API_KEY=your_alchemy_api_key
VITE_ALCHEMY_GAS_POLICY_ID=your_gas_policy_id
VITE_AUTH0_DOMAIN=your_auth0_domain
VITE_AUTH0_CLIENT_ID=your_auth0_client_id
```

**server/.env**
```
PORT=3001
ALCHEMY_API_KEY=your_alchemy_api_key
ALCHEMY_GAS_POLICY_ID=your_gas_policy_id
AUTH0_DOMAIN=your_auth0_domain
```

## Key Features

- **Smart Contract Wallets**: ERC-4337 account abstraction
- **Session Keys**: Scoped permissions (spending limits, expiry)
- **Gas Sponsorship**: Alchemy Gas Manager sponsors all transaction fees
- **Delegated Signing**: Backend signs without accessing main private key
- **Secure**: Main key never leaves client, session keys stored in backend
- **Revocable**: Sessions can be revoked instantly
- **Auth0 Integration**: Secure authentication with Alchemy WebSigner
- **Multi-Account Support**: Users can create multiple wallets
- **Type Safe**: Full TypeScript with strict mode
- **Tested**: Vitest for unit testing

## Security

- **Main private key**: Managed by Alchemy WebSigner, never exposed
- **Session keys**: Sent to backend over HTTPS, stored securely (use KMS in production)
- **Permissions**: Spending limits, time windows, allowed operations
- **Revocation**: Instant session invalidation

## Network

Demo uses **Sepolia testnet**. Gas fees are sponsored by Alchemy Gas Manager - no funding required.

## Documentation

- [Integration Guide](docs/integration-guide.md) - Code samples for integrating session keys
- [Architecture](docs/architecture.md) - System architecture and flow diagrams
- [CLAUDE.md](CLAUDE.md) - Project overview and development guide

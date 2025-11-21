# Alchemy Session Keys Demo

Full-stack implementation of Alchemy session keys for delegated transaction signing using smart contract wallets.

## Architecture

**Frontend (Vue 3 + Vite + TypeScript)**
- Smart wallet provisioning with Alchemy Account Kit
- Session key generation and authorization
- User signs session creation (main key never leaves client)
- Sends session key to backend API over HTTPS

**Backend (Express + TypeScript)**
- Receives and stores session keys (in-memory, use KMS in production)
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

# Format code
yarn format

# Lint
yarn lint
```

## Environment Variables

**app/.env**
```
VITE_API_URL=http://localhost:3001
VITE_ALCHEMY_API_KEY=your_alchemy_api_key
```

**server/.env**
```
PORT=3001
ALCHEMY_API_KEY=your_alchemy_api_key
```

## Key Features

- **Smart Contract Wallets**: ERC-4337 account abstraction
- **Session Keys**: Scoped permissions (spending limits, expiry)
- **Delegated Signing**: Backend signs without accessing main private key
- **Secure**: Main key never leaves client, session keys stored in backend
- **Revocable**: Sessions can be revoked instantly
- **Auth0 Integration**: Secure authentication with loading state handling
- **Vue Router**: Protected routes with auth guards
- **Type Safe**: Full TypeScript with strict mode
- **Tested**: Vitest for unit testing
- **Code Quality**: ESLint + Prettier configured

## Security

- Main private key: stays on client
- Session keys: sent to backend over HTTPS, stored encrypted (use KMS in production)
- Permissions: spending limits, time windows, allowed operations
- Revocation: instant session invalidation

## Network

Demo uses **Sepolia testnet**. Get test ETH from [Sepolia faucet](https://sepoliafaucet.com/).

## Documentation

See `/Users/chris/git/middleware/docs/alchemy-session-keys.md` for detailed architecture and production considerations.

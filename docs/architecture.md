# Smart Wallet Session Keys Architecture

This document describes the architecture of the Alchemy Session Keys demo, which implements delegated transaction signing using ERC-4337 smart contract wallets.

## Overview

The system enables users to delegate transaction signing to a backend server using ephemeral session keys. This allows for automated transactions without requiring the user's main private key to leave their browser.

```
See: [session-keys.mermaid](session-keys.mermaid) for visual flow diagram
```

## Components

### Frontend (Vue 3 + Vite)

- **Auth0 Authentication**: Primary user authentication
- **Alchemy WebSigner**: Secondary authentication for wallet operations
- **Smart Wallet Client**: Creates and manages ERC-4337 smart accounts

### Backend (Express + TypeScript)

- **JWT Verification**: Validates Auth0 tokens using JWKS
- **Session Storage**: Stores session keys (filesystem in demo, KMS in production)
- **Transaction Signing**: Signs UserOperations with stored session keys

## Authentication Flow

1. User authenticates with Auth0 (primary)
2. User connects Alchemy WebSigner via Auth0 SSO (secondary)
3. Both authentications use the same Auth0 identity
4. Backend validates Auth0 JWT on every request

## Session Key Flow

### 1. Wallet Creation

```
Client                          Alchemy                         Backend
  |                                |                               |
  |-- createSmartWalletClient() -->|                               |
  |<-- counterfactual address -----|                               |
  |                                                                |
  |---------------------- POST /api/wallet ----------------------->|
  |<--------------------- { ok: true } ----------------------------|
```

- Client creates smart wallet client with Alchemy WebSigner
- Requests account (counterfactual - not deployed until first tx)
- Saves account address to backend

### 2. Session Creation

```
Client                          Alchemy                         Backend
  |                                |                               |
  |-- generatePrivateKey() ------->|                               |
  |   (local session key)          |                               |
  |                                |                               |
  |-- grantPermissions() --------->|                               |
  |   (user signs authorization)   |                               |
  |<-- permissionsContext ---------|                               |
  |                                                                |
  |---------------------- POST /api/session ---------------------->|
  |   { sessionKey, permissionsContext, ... }                      |
  |<--------------------- { ok: true } ----------------------------|
```

- Client generates ephemeral private key locally
- Calls `grantPermissions()` - user signs authorization message
- Sends session key + permissions context to backend
- Backend stores for later transaction signing

### 3. Transaction Execution

```
Client                          Backend                         Alchemy
  |                                |                               |
  |-- POST /api/transaction ------>|                               |
  |   { to, value, data }          |                               |
  |                                |-- prepareCalls() ------------>|
  |                                |<-- preparedCalls -------------|
  |                                |                               |
  |                                |-- signPreparedCalls() ------->|
  |                                |   (session key signature)     |
  |                                |                               |
  |                                |-- sendPreparedCalls() ------->|
  |                                |<-- txHash -------------------|
  |<-- { transactionHash } --------|                               |
```

- Client requests transaction via API
- Backend validates session (not expired, not revoked)
- Backend signs with stored session key
- Alchemy bundles and submits UserOperation

## Security Model

### Key Types

| Key | Location | Purpose |
|-----|----------|---------|
| Main Signer | Alchemy Cloud (WebSigner) | Account ownership, session authorization |
| Session Key | Backend (filesystem/KMS) | Delegated transaction signing |
| Auth0 JWT | Client (memory) | API authentication |

### Security Properties

1. **Main key never transmitted**: Alchemy WebSigner keeps main key in cloud
2. **Session keys are ephemeral**: 24-hour expiry, can be revoked instantly
3. **Scoped permissions**: Session keys have limited capabilities
4. **JWT authentication**: All API calls require valid Auth0 token
5. **HTTPS only**: All communication encrypted

### Session Permissions

Sessions are created with scoped permissions:

```typescript
const permissions = await client.grantPermissions({
  account: account.address,
  expirySec: Math.floor(expiresAt / 1000),
  key: {
    publicKey: sessionKeyAccount.address,
    type: "secp256k1",
  },
  permissions: [{ type: "root" }], // Full access in demo
});
```

Production implementations should use more restrictive permissions:
- `native-token-transfer`: Limit ETH transfer amounts
- `erc20-token-transfer`: Limit token transfers
- `contract-call`: Restrict to specific contracts/methods

## Data Storage

### Sessions (server/data/sessions.json)

```json
{
  "auth0|user-id": {
    "sessionId": "0x...",
    "sessionKey": "0x...",
    "sessionKeyAddress": "0x...",
    "accountAddress": "0x...",
    "signature": "0x...",
    "permissionsContext": "0x...",
    "permissions": [{ "type": "root" }],
    "expiresAt": 1764676730403,
    "revoked": false
  }
}
```

### Wallets (server/data/wallets.json)

```json
{
  "auth0|user-id": {
    "accountAddress": "0x...",
    "createdAt": 1764590130122
  }
}
```

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/wallet | JWT | Save wallet address |
| GET | /api/wallet | JWT | Get wallet info |
| POST | /api/session | JWT | Create session with key |
| GET | /api/session | JWT | Get session status |
| DELETE | /api/session | JWT | Revoke session |
| POST | /api/transaction | JWT | Execute transaction |

## Gas Sponsorship

All transactions are sponsored by Alchemy Gas Manager:

```typescript
const client = createSmartWalletClient({
  transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
  chain: sepolia,
  signer,
  policyId: ALCHEMY_GAS_POLICY_ID, // Sponsors gas
});
```

Users never need to fund their accounts - Alchemy pays all gas fees within policy limits.

## Production Considerations

1. **Key Management**: Replace filesystem storage with AWS KMS, Google Cloud KMS, or similar
2. **Database**: Use PostgreSQL/MongoDB instead of JSON files
3. **Permissions**: Implement restrictive session permissions (spending limits, allowed contracts)
4. **Rate Limiting**: Add rate limits to prevent abuse
5. **Monitoring**: Add logging, metrics, and alerting
6. **Network**: Switch from Sepolia testnet to mainnet

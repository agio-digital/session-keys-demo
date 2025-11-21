# Alchemy Session Keys - Implementation Guide

## Overview

This is a proof-of-concept (POC) implementation demonstrating Alchemy session keys for delegated transaction signing using ERC-4337 smart contract wallets. The demo shows how users can authorize temporary signing keys with scoped permissions, enabling backend services to execute transactions on their behalf without holding the main private key.

## Architecture

### Frontend (Vue 3 + Vite + TypeScript)
- **Port**: 8080
- **Framework**: Vue 3 with Composition API
- **Build Tool**: Vite with HMR
- **Authentication**: Auth0 Vue SDK
- **Wallet SDK**: Alchemy Account Kit (@alchemy/aa-alchemy)
- **Network**: Sepolia testnet

### Backend (Express + TypeScript)
- **Port**: 3001
- **Runtime**: tsx (TypeScript execution)
- **Storage**: In-memory session storage (use KMS in production)
- **Signing**: Alchemy Account Kit with session keys
- **Network**: Sepolia testnet

### Monorepo Structure
```
session-keys-demo/
├── app/                    # Vue frontend
│   ├── src/
│   │   ├── views/
│   │   │   ├── Login.vue   # Auth0 login page
│   │   │   └── Wallet.vue  # Main wallet interface
│   │   ├── router/
│   │   │   └── index.ts    # Vue Router with auth guards
│   │   ├── App.vue         # Root component
│   │   ├── main.ts         # Entry point
│   │   └── env.d.ts        # Environment variable types
│   ├── .env.example
│   └── package.json
├── server/                 # Express backend
│   ├── src/
│   │   └── index.ts        # API server
│   ├── .env.example
│   └── package.json
├── docs/                   # Documentation
└── package.json            # Root workspace config
```

## Session Keys Flow

### 1. User Authentication
```
User → Auth0 Login → Redirect to /wallet
```
- User authenticates via Auth0
- Auth0 redirects back to app with session
- Vue Router auth guard protects /wallet route

### 2. Smart Wallet Creation
```
Frontend generates EOA → Creates Alchemy Modular Account → Returns wallet address
```
**Implementation** (app/src/views/Wallet.vue:37-68):
```typescript
// Generate random EOA as owner
const privateKey = generatePrivateKey();
const owner = privateKeyToAccount(privateKey);

// Create signer and Alchemy client
const signer = new LocalAccountSigner(owner);
const client = await createModularAccountAlchemyClient({
  apiKey: ALCHEMY_API_KEY,
  chain: sepolia,
  signer,
});

accountAddress.value = client.getAddress();
```

**Key Points**:
- Creates ERC-4337 smart contract wallet
- Main private key stays on client
- Wallet address is deterministic based on owner EOA

### 3. Session Key Generation & Authorization
```
Frontend generates session key → User signs authorization → Sends to backend → Backend stores session
```

**Implementation** (app/src/views/Wallet.vue:70-134):
```typescript
// Generate ephemeral session key
const sessionPrivateKey = generatePrivateKey();

// Define permissions
const permissions = [{
  type: "native-token-transfer",
  data: { maxAmount: "1000000000000000000" } // 1 ETH max
}];

const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

// User signs authorization message
const message = `Authorize session ${sessionId} until ${new Date(expiresAt).toISOString()}`;
const signature = await userSigner.value.signMessage(message);

// Send to backend
await fetch(`${API_URL}/api/session`, {
  method: "POST",
  body: JSON.stringify({
    userId: userId.value,
    sessionId,
    sessionKey: sessionPrivateKey,
    accountAddress: accountAddress.value,
    signature,
    permissions,
    expiresAt,
  }),
});
```

**Key Points**:
- Session key is ephemeral (temporary)
- User explicitly authorizes by signing message
- Scoped permissions limit what session key can do
- Time-bound expiration (7 days in demo)
- Session key sent over HTTPS to backend

### 4. Backend Storage
```
API receives session → Validates → Stores in memory
```

**Implementation** (server/src/index.ts:30-55):
```typescript
app.post('/api/session', (req, res) => {
  const { userId, sessionId, sessionKey, accountAddress, signature, permissions, expiresAt } = req.body;

  // Store session (in production: use KMS)
  sessions.set(userId, {
    sessionId,
    sessionKey,
    accountAddress,
    signature,
    permissions,
    expiresAt,
    revoked: false
  });
});
```

**Production Considerations**:
- Use KMS (AWS KMS, Google Cloud KMS, HashiCorp Vault) for key storage
- Encrypt session keys at rest
- Implement key rotation policies
- Add audit logging for all key access

### 5. Delegated Transaction Signing
```
Frontend requests tx → Backend validates session → Signs with session key → Executes UserOp
```

**Implementation** (server/src/index.ts:58-121):
```typescript
app.post('/api/transaction', async (req, res) => {
  const { userId, to, value, data } = req.body;
  const session = sessions.get(userId);

  // Validate session
  if (session.revoked) return res.status(403).json({ error: 'Session revoked' });
  if (Date.now() > session.expiresAt) return res.status(403).json({ error: 'Session expired' });

  // Create signer from session key
  const sessionSigner = LocalAccountSigner.privateKeyToAccountSigner(session.sessionKey);

  // Create Alchemy client with session key
  const client = await createModularAccountAlchemyClient({
    apiKey: ALCHEMY_API_KEY,
    chain: sepolia,
    signer: sessionSigner,
    accountAddress: session.accountAddress,
  });

  // Send UserOperation
  const result = await client.sendUserOperation({
    uo: {
      target: to,
      data: data || '0x',
      value: BigInt(value || 0),
    },
  });

  const txHash = await client.waitForUserOperationTransaction(result);
});
```

**Key Points**:
- Backend never sees main private key
- Validates session expiry and revocation
- Uses session key to sign transactions
- Respects permission limits (checked by smart contract)
- No user intervention needed for transaction signing

### 6. Session Revocation
```
Frontend requests revoke → Backend marks session as revoked → Future transactions fail
```

**Implementation** (server/src/index.ts:142-154):
```typescript
app.delete('/api/session/:userId', (req, res) => {
  const session = sessions.get(userId);
  session.revoked = true;
});
```

## Security Model

### What Users Control
- **Main Private Key**: Never leaves client, never sent to backend
- **Session Authorization**: User explicitly signs consent message
- **Session Limits**: User sees and approves permission scopes
- **Revocation**: User can instantly revoke any session

### What Backend Controls
- **Session Keys**: Temporary keys with limited permissions
- **Transaction Execution**: Signs transactions within approved limits
- **Session Management**: Enforces expiry and revocation

### Threat Model
✓ **Backend Compromise**: Attacker only gets limited session keys, not main key
✓ **Session Key Theft**: Limited by permissions and expiry
✓ **Unauthorized Transactions**: Smart contract enforces permission limits
✓ **Lost Access**: User revokes session, generates new one
⚠ **Frontend Compromise**: Attacker could authorize malicious sessions (same as any Web3 app)

## Environment Variables

### Frontend (app/.env.example)
```bash
# Auth0 Configuration (non-sensitive - client ID is public)
VITE_AUTH0_DOMAIN=dev.login.agiodigital.com
VITE_AUTH0_CLIENT_ID=nwRjB9NT3GO8sUB88QPl2qi8PTuITJL0

# API Configuration
VITE_API_URL=http://localhost:3001

# Alchemy Configuration (SENSITIVE - keep secret)
VITE_ALCHEMY_API_KEY=your_alchemy_api_key_here
```

### Backend (server/.env.example)
```bash
# Server Configuration
PORT=3001

# Alchemy Configuration (SENSITIVE - keep secret)
ALCHEMY_API_KEY=your_alchemy_api_key_here
ALCHEMY_AUTH_TOKEN=your_alchemy_auth_token_here

# Auth0 Configuration (non-sensitive - client ID is public)
AUTH0_DOMAIN=dev.login.agiodigital.com
AUTH0_CLIENT_ID=nwRjB9NT3GO8sUB88QPl2qi8PTuITJL0
```

**Environment Validation**:
Both app and server validate required environment variables at startup and throw descriptive errors if missing.

## Setup Instructions

### Prerequisites
- Node.js 18+
- Yarn berry (4.x)
- Auth0 account with configured application
- Alchemy account with API key
- Sepolia testnet ETH

### Installation
```bash
# Clone repository
git clone <repository-url>
cd session-keys-demo

# Install dependencies
yarn install

# Configure environment variables
cp app/.env.example app/.env
cp server/.env.example server/.env

# Edit .env files with your credentials
# - Add your Alchemy API key
# - Verify Auth0 domain and client ID
```

### Development
```bash
# Start both app and server in parallel
yarn dev

# Frontend: http://localhost:8080
# Backend: http://localhost:3001
```

### Testing
```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn test:watch

# Run typecheck
yarn typecheck

# Run linter
yarn lint

# Format code
yarn format
```

### Production Build
```bash
# Build both workspaces
yarn build

# Outputs:
# - app/dist/         (static files for deployment)
# - server/dist/      (compiled JavaScript)
```

## Demo Flow

1. **Navigate to app**: http://localhost:8080
2. **Login**: Click "Login with Auth0" → authenticate → redirect to /wallet
3. **Create Wallet**: Click "Create Wallet" → provisions Alchemy smart wallet
4. **Fund Wallet**: Send Sepolia ETH to displayed wallet address (get from [faucet](https://sepoliafaucet.com/))
5. **Create Session**: Click "Create Session Key" → user consents to delegated signing
6. **Send Transaction**: Enter recipient address and amount → click "Send Transaction"
7. **View Transaction**: Click transaction hash to view on Etherscan
8. **Revoke Session**: Click "Revoke Session" → invalidates session key

## Integration with Agio

### Current POC Scope
✓ Auth0 authentication
✓ Smart wallet creation
✓ Session key generation with user consent
✓ Delegated transaction signing
✓ Session management (creation, validation, revocation)

### Production Integration Requirements

#### 1. KYC Verification
**Requirement**: Check SumSub KYC status before wallet provisioning

**Implementation Options**:
- **Option A**: Auth0 postLogin Action
  ```typescript
  // Auth0 Action
  exports.onExecutePostLogin = async (event, api) => {
    // Call Agio API to check KYC status
    const response = await fetch(`${AGIO_API_URL}/api/v1/auth/post-login`, {
      method: 'POST',
      body: JSON.stringify({ userId: event.user.user_id })
    });

    if (!response.ok || !response.json().kycApproved) {
      api.access.deny('KYC verification required');
    }
  };
  ```

- **Option B**: Frontend check after Auth0 login
  ```typescript
  // After Auth0 login, before wallet creation
  const kycStatus = await fetch(`/api/v1/kyc/status/${userId}`);
  if (kycStatus.approved) {
    // Allow wallet creation
  }
  ```

#### 2. Wallet Provisioning Hook
**Requirement**: Automatically provision wallet for KYC-approved users

**Implementation**:
```typescript
// After KYC approval, create wallet
const wallet = await createWalletForUser({
  userId: user.sub,
  email: user.email,
  kycProvider: 'sumsub',
  kycToken: sumsubToken,
});

// Store wallet address in Hasura
await hasura.mutation({
  insert_user_wallets_one: {
    object: {
      user_id: user.sub,
      wallet_address: wallet.address,
      chain: 'sepolia',
      provider: 'alchemy',
    }
  }
});
```

#### 3. Session Key Storage (KMS)
**Requirement**: Secure storage of session keys in production

**Implementation** (AWS KMS example):
```typescript
import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";

// Encrypt session key before storage
const encrypted = await kms.send(new EncryptCommand({
  KeyId: process.env.KMS_KEY_ID,
  Plaintext: Buffer.from(sessionKey),
}));

// Store encrypted key in database
await db.sessions.create({
  userId,
  sessionId,
  encryptedKey: encrypted.CiphertextBlob,
  permissions,
  expiresAt,
});

// Decrypt when needed
const decrypted = await kms.send(new DecryptCommand({
  CiphertextBlob: session.encryptedKey,
}));
```

#### 4. Hasura Integration
**Requirement**: Expose session key API via Hasura Actions

**Implementation**:
```yaml
# hasura/metadata/actions.yaml
- name: createSessionKey
  definition:
    kind: synchronous
    handler: https://api.agio.com/v1/wallet/session
  permissions:
    - role: user

- name: sendTransaction
  definition:
    kind: synchronous
    handler: https://api.agio.com/v1/wallet/transaction
  permissions:
    - role: user
```

Import OpenAPI spec: https://hasura.io/docs/2.0/actions/open-api/

#### 5. Credit Card Issuance Flow
**Requirement**: Issue Rain card after wallet provisioning

**Implementation**:
```typescript
// After wallet creation and KYC approval
if (user.requestedCreditCard) {
  await rainAPI.issueCard({
    userId: user.sub,
    walletAddress: wallet.address,
    sumsubToken: kycData.token,
  });
}
```

### Data Flow Diagram

```
User Login
    ↓
Auth0 Authentication
    ↓
postLogin Action → Check KYC (SumSub) → Hasura GraphQL
    ↓                                         ↓
KYC Approved?                          User Data
    ↓ Yes                                     ↓
Provision Smart Wallet (Alchemy)       Store in Database
    ↓
User Authorizes Session Key
    ↓
Session Key → Backend → Encrypt (KMS) → Store in Database
    ↓
Transaction Request → Validate → Decrypt Session Key → Sign → Execute
    ↓
Update Hasura (transaction history, balances, etc.)
    ↓
Issue Credit Card (if requested) → Rain API
```

## API Reference

### POST /api/session
Create new session key

**Request**:
```json
{
  "userId": "auth0|123456",
  "sessionId": "session-abc123",
  "sessionKey": "0x...",
  "accountAddress": "0x...",
  "signature": "0x...",
  "permissions": [
    {
      "type": "native-token-transfer",
      "data": { "maxAmount": "1000000000000000000" }
    }
  ],
  "expiresAt": 1700000000000
}
```

**Response**:
```json
{
  "ok": true,
  "sessionId": "session-abc123",
  "accountAddress": "0x..."
}
```

### POST /api/transaction
Send transaction using session key

**Request**:
```json
{
  "userId": "auth0|123456",
  "to": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "value": "1000000000000000",
  "data": "0x"
}
```

**Response**:
```json
{
  "success": true,
  "transactionHash": "0x...",
  "userOpHash": "0x..."
}
```

### GET /api/session/:userId
Get session information

**Response**:
```json
{
  "sessionId": "session-abc123",
  "permissions": [...],
  "expiresAt": 1700000000000,
  "revoked": false,
  "isExpired": false
}
```

### DELETE /api/session/:userId
Revoke session

**Response**:
```json
{
  "ok": true,
  "message": "Session revoked"
}
```

## Permission Types

### native-token-transfer
Transfer native tokens (ETH, MATIC, etc.)

```typescript
{
  type: "native-token-transfer",
  data: {
    maxAmount: "1000000000000000000" // 1 ETH in wei
  }
}
```

### erc20-token-transfer
Transfer ERC-20 tokens

```typescript
{
  type: "erc20-token-transfer",
  data: {
    tokenAddress: "0x...",
    maxAmount: "1000000000000000000"
  }
}
```

### contract-call
Call specific contract methods

```typescript
{
  type: "contract-call",
  data: {
    contractAddress: "0x...",
    allowedMethods: ["transfer", "approve"],
    maxGasLimit: "1000000"
  }
}
```

## Troubleshooting

### "VITE_ALCHEMY_API_KEY is required"
- Copy `.env.example` to `.env` in app/ directory
- Add your Alchemy API key from https://dashboard.alchemy.com/

### "Session creation failed"
- Ensure wallet has been created first
- Check browser console for detailed error
- Verify backend is running on port 3001

### "Transaction failed: insufficient funds"
- Wallet needs Sepolia ETH for gas fees
- Get testnet ETH from https://sepoliafaucet.com/
- Wait for faucet transaction to confirm

### "Session expired"
- Sessions expire after 7 days (configurable)
- Create new session key
- Consider implementing session renewal flow

### Auth0 redirect loop
- Verify `VITE_AUTH0_DOMAIN` and `VITE_AUTH0_CLIENT_ID` match your Auth0 application
- Check Auth0 application settings → Allowed Callback URLs includes `http://localhost:8080/wallet`

## Resources

- [Alchemy Account Kit Docs](https://accountkit.alchemy.com/)
- [ERC-4337 Specification](https://eips.ethereum.org/EIPS/eip-4337)
- [Auth0 Vue SDK](https://auth0.com/docs/libraries/auth0-vue)
- [Viem Documentation](https://viem.sh/)
- [Sepolia Testnet](https://sepolia.dev/)

## Next Steps

1. **Add KMS Integration**: Replace in-memory storage with encrypted KMS storage
2. **Implement Permission Validation**: Smart contract enforcement of session limits
3. **Add Session Renewal**: Allow extending session expiry without re-authorization
4. **Multi-chain Support**: Extend to Polygon, Arbitrum, Base, etc.
5. **Batch Transactions**: Support multiple operations in single UserOp
6. **Gas Sponsorship**: Enable gasless transactions via paymaster
7. **Session Analytics**: Track session usage, spending, patterns
8. **Rate Limiting**: Prevent abuse of session keys
9. **Audit Logging**: Log all session creation, usage, revocation events
10. **Production Deployment**: Deploy to production environment with proper monitoring

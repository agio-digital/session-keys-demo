# Session Keys Integration Guide

This guide provides code samples for integrating Alchemy Session Keys using the `agio-smart-wallet` SDK packages. The architecture enables delegated transaction signing using ERC-4337 smart contract wallets.

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              AUTHENTICATION                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Auth0 (Primary)              Alchemy WebSigner (Secondary)                 │
│  - User login/logout          - Wallet ownership                            │
│  - JWT tokens for API         - Signs session authorizations                │
│  - Identity provider          - Managed by Alchemy cloud                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              SESSION KEYS                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│  Client generates ephemeral key → User signs authorization → Server stores  │
│  - Configurable expiry (1h to never)                                        │
│  - Scoped permissions (root, token transfers, contract calls)               │
│  - Instant revocation                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           TRANSACTION SIGNING                                │
├─────────────────────────────────────────────────────────────────────────────┤
│  Two methods:                                                                │
│  1. Session Key (server-side) - Delegated, no user interaction              │
│  2. Direct (client-side) - Requires user's Alchemy WebSigner                │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Package Architecture

The SDK is split into three packages:

| Package | Description | Use In |
|---------|-------------|--------|
| `agio-smart-wallet-core` | Shared types, constants, utilities | Both |
| `agio-smart-wallet-client` | Client-side SDK (`SmartWalletClient`) | Frontend |
| `agio-smart-wallet-server` | Server-side SDK (`SmartWalletService`) | Backend |

## Installation

### Frontend

```bash
npm install agio-smart-wallet-client @account-kit/signer
# or
yarn add agio-smart-wallet-client @account-kit/signer
```

### Backend

```bash
npm install agio-smart-wallet-server jose
# or
yarn add agio-smart-wallet-server jose
```

## Environment Variables

### Frontend

```env
VITE_ALCHEMY_API_KEY=your-alchemy-api-key
VITE_ALCHEMY_GAS_POLICY_ID=your-gas-policy-id
VITE_AUTH0_DOMAIN=your-auth0-domain
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
VITE_API_URL=https://your-api-url
```

### Backend

```env
ALCHEMY_API_KEY=your-alchemy-api-key
ALCHEMY_GAS_POLICY_ID=your-gas-policy-id
AUTH0_DOMAIN=your-auth0-domain
```

> **Note:** `ALCHEMY_GAS_POLICY_ID` is required in **both** client and server. The client needs it for wallet creation and direct transactions. The server needs it for session key transactions.

---

## Client-Side Integration

### Step 1: Initialize SmartWalletClient

```typescript
import { SmartWalletClient } from "agio-smart-wallet-client";
import { sepolia } from "viem/chains";

const walletClient = new SmartWalletClient({
  alchemyApiKey: import.meta.env.VITE_ALCHEMY_API_KEY,
  policyId: import.meta.env.VITE_ALCHEMY_GAS_POLICY_ID,
  chain: sepolia,
});
```

### Step 2: Initialize Alchemy WebSigner

The Alchemy WebSigner handles wallet authentication via Auth0 SSO.

```typescript
import { AlchemyWebSigner } from "@account-kit/signer";

// Create iframe container for Alchemy signer
let iframeContainer = document.getElementById("alchemy-signer-iframe-container");
if (!iframeContainer) {
  iframeContainer = document.createElement("div");
  iframeContainer.id = "alchemy-signer-iframe-container";
  iframeContainer.style.display = "none";
  document.body.appendChild(iframeContainer);
}

const signer = new AlchemyWebSigner({
  client: {
    connection: { apiKey: import.meta.env.VITE_ALCHEMY_API_KEY },
    iframeConfig: { iframeContainerId: "alchemy-signer-iframe-container" },
  },
});

// Authenticate with Auth0
await signer.authenticate({
  type: "oauth",
  authProviderId: "auth0",
  isCustomProvider: false,
  mode: "redirect",
  redirectUrl: window.location.href,
});
```

### Step 3: Create Smart Wallet

```typescript
// Create wallet (counterfactual until first transaction)
const accountAddress = await walletClient.createWallet(signer);

// Save to backend
await http.post("/api/wallet", { accountAddress });
```

### Step 4: Create Session Key

```typescript
import { EXPIRY_PRESETS } from "agio-smart-wallet-client";

// Create session with 24-hour expiry
const session = await walletClient.createSession(signer, accountAddress, {
  expiryHours: EXPIRY_PRESETS["24h"], // 24
  permissions: [{ type: "root" }],    // Full access (use scoped in production)
});

// Store session on server
await http.post("/api/session", {
  sessionId: session.sessionId,
  sessionKey: session.sessionKey,
  sessionKeyAddress: session.sessionKeyAddress,
  accountAddress,
  signature: session.signature,
  permissionsContext: session.permissionsContext,
  permissions: session.permissions,
  expiresAt: session.expiresAt,
});
```

### Step 5: Send Direct Transaction (Optional)

Send transactions directly with the user's signer (bypasses session keys):

```typescript
const txHash = await walletClient.sendDirectTransaction(signer, {
  to: "0x...",
  value: "0.01", // ETH as string
  data: "0x",    // Optional calldata
});
```

### Step 6: Request Server Transaction

Request the server to send a transaction using the stored session key:

```typescript
const result = await http.post("/api/transaction", {
  to: "0x...",
  value: "10000000000000000", // Wei as string
  data: "0x",
});

console.log("Transaction hash:", result.transactionHash);
```

### Step 7: Revoke Session

```typescript
await http.delete("/api/session");
```

---

## Server-Side Integration

### Step 1: Initialize SmartWalletService

```typescript
import { SmartWalletService, InMemoryStorage } from "agio-smart-wallet-server";
import { sepolia } from "viem/chains";

// Use InMemoryStorage for development (use database in production)
const storage = new InMemoryStorage();

const walletService = new SmartWalletService({
  alchemyApiKey: process.env.ALCHEMY_API_KEY!,
  policyId: process.env.ALCHEMY_GAS_POLICY_ID!,
  chain: sepolia,
  sessionStorage: storage,
  walletStorage: storage,
});
```

### Step 2: JWT Authentication Middleware

```typescript
import { Request, Response, NextFunction } from "express";
import { createRemoteJWKSet, jwtVerify, JWTPayload, JWTVerifyGetKey } from "jose";

let jwks: JWTVerifyGetKey | null = null;

function getJWKS(): JWTVerifyGetKey | null {
  if (jwks) return jwks;
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
  if (!AUTH0_DOMAIN) return null;
  jwks = createRemoteJWKSet(new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`));
  return jwks;
}

export interface AuthRequest extends Request {
  auth?: { sub: string; email?: string; payload: JWTPayload };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  const JWKS = getJWKS();

  if (!JWKS) {
    return res.status(500).json({ error: "Auth not configured" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${process.env.AUTH0_DOMAIN}/`,
    });

    if (!payload.sub) {
      return res.status(401).json({ error: "Invalid token: missing sub claim" });
    }

    req.auth = {
      sub: payload.sub,
      email: payload.email as string | undefined,
      payload,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

### Step 3: API Endpoints

```typescript
import express from "express";
import type { Address, Hex } from "viem";

const app = express();
app.use(express.json());

// Save wallet
app.post("/api/wallet", requireAuth, async (req: AuthRequest, res) => {
  const { accountAddress } = req.body;
  const userId = req.auth!.sub;

  await walletService.saveWallet(userId, accountAddress as Address);
  res.json({ ok: true, accountAddress });
});

// Get wallet
app.get("/api/wallet", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const wallet = await walletService.getWallet(userId);

  if (!wallet) {
    return res.status(404).json({ error: "Wallet not found" });
  }
  res.json(wallet);
});

// Store session
app.post("/api/session", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const {
    sessionId,
    sessionKey,
    sessionKeyAddress,
    accountAddress,
    signature,
    permissionsContext,
    permissions,
    expiresAt,
  } = req.body;

  try {
    await walletService.storeSession(userId, {
      sessionId,
      sessionKey: sessionKey as Hex,
      sessionKeyAddress: sessionKeyAddress as Address,
      accountAddress: accountAddress as Address,
      signature: signature as Hex,
      permissionsContext: permissionsContext as Hex,
      permissions,
      expiresAt,
    });
    res.json({ ok: true, sessionId });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Get session
app.get("/api/session", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const session = await walletService.getSession(userId);

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  // Return public info only (exclude sessionKey)
  res.json({
    sessionId: session.sessionId,
    permissions: session.permissions,
    expiresAt: session.expiresAt,
    revoked: session.revoked,
  });
});

// Revoke session
app.delete("/api/session", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  await walletService.revokeSession(userId);
  res.json({ ok: true, message: "Session revoked" });
});

// Send transaction with session key
app.post("/api/transaction", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const { to, value, data } = req.body;

  try {
    const result = await walletService.sendTransaction(userId, {
      to: to as Address,
      value,
      data: data as Hex,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
```

---

## Custom Storage Implementation

For production, implement the storage interfaces with your database:

```typescript
import type { SessionStorage, WalletStorage, SessionData, WalletData } from "agio-smart-wallet-server";
import { Pool } from "pg"; // or your database client

export class PostgresStorage implements SessionStorage, WalletStorage {
  constructor(private pool: Pool) {}

  async saveSession(userId: string, session: SessionData): Promise<void> {
    await this.pool.query(
      `INSERT INTO sessions (user_id, session_id, session_key, account_address, permissions_context, permissions, expires_at, revoked)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (user_id) DO UPDATE SET
         session_id = $2, session_key = $3, permissions_context = $5, expires_at = $7, revoked = $8`,
      [
        userId,
        session.sessionId,
        session.sessionKey, // Encrypt in production!
        session.accountAddress,
        session.permissionsContext,
        JSON.stringify(session.permissions),
        session.expiresAt,
        session.revoked,
      ]
    );
  }

  async getSession(userId: string): Promise<SessionData | null> {
    const result = await this.pool.query(
      "SELECT * FROM sessions WHERE user_id = $1",
      [userId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return {
      sessionId: row.session_id,
      sessionKey: row.session_key, // Decrypt in production!
      sessionKeyAddress: row.session_key_address,
      accountAddress: row.account_address,
      signature: row.signature,
      permissionsContext: row.permissions_context,
      permissions: JSON.parse(row.permissions),
      expiresAt: row.expires_at,
      revoked: row.revoked,
    };
  }

  async revokeSession(userId: string): Promise<void> {
    await this.pool.query(
      "UPDATE sessions SET revoked = true WHERE user_id = $1",
      [userId]
    );
  }

  async saveWallet(userId: string, wallet: WalletData): Promise<void> {
    await this.pool.query(
      `INSERT INTO wallets (user_id, account_address, created_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET account_address = $2`,
      [userId, wallet.accountAddress, wallet.createdAt]
    );
  }

  async getWallet(userId: string): Promise<WalletData | null> {
    const result = await this.pool.query(
      "SELECT * FROM wallets WHERE user_id = $1",
      [userId]
    );
    if (result.rows.length === 0) return null;
    return {
      accountAddress: result.rows[0].account_address,
      createdAt: result.rows[0].created_at,
    };
  }
}
```

---

## Permission Types

```typescript
import type { Permission } from "agio-smart-wallet-core";

// Full access (use only for testing)
const rootPermissions: Permission[] = [{ type: "root" }];

// Native token transfer with limit
const nativeTransferPermissions: Permission[] = [
  {
    type: "native-token-transfer",
    data: { maxAmount: "1000000000000000000" }, // 1 ETH in wei
  },
];

// ERC-20 token transfer
const erc20Permissions: Permission[] = [
  {
    type: "erc20-token-transfer",
    data: {
      token: "0x...", // Token contract address
      maxAmount: "1000000000000000000",
    },
  },
];

// Specific contract calls
const contractCallPermissions: Permission[] = [
  {
    type: "contract-call",
    data: {
      address: "0x...", // Contract address
      functions: ["0x..."], // Optional function selectors
    },
  },
];
```

---

## Expiry Presets

The SDK provides built-in expiry presets:

```typescript
import { EXPIRY_PRESETS, formatExpiry } from "agio-smart-wallet-client";

// Available presets (hours)
EXPIRY_PRESETS["1h"];    // 1
EXPIRY_PRESETS["6h"];    // 6
EXPIRY_PRESETS["24h"];   // 24
EXPIRY_PRESETS["7d"];    // 168
EXPIRY_PRESETS["30d"];   // 720
EXPIRY_PRESETS["1y"];    // 8760
EXPIRY_PRESETS["never"]; // 0 (max uint32, ~year 2106)

// Format for display
formatExpiry(session.expiresAt); // "24h", "7d", "Never", etc.
```

---

## Multiple Session Keys

A wallet can have **multiple active session keys** simultaneously. Each `createSession()` call creates an independent session. Use cases:

- **Short-lived sessions**: 5-minute session for an immediate transaction
- **Long-lived sessions**: "Never expires" session for a trading bot
- **Scoped sessions**: Different sessions for different services

For multiple sessions, modify storage to use composite keys:

```typescript
// Storage with multi-session support
async saveSession(userId: string, session: SessionData): Promise<void> {
  const key = `${userId}:${session.sessionId}`;
  this.sessions.set(key, session);
}

async getSession(userId: string, sessionId?: string): Promise<SessionData | null> {
  if (sessionId) {
    return this.sessions.get(`${userId}:${sessionId}`) ?? null;
  }
  // Return first active session for user
  for (const [key, session] of this.sessions) {
    if (key.startsWith(userId) && !session.revoked) {
      return session;
    }
  }
  return null;
}
```

---

## Multi-Account Support

Users can have multiple smart wallets using the `accountId` option:

```typescript
// Client: Create multiple wallets
const wallet1 = await walletClient.createWallet(signer); // Default
const wallet2 = await walletClient.createWallet(signer, { accountId: "trading" });
const wallet3 = await walletClient.createWallet(signer, { accountId: "savings" });

// Client: Create session for specific wallet
const session = await walletClient.createSession(signer, wallet2, {
  accountId: "trading",
  expiryHours: 24,
});

// Server: Store/retrieve with accountId
await walletService.saveWallet(userId, wallet2, "trading");
const wallet = await walletService.getWallet(userId, "trading");
```

---

## API Endpoints Summary

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | /api/wallet | JWT | Save wallet address |
| GET | /api/wallet | JWT | Get wallet info |
| POST | /api/session | JWT | Create session with key |
| GET | /api/session | JWT | Get session status |
| DELETE | /api/session | JWT | Revoke session |
| POST | /api/transaction | JWT | Execute transaction |

---

## Utility Functions

The SDK exports helpful utilities:

```typescript
import {
  validateSession,
  isSessionActive,
  calculateExpiry,
  extractSessionId,
  extractSignature,
  formatExpiry,
  MAX_EXPIRY_MS,
  MAX_EXPIRY_SEC,
} from "agio-smart-wallet-client"; // or agio-smart-wallet-server

// Validate session
const validation = validateSession(session);
if (!validation.valid) {
  console.log("Invalid:", validation.reason); // "not_found" | "revoked" | "expired"
}

// Quick check
if (isSessionActive(session)) {
  // Session is valid
}

// Calculate expiry from options
const expiresAt = calculateExpiry({ expiryHours: 24 });

// Extract from permissions context
const sessionId = extractSessionId(permissionsContext);
const signature = extractSignature(permissionsContext);

// Format for display
const display = formatExpiry(expiresAt); // "24h", "7d", "Never"
```

---

## Transaction Flow Comparison

### Session Key Transaction (Delegated)

```
Client                    Server                    Alchemy/Chain
  │                         │                           │
  │── POST /api/transaction ─▶│                           │
  │   { to, value }          │                           │
  │                         │── sendTransaction() ─────▶│
  │                         │   (validates session,      │
  │                         │    signs with session key) │
  │                         │◀── txHash ────────────────│
  │◀── { transactionHash } ──│                           │
```

### Direct Transaction (User Signs)

```
Client                          Alchemy/Chain
  │                                  │
  │── sendDirectTransaction() ──────▶│
  │   (user's WebSigner signs)       │
  │◀── txHash ───────────────────────│
```

---

## HTTP Client with Auth Token

Utility to automatically inject Auth0 JWT tokens:

```typescript
// utils/http.ts
const API_URL = import.meta.env.VITE_API_URL || "";

let getAccessToken: (() => Promise<string>) | null = null;

export function initHttp(tokenGetter: () => Promise<string>) {
  getAccessToken = tokenGetter;
}

export async function http<T = unknown>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);

  if (!headers.has("Content-Type") && options.body) {
    headers.set("Content-Type", "application/json");
  }

  if (getAccessToken) {
    try {
      const token = await getAccessToken();
      headers.set("Authorization", `Bearer ${token}`);
    } catch (err) {
      console.warn("Could not get access token", err);
    }
  }

  const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    throw new Error(errorData.message || errorData.error || `HTTP ${response.status}`);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

http.get = <T>(endpoint: string) => http<T>(endpoint, { method: "GET" });
http.post = <T>(endpoint: string, body: unknown) =>
  http<T>(endpoint, { method: "POST", body: JSON.stringify(body) });
http.delete = <T>(endpoint: string) => http<T>(endpoint, { method: "DELETE" });
```

Initialize in your app entry point:

```typescript
// main.ts
import { useAuth0 } from "@auth0/auth0-vue";
import { initHttp } from "./utils/http";

const { getAccessTokenSilently } = useAuth0();
initHttp(() => getAccessTokenSilently());
```

---

## Gas Sponsorship

All transactions are sponsored by Alchemy Gas Manager. The `policyId` is configured in both `SmartWalletClient` and `SmartWalletService`:

```typescript
// Client
const walletClient = new SmartWalletClient({
  alchemyApiKey: "...",
  policyId: "your-gas-policy-id", // Sponsors all gas fees
  chain: sepolia,
});

// Server
const walletService = new SmartWalletService({
  alchemyApiKey: "...",
  policyId: "your-gas-policy-id", // Sponsors all gas fees
  chain: sepolia,
  sessionStorage: storage,
  walletStorage: storage,
});
```

Users never need to fund their accounts - Alchemy pays gas fees within policy limits.

---

## Production Considerations

1. **Key Management**: Store session keys in AWS KMS, Google Cloud KMS, or HashiCorp Vault
2. **Database**: Use PostgreSQL/MongoDB instead of in-memory storage
3. **Permissions**: Use restrictive session permissions (spending limits, allowed contracts)
4. **Rate Limiting**: Add rate limits to transaction endpoints
5. **Monitoring**: Add logging, metrics, and alerting
6. **Network**: Switch from Sepolia testnet to mainnet
7. **Gas Policies**: Configure appropriate gas limits in Alchemy dashboard
8. **Encryption**: Encrypt session keys at rest in your database

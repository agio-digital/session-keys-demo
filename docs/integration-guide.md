# Session Keys Integration Guide

This guide provides code samples for integrating Alchemy Session Keys into an existing monorepo. The architecture enables delegated transaction signing using ERC-4337 smart contract wallets.

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
│  - 24-hour expiry                                                           │
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

## Dependencies

### Client (Frontend)

```json
{
  "@account-kit/wallet-client": "^0.0.1-alpha.4",
  "@account-kit/signer": "^4.31.0",
  "@account-kit/infra": "^4.31.0",
  "viem": "^2.31.3"
}
```

### Server (Backend)

```json
{
  "@account-kit/wallet-client": "^0.0.1-alpha.4",
  "@account-kit/infra": "^4.31.0",
  "@aa-sdk/core": "^4.31.0",
  "viem": "^2.31.3",
  "jose": "^6.0.11"
}
```

## Environment Variables

### Client

```env
VITE_ALCHEMY_API_KEY=your-alchemy-api-key
VITE_ALCHEMY_GAS_POLICY_ID=your-gas-policy-id
VITE_AUTH0_DOMAIN=your-auth0-domain
VITE_AUTH0_CLIENT_ID=your-auth0-client-id
VITE_API_URL=https://your-api-url
```

### Server

```env
ALCHEMY_API_KEY=your-alchemy-api-key
ALCHEMY_GAS_POLICY_ID=your-gas-policy-id
AUTH0_DOMAIN=your-auth0-domain
```

---

## Step 1: Initialize Alchemy WebSigner (Client)

The Alchemy WebSigner handles wallet authentication via Auth0 SSO.

```typescript
// composables/useAlchemySigner.ts
import { ref } from "vue";
import { AlchemyWebSigner, type User } from "@account-kit/signer";

const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;

// Singleton instance
let signer: AlchemyWebSigner | null = null;
let initPromise: Promise<AlchemyWebSigner> | null = null;

// Reactive state
const user = ref<User | null>(null);
const isAuthenticated = ref(false);
const isInitializing = ref(false);
const error = ref<string | null>(null);

export function useAlchemySigner() {
  async function initializeSigner(): Promise<AlchemyWebSigner> {
    // Return existing signer if already initialized
    if (signer) {
      const existingUser = signer.inner.getUser();
      if (existingUser) {
        user.value = existingUser;
        isAuthenticated.value = true;
      }
      return signer;
    }

    // Await existing initialization if in progress
    if (initPromise) {
      return initPromise;
    }

    // Start new initialization
    initPromise = doInitialize();
    try {
      return await initPromise;
    } catch (err) {
      initPromise = null;
      throw err;
    }
  }

  async function doInitialize(): Promise<AlchemyWebSigner> {
    try {
      isInitializing.value = true;
      error.value = null;

      // Create iframe container for Alchemy signer
      let iframeContainer = document.getElementById("alchemy-signer-iframe-container");
      if (!iframeContainer) {
        iframeContainer = document.createElement("div");
        iframeContainer.id = "alchemy-signer-iframe-container";
        iframeContainer.style.display = "none";
        document.body.appendChild(iframeContainer);
      }

      signer = new AlchemyWebSigner({
        client: {
          connection: { apiKey: ALCHEMY_API_KEY },
          iframeConfig: { iframeContainerId: "alchemy-signer-iframe-container" },
        },
      });

      // Listen for auth events
      signer.on("connected", (connectedUser) => {
        user.value = connectedUser;
        isAuthenticated.value = true;
      });

      signer.on("disconnected", () => {
        user.value = null;
        isAuthenticated.value = false;
      });

      // Check for existing user session
      const existingUser = signer.inner.getUser();
      if (existingUser) {
        user.value = existingUser;
        isAuthenticated.value = true;
      }

      // Handle OAuth callback or prepare for OAuth
      const url = new URL(window.location.href);
      const hasAlchemyCallback =
        url.searchParams.has("alchemy-bundle") ||
        url.searchParams.has("alchemy-status") ||
        url.searchParams.has("alchemy-error");

      if (!existingUser && !hasAlchemyCallback) {
        // Prepare OAuth popup (non-fatal if fails)
        try {
          await signer.preparePopupOauth();
        } catch (prepareErr) {
          console.warn("[Signer] preparePopupOauth failed (non-fatal)", prepareErr);
        }
      } else if (hasAlchemyCallback && !existingUser) {
        // Handle OAuth error
        const oauthError = url.searchParams.get("alchemy-error");
        if (oauthError) {
          error.value = `Wallet connection failed: ${oauthError}`;
          // Clean up URL params
          url.searchParams.delete("alchemy-error");
          url.searchParams.delete("alchemy-bundle");
          url.searchParams.delete("alchemy-status");
          window.history.replaceState({}, "", url.toString());
        } else {
          // Wait for callback to complete
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("OAuth callback timeout")), 10000);
            signer!.on("connected", () => {
              clearTimeout(timeout);
              resolve();
            });
          });
        }
      }

      return signer;
    } catch (err: any) {
      error.value = err.message;
      signer = null;
      throw err;
    } finally {
      isInitializing.value = false;
    }
  }

  async function loginWithAuth0(options?: { auth0Connection?: string; mode?: "popup" | "redirect" }) {
    if (!signer) await initializeSigner();

    const mode = options?.mode || "redirect";
    const baseParams = {
      type: "oauth" as const,
      authProviderId: "auth0" as const,
      isCustomProvider: false as const,
      ...(options?.auth0Connection && { auth0Connection: options.auth0Connection }),
    };

    const authParams =
      mode === "redirect"
        ? { ...baseParams, mode: "redirect" as const, redirectUrl: window.location.href }
        : { ...baseParams, mode: "popup" as const };

    const authenticatedUser = await signer!.authenticate(authParams);
    if (authenticatedUser) {
      user.value = authenticatedUser;
      isAuthenticated.value = true;
    }
    return authenticatedUser;
  }

  async function logout() {
    if (signer) {
      await signer.disconnect();
      user.value = null;
      isAuthenticated.value = false;
    }
  }

  return {
    signer: () => signer,
    user,
    isAuthenticated,
    isInitializing,
    error,
    initializeSigner,
    loginWithAuth0,
    logout,
  };
}
```

---

## Step 2: Create Smart Wallet (Client)

Create a smart contract wallet using Alchemy's Wallet API.

```typescript
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { sepolia, alchemy } from "@account-kit/infra";

const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const ALCHEMY_GAS_POLICY_ID = import.meta.env.VITE_ALCHEMY_GAS_POLICY_ID;

async function createWallet(alchemySigner: AlchemyWebSigner): Promise<string> {
  // Create smart wallet client
  const client = createSmartWalletClient({
    transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
    chain: sepolia,
    signer: alchemySigner,
    policyId: ALCHEMY_GAS_POLICY_ID,
  });

  // Request account (counterfactual until first transaction)
  const account = await client.requestAccount();
  const accountAddress = account.address;

  // Save to backend
  await http.post("/api/wallet", { accountAddress });

  return accountAddress;
}
```

---

## Step 3: Create Session Key (Client)

Generate an ephemeral session key and get user authorization.

```typescript
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { sepolia, alchemy } from "@account-kit/infra";

async function createSession(
  alchemySigner: AlchemyWebSigner,
  accountAddress: string
): Promise<{ sessionId: string }> {
  // 1. Generate ephemeral session key locally
  const sessionPrivateKey = generatePrivateKey();
  const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

  // 2. Set expiry (24 hours)
  const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
  const expirySec = Math.floor(expiresAt / 1000);

  // 3. Create smart wallet client
  const client = createSmartWalletClient({
    transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
    chain: sepolia,
    signer: alchemySigner,
    policyId: ALCHEMY_GAS_POLICY_ID,
  });

  // 4. Request account to associate signer
  const account = await client.requestAccount();

  // 5. Grant permissions (user signs authorization)
  const permissions = await client.grantPermissions({
    account: account.address,
    expirySec,
    key: {
      publicKey: sessionKeyAccount.address, // Address as "publicKey" for secp256k1
      type: "secp256k1",
    },
    permissions: [{ type: "root" }], // Full access (use scoped permissions in production)
  });

  // 6. Extract sessionId and signature from context
  // Context format: 0x00 + sessionId (16 bytes) + signature
  const sessionId = `0x${permissions.context.slice(4, 36)}`;
  const signature = `0x${permissions.context.slice(36)}`;

  // 7. Store session on server
  await http.post("/api/session", {
    sessionId,
    sessionKey: sessionPrivateKey,
    sessionKeyAddress: sessionKeyAccount.address,
    accountAddress,
    signature,
    permissionsContext: permissions.context,
    permissions: [{ type: "root" }],
    expiresAt,
  });

  return { sessionId };
}
```

### Permission Types

```typescript
// Full access (use only for testing)
const rootPermissions = [{ type: "root" }];

// Native token transfer with limit
const nativeTransferPermissions = [
  {
    type: "native-token-transfer",
    data: {
      maxAmount: "1000000000000000000", // 1 ETH in wei
    },
  },
];

// ERC-20 token transfer
const erc20Permissions = [
  {
    type: "erc20-token-transfer",
    data: {
      token: "0x...", // Token contract address
      maxAmount: "1000000000000000000",
    },
  },
];

// Specific contract calls
const contractCallPermissions = [
  {
    type: "contract-call",
    data: {
      address: "0x...", // Contract address
      // Optional: restrict to specific functions
    },
  },
];
```

---

## Step 4: JWT Authentication Middleware (Server)

Verify Auth0 JWT tokens on all API requests.

```typescript
// middleware/auth.ts
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
  auth?: {
    sub: string;
    email?: string;
    payload: JWTPayload;
  };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.slice(7);
  const JWKS = getJWKS();
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;

  if (!JWKS) {
    return res.status(500).json({ error: "Auth not configured" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
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
  } catch (err: any) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

---

## Step 5: Store Session (Server)

Store session keys securely (use KMS in production).

```typescript
// Types
type SessionData = {
  sessionId: string;
  sessionKey: string;
  sessionKeyAddress: string;
  accountAddress: string;
  signature: string;
  permissionsContext?: string;
  permissions: any[];
  expiresAt: number;
  revoked: boolean;
};

// In-memory storage (use database in production)
const sessions = new Map<string, SessionData>();

// API endpoint
app.post("/api/session", requireAuth, (req: AuthRequest, res) => {
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
  const userId = req.auth!.sub;

  if (!sessionId || !sessionKey || !accountAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Verify session key address matches derived address
  const derivedAddress = privateKeyToAccount(sessionKey as Hex).address;
  if (sessionKeyAddress && derivedAddress.toLowerCase() !== sessionKeyAddress.toLowerCase()) {
    return res.status(400).json({ error: "Session key address mismatch" });
  }

  // Store session
  sessions.set(userId, {
    sessionId,
    sessionKey,
    sessionKeyAddress: sessionKeyAddress || derivedAddress,
    accountAddress,
    signature,
    permissionsContext,
    permissions,
    expiresAt,
    revoked: false,
  });

  res.json({ ok: true, sessionId, accountAddress });
});
```

---

## Step 6: Send Transaction with Session Key (Server)

Execute transactions using stored session keys.

```typescript
import { createSmartWalletClient, signPreparedCalls } from "@account-kit/wallet-client";
import { LocalAccountSigner } from "@aa-sdk/core";
import { sepolia, alchemy } from "@account-kit/infra";
import { getAddress } from "viem";
import type { Hex } from "viem";

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;
const ALCHEMY_GAS_POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID!;

app.post("/api/transaction", requireAuth, async (req: AuthRequest, res) => {
  try {
    const { to, value, data } = req.body;
    const userId = req.auth!.sub;

    // 1. Get session
    const session = sessions.get(userId);
    if (!session) {
      return res.status(404).json({ error: "No session found" });
    }

    // 2. Validate session
    if (session.revoked) {
      return res.status(403).json({ error: "Session revoked" });
    }
    if (Date.now() > session.expiresAt) {
      return res.status(403).json({ error: "Session expired" });
    }

    // 3. Create session signer from stored key
    const sessionSigner = LocalAccountSigner.privateKeyToAccountSigner(session.sessionKey as Hex);

    // 4. Create smart wallet client
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
      chain: sepolia,
      signer: sessionSigner,
      policyId: ALCHEMY_GAS_POLICY_ID,
    });

    // 5. Get permissions context
    const context = session.permissionsContext;
    if (!context) {
      return res.status(400).json({ error: "No permissions context found" });
    }

    const permissions = { context: context as `0x${string}` };
    const valueHex = `0x${BigInt(value || 0).toString(16)}` as `0x${string}`;
    const checksummedTo = getAddress(to);

    // 6. Prepare transaction
    const preparedCalls = await client.prepareCalls({
      from: session.accountAddress as `0x${string}`,
      calls: [
        {
          to: checksummedTo as `0x${string}`,
          value: valueHex,
          data: (data || "0x") as `0x${string}`,
        },
      ],
      capabilities: {
        permissions,
        paymasterService: { policyId: ALCHEMY_GAS_POLICY_ID },
      },
    });

    // 7. Sign with session key
    const signedCalls = await signPreparedCalls(sessionSigner, preparedCalls);

    // 8. Send transaction
    const result = await client.sendPreparedCalls({
      ...signedCalls,
      capabilities: { permissions },
    } as any);

    // 9. Wait for confirmation
    const callId = result.preparedCallIds?.[0];
    let txHash = callId;

    if (callId) {
      try {
        const txResult = await client.waitForCallsStatus({ id: callId });
        txHash = txResult.receipts?.[0]?.transactionHash || callId;
      } catch (waitError) {
        // Transaction submitted but confirmation failed
      }
    }

    res.json({
      success: true,
      transactionHash: txHash,
    });
  } catch (error: any) {
    res.status(500).json({
      error: "Transaction failed",
      message: error.message,
    });
  }
});
```

---

## Step 7: Send Direct Transaction (Client)

Send transactions directly using the user's Alchemy WebSigner (no session key).

```typescript
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { sepolia, alchemy } from "@account-kit/infra";
import { parseEther, toHex } from "viem";

async function sendDirectTransaction(
  alchemySigner: AlchemyWebSigner,
  to: string,
  amount: string
): Promise<string> {
  // 1. Create client with user's signer
  const client = createSmartWalletClient({
    transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
    chain: sepolia,
    signer: alchemySigner,
    policyId: ALCHEMY_GAS_POLICY_ID,
  });

  // 2. Get account
  const account = await client.requestAccount();
  const valueHex = toHex(parseEther(amount));

  // 3. Prepare transaction
  const preparedCalls = await client.prepareCalls({
    from: account.address,
    calls: [
      {
        to: to as `0x${string}`,
        value: valueHex,
        data: "0x" as `0x${string}`,
      },
    ],
    capabilities: {
      paymasterService: { policyId: ALCHEMY_GAS_POLICY_ID },
    },
  });

  // 4. Sign with user's signer (requires user interaction in some cases)
  const signedCalls = await client.signPreparedCalls(preparedCalls);

  // 5. Send transaction
  const result = await client.sendPreparedCalls(signedCalls);

  // 6. Wait for confirmation
  const callId = result.preparedCallIds[0];
  if (callId) {
    const txResult = await client.waitForCallsStatus({ id: callId });
    return txResult.receipts?.[0]?.transactionHash || callId;
  }

  return callId || "";
}
```

---

## Step 8: Revoke Session (Client + Server)

### Client

```typescript
async function revokeSession(): Promise<void> {
  await http.delete("/api/session");
}
```

### Server

```typescript
app.delete("/api/session", requireAuth, (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const session = sessions.get(userId);

  if (!session) {
    return res.status(404).json({ error: "No session found" });
  }

  session.revoked = true;
  // Save to persistent storage

  res.json({ ok: true, message: "Session revoked" });
});
```

---

## HTTP Client with Auth Token (Client)

Utility to automatically inject Auth0 JWT tokens.

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

  // Add auth token
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
// main.ts or App.vue
import { useAuth0 } from "@auth0/auth0-vue";
import { initHttp } from "./utils/http";

const { getAccessTokenSilently } = useAuth0();
initHttp(() => getAccessTokenSilently());
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

## Data Structures

### Session (Server Storage)

```typescript
type SessionData = {
  sessionId: string;           // Unique session identifier
  sessionKey: string;          // Private key (store in KMS!)
  sessionKeyAddress: string;   // Derived address
  accountAddress: string;      // Smart wallet address
  signature: string;           // User's authorization signature
  permissionsContext: string;  // Full context for transaction signing
  permissions: Permission[];   // Scoped permissions
  expiresAt: number;          // Unix timestamp (ms)
  revoked: boolean;           // Revocation flag
};
```

### Wallet (Server Storage)

```typescript
type WalletData = {
  accountAddress: string;  // Smart wallet address
  createdAt: number;       // Unix timestamp (ms)
};
```

---

## Production Considerations

1. **Key Management**: Store session keys in AWS KMS, Google Cloud KMS, or HashiCorp Vault
2. **Database**: Use PostgreSQL/MongoDB instead of in-memory/file storage
3. **Permissions**: Implement restrictive session permissions (spending limits, allowed contracts)
4. **Rate Limiting**: Add rate limits to transaction endpoints
5. **Monitoring**: Add logging, metrics, and alerting
6. **Network**: Switch from Sepolia testnet to mainnet
7. **Gas Policies**: Configure appropriate gas limits in Alchemy dashboard

---

## Transaction Flow Comparison

### Session Key Transaction (Delegated)

```
Client                    Server                    Alchemy/Chain
  │                         │                           │
  │── POST /api/transaction ─▶│                           │
  │   { to, value }          │                           │
  │                         │── prepareCalls() ─────────▶│
  │                         │◀── preparedCalls ─────────│
  │                         │                           │
  │                         │── signPreparedCalls() ───▶│
  │                         │   (session key)           │
  │                         │                           │
  │                         │── sendPreparedCalls() ───▶│
  │                         │◀── txHash ────────────────│
  │◀── { transactionHash } ──│                           │
```

### Direct Transaction (User Signs)

```
Client                          Alchemy/Chain
  │                                  │
  │── createSmartWalletClient() ────▶│
  │◀── client ───────────────────────│
  │                                  │
  │── prepareCalls() ───────────────▶│
  │◀── preparedCalls ────────────────│
  │                                  │
  │── signPreparedCalls() ──────────▶│
  │   (user's WebSigner)             │
  │                                  │
  │── sendPreparedCalls() ──────────▶│
  │◀── txHash ───────────────────────│
```

---

## Gas Sponsorship

All transactions are sponsored by Alchemy Gas Manager. Configure `policyId` in both client and server:

```typescript
const client = createSmartWalletClient({
  transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
  chain: sepolia,
  signer,
  policyId: ALCHEMY_GAS_POLICY_ID, // Sponsors all gas fees
});
```

Users never need to fund their accounts - Alchemy pays gas fees within policy limits.

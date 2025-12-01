import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import https from "https";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import type { Hex } from "viem";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import pino from "pino";
import { createSmartWalletClient, signPreparedCalls } from "@account-kit/wallet-client";
import { LocalAccountSigner } from "@aa-sdk/core";
import { sepolia, alchemy } from "@account-kit/infra";

dotenv.config();

const logger = pino({
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
      translateTime: "HH:MM:ss",
      ignore: "pid,hostname",
    },
  },
});

const certsDir = path.resolve(process.cwd(), "certs");
const keyPath = path.join(certsDir, "key.pem");
const certPath = path.join(certsDir, "cert.pem");

if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
  execSync(`mkcert -key-file "${keyPath}" -cert-file "${certPath}" localhost`, {
    stdio: "pipe",
  });
}

// Validate required environment variables
const PORT = process.env.PORT;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_GAS_POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;

if (!PORT) {
  throw new Error("PORT is required in environment variables");
}

if (!ALCHEMY_API_KEY) {
  throw new Error("ALCHEMY_API_KEY is required in environment variables");
}

if (!ALCHEMY_GAS_POLICY_ID) {
  throw new Error("ALCHEMY_GAS_POLICY_ID is required in environment variables");
}

const app = express();

app.use(cors({
  origin: ["https://localhost:8080", "https://localhost:8081"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

const dataDir = path.resolve(process.cwd(), "data");
const sessionsFile = path.join(dataDir, "sessions.json");
const walletsFile = path.join(dataDir, "wallets.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

type SessionData = {
  sessionId: string;
  sessionKey: string;
  sessionKeyAddress: string; // Address registered with Alchemy
  accountAddress: string;
  signature: string;
  permissionsContext?: string; // Full context from SDK grantPermissions
  permissions: any[];
  expiresAt: number;
  revoked: boolean;
};

type WalletData = {
  accountAddress: string;
  createdAt: number;
};

const sessions = new Map<string, SessionData>();
const wallets = new Map<string, WalletData>();

function saveSessions() {
  const data = Object.fromEntries(sessions);
  fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2));
}

function loadSessions() {
  try {
    if (fs.existsSync(sessionsFile)) {
      const data = JSON.parse(fs.readFileSync(sessionsFile, "utf-8"));
      Object.entries(data).forEach(([userId, session]) => {
        sessions.set(userId, session as SessionData);
      });
      logger.info(`✓ Loaded ${sessions.size} sessions from disk`);
    }
  } catch (error) {
    logger.error({ error }, "Failed to load sessions from disk");
  }
}

function saveWallets() {
  const data = Object.fromEntries(wallets);
  fs.writeFileSync(walletsFile, JSON.stringify(data, null, 2));
}

function loadWallets() {
  try {
    if (fs.existsSync(walletsFile)) {
      const data = JSON.parse(fs.readFileSync(walletsFile, "utf-8"));
      Object.entries(data).forEach(([userId, wallet]) => {
        wallets.set(userId, wallet as WalletData);
      });
      logger.info(`✓ Loaded ${wallets.size} wallets from disk`);
    }
  } catch (error) {
    logger.error({ error }, "Failed to load wallets from disk");
  }
}

loadSessions();
loadWallets();

app.post("/api/wallet", (req, res) => {
  const { userId, accountAddress } = req.body;

  if (!userId || !accountAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  wallets.set(userId, {
    accountAddress,
    createdAt: Date.now(),
  });

  saveWallets();

  logger.info({ userId, accountAddress }, "✓ Wallet saved");

  res.json({ ok: true, accountAddress });
});

app.get("/api/wallet/:userId", (req, res) => {
  const { userId } = req.params;
  const wallet = wallets.get(userId);

  if (!wallet) {
    return res.status(404).json({ error: "No wallet found" });
  }

  res.json({
    accountAddress: wallet.accountAddress,
    createdAt: wallet.createdAt,
  });
});

// Create a session via Alchemy's Wallet API (wallet_createSession)
app.post("/api/wallet-session", async (req, res) => {
  try {
    const { account, chainId, publicKey, expirySec, permissions } = req.body;

    if (!account || !chainId || !publicKey || !expirySec) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    logger.info({ account }, "Creating wallet session");

    // Call Alchemy's wallet_createSession JSON-RPC
    const alchemyResponse = await fetch(
      `https://api.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "wallet_createSession",
          params: [{
            account,
            chainId: `0x${chainId.toString(16)}`,
            key: {
              publicKey,
              type: "secp256k1",
            },
            permissions: permissions || [{ type: "root" }],
            expirySec,
          }],
        }),
      }
    );

    const data = await alchemyResponse.json();

    if (data.error) {
      logger.error({ error: data.error }, "Alchemy wallet_createSession failed");
      return res.status(500).json({ error: data.error.message || "Session creation failed" });
    }

    logger.info({ sessionId: data.result.sessionId }, "✓ Wallet session created");

    res.json({
      sessionId: data.result.sessionId,
      signatureRequest: data.result.signatureRequest,
      context: data.result.context, // Pass through context if Alchemy provides it
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Wallet session creation failed");
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/session", (req, res) => {
  const { userId, sessionId, sessionKey, sessionKeyAddress, accountAddress, signature, permissionsContext, permissions, expiresAt } = req.body;

  if (!userId || !sessionId || !sessionKey || !accountAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  // Verify session key address matches derived address
  const derivedAddress = privateKeyToAccount(sessionKey as Hex).address;
  if (sessionKeyAddress && derivedAddress.toLowerCase() !== sessionKeyAddress.toLowerCase()) {
    logger.error({
      sessionKeyAddress,
      derivedAddress,
    }, "Session key address mismatch!");
    return res.status(400).json({ error: "Session key address mismatch" });
  }

  // Store session (in production: store in DB + KMS)
  sessions.set(userId, {
    sessionId,
    sessionKey,
    sessionKeyAddress: sessionKeyAddress || derivedAddress,
    accountAddress,
    signature,
    permissionsContext, // Store the full SDK-generated context
    permissions,
    expiresAt,
    revoked: false
  });

  saveSessions();

  logger.info({ userId, sessionId, accountAddress }, "✓ Session created");

  res.json({ ok: true, sessionId, accountAddress });
});

// Send transaction with session key via SDK
app.post("/api/transaction", async (req, res) => {
  try {
    const { userId, to, value, data } = req.body;

    const session = sessions.get(userId);

    if (!session) {
      return res.status(404).json({ error: "No session found" });
    }

    if (session.revoked) {
      return res.status(403).json({ error: "Session revoked" });
    }

    if (Date.now() > session.expiresAt) {
      return res.status(403).json({ error: "Session expired" });
    }

    const checksummedTo = getAddress(to);

    logger.info({ userId, to: checksummedTo, value }, "Sending transaction");

    // Create session signer and client
    const sessionSigner = LocalAccountSigner.privateKeyToAccountSigner(session.sessionKey as Hex);
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
      chain: sepolia,
      signer: sessionSigner,
      policyId: ALCHEMY_GAS_POLICY_ID,
    });

    // Get the permissions context
    const context = session.permissionsContext;
    if (!context) {
      return res.status(400).json({ error: "No permissions context found for session" });
    }

    const permissions = { context: context as `0x${string}` };
    const valueHex = `0x${BigInt(value || 0).toString(16)}` as `0x${string}`;

    // Prepare, sign, and send transaction
    const preparedCalls = await client.prepareCalls({
      from: session.accountAddress as `0x${string}`,
      calls: [{
        to: checksummedTo as `0x${string}`,
        value: valueHex,
        data: (data || "0x") as `0x${string}`,
      }],
      capabilities: {
        permissions,
        paymasterService: { policyId: ALCHEMY_GAS_POLICY_ID! },
      },
    });

    const signedCalls = await signPreparedCalls(sessionSigner, preparedCalls);
    const result = await client.sendPreparedCalls({
      ...signedCalls,
      capabilities: { permissions },
    } as any);

    // Wait for confirmation
    const callId = result.preparedCallIds?.[0];
    let txHash = callId;

    if (callId) {
      try {
        const txResult = await client.waitForCallsStatus({ id: callId });
        txHash = txResult.receipts?.[0]?.transactionHash || callId;
      } catch (waitError: any) {
        logger.warn({ error: waitError.message }, "Could not wait for confirmation");
      }
    }

    logger.info({ txHash }, "✓ Transaction sent");

    res.json({
      success: true,
      transactionHash: txHash,
      result,
    });
  } catch (error: any) {
    logger.error({ error: error.message, stack: error.stack }, "Transaction failed");
    res.status(500).json({
      error: "Transaction failed",
      message: error.message
    });
  }
});

// Get session info
app.get("/api/session/:userId", (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);

  if (!session) {
    return res.status(404).json({ error: "No session found" });
  }

  res.json({
    sessionId: session.sessionId,
    permissions: session.permissions,
    expiresAt: session.expiresAt,
    revoked: session.revoked,
    isExpired: Date.now() > session.expiresAt
  });
});

// Revoke session
app.delete("/api/session/:userId", (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);

  if (!session) {
    return res.status(404).json({ error: "No session found" });
  }

  session.revoked = true;

  saveSessions();

  logger.info({ userId }, "✓ Session revoked");

  res.json({ ok: true, message: "Session revoked" });
});

const httpsServer = https.createServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
}, app);

httpsServer.listen(PORT, () => {
  logger.info(`✓ Server running on https://localhost:${PORT}`);
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import https from "https";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import pino from "pino";
import { sepolia } from "@account-kit/infra";
import { SmartWalletService } from "agio-smart-wallet-server";
import type { SessionInfo } from "agio-smart-wallet-core";
import { requireAuth, type AuthRequest } from "./middleware/auth.js";
import { FileStorage } from "./storage.js";

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

// SSL certificate setup
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

// Initialize storage and wallet service
const storage = new FileStorage();
const walletService = new SmartWalletService({
  alchemyApiKey: ALCHEMY_API_KEY,
  policyId: ALCHEMY_GAS_POLICY_ID,
  chain: sepolia,
  sessionStorage: storage,
  walletStorage: storage,
});

logger.info(`✓ Loaded ${storage.sessionCount} sessions, ${storage.walletCount} wallets`);

const app = express();

app.use(cors({
  origin: ["https://localhost:8080", "https://localhost:8081"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Wallet endpoints
app.post("/api/wallet", requireAuth, async (req: AuthRequest, res) => {
  const { accountAddress, walletIndex } = req.body;
  const userId = req.auth!.sub;

  if (!accountAddress) {
    return res.status(400).json({ error: "Missing accountAddress" });
  }

  try {
    // If walletIndex not specified, get next available index
    const index = walletIndex ?? await storage.getNextWalletIndex(userId);
    await walletService.saveWallet(userId, accountAddress, index > 0 ? index : undefined);
    logger.info({ userId, accountAddress, walletIndex: index }, "✓ Wallet saved");
    res.json({ ok: true, accountAddress, walletIndex: index });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to save wallet");
    res.status(500).json({ error: error.message });
  }
});

// Get single wallet by index (backward compat: no index = first wallet)
app.get("/api/wallet", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const walletIndex = req.query.walletIndex ? parseInt(req.query.walletIndex as string, 10) : undefined;

  try {
    const wallet = await walletService.getWallet(userId, walletIndex);
    if (!wallet) {
      return res.status(404).json({ error: "No wallet found" });
    }
    res.json({ ...wallet, walletIndex: walletIndex ?? 0 });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get wallet");
    res.status(500).json({ error: error.message });
  }
});

// Get all wallets for user
app.get("/api/wallets", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;

  try {
    const wallets = await storage.getWallets(userId);
    res.json({ wallets });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get wallets");
    res.status(500).json({ error: error.message });
  }
});

// Session endpoints
app.post("/api/session", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const { sessionId, sessionKey, sessionKeyAddress, accountAddress, signature, permissionsContext, permissions, expiresAt, walletIndex } = req.body;

  if (!sessionId || !sessionKey || !accountAddress) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    await walletService.storeSession(userId, {
      sessionId,
      sessionKey,
      sessionKeyAddress,
      accountAddress,
      signature,
      permissionsContext,
      permissions,
      expiresAt,
    }, walletIndex > 0 ? walletIndex : undefined);

    logger.info({ userId, sessionId, accountAddress, walletIndex }, "✓ Session created");
    res.json({ ok: true, sessionId, accountAddress, walletIndex: walletIndex ?? 0 });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to create session");
    res.status(400).json({ error: error.message });
  }
});

app.get("/api/session", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const walletIndex = req.query.walletIndex ? parseInt(req.query.walletIndex as string, 10) : undefined;

  try {
    const session = await walletService.getSession(userId, walletIndex);
    if (!session) {
      return res.status(404).json({ error: "No session found" });
    }

    const info: SessionInfo = {
      sessionId: session.sessionId,
      permissions: session.permissions,
      expiresAt: session.expiresAt,
      revoked: session.revoked,
    };
    res.json({ ...info, walletIndex: walletIndex ?? 0 });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to get session");
    res.status(500).json({ error: error.message });
  }
});

app.delete("/api/session", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const walletIndex = req.query.walletIndex ? parseInt(req.query.walletIndex as string, 10) : undefined;

  try {
    await walletService.revokeSession(userId, walletIndex);
    logger.info({ userId, walletIndex }, "✓ Session revoked");
    res.json({ ok: true, message: "Session revoked", walletIndex: walletIndex ?? 0 });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to revoke session");
    res.status(500).json({ error: error.message });
  }
});

// Transaction endpoint
app.post("/api/transaction", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.auth!.sub;
  const { to, value, data, walletIndex } = req.body;

  try {
    logger.info({ userId, to, value, walletIndex }, "Sending transaction");

    const result = await walletService.sendTransaction(userId, { to, value, data }, walletIndex > 0 ? walletIndex : undefined);

    logger.info({ txHash: result.transactionHash, walletIndex }, "✓ Transaction sent");
    res.json({ ...result, walletIndex: walletIndex ?? 0 });
  } catch (error: any) {
    logger.error({ error: error.message }, "Transaction failed");
    res.status(500).json({ error: "Transaction failed", message: error.message });
  }
});

const httpsServer = https.createServer({
  key: fs.readFileSync(keyPath),
  cert: fs.readFileSync(certPath)
}, app);

httpsServer.listen(PORT, () => {
  logger.info(`✓ Server running on https://localhost:${PORT}`);
});

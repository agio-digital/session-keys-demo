import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createModularAccountAlchemyClient } from '@alchemy/aa-alchemy';
import { sepolia } from 'viem/chains';
import { LocalAccountSigner } from '@alchemy/aa-core';
import type { Hex } from 'viem';

dotenv.config();

// Validate required environment variables
const PORT = process.env.PORT;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

if (!PORT) {
  throw new Error("PORT is required in environment variables");
}

if (!ALCHEMY_API_KEY) {
  throw new Error("ALCHEMY_API_KEY is required in environment variables");
}

const app = express();

app.use(cors());
app.use(express.json());

// In-memory session storage (use DB + KMS in production)
const sessions = new Map<string, {
  sessionId: string;
  sessionKey: string;
  accountAddress: string;
  signature: string;
  permissions: any[];
  expiresAt: number;
  revoked: boolean;
}>();

// Store session key
app.post('/api/session', (req, res) => {
  const { userId, sessionId, sessionKey, accountAddress, signature, permissions, expiresAt } = req.body;

  if (!userId || !sessionId || !sessionKey || !accountAddress) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Store session (in production: store in DB + KMS)
  sessions.set(userId, {
    sessionId,
    sessionKey,
    accountAddress,
    signature,
    permissions,
    expiresAt,
    revoked: false
  });

  console.log(`✓ Session created for user ${userId}`);
  console.log(`  Account: ${accountAddress}`);
  console.log(`  Session ID: ${sessionId}`);
  console.log(`  Expires: ${new Date(expiresAt).toISOString()}`);
  console.log(`  Permissions:`, JSON.stringify(permissions, null, 2));

  res.json({ ok: true, sessionId, accountAddress });
});

// Send transaction with session key
app.post('/api/transaction', async (req, res) => {
  try {
    const { userId, to, value, data } = req.body;

    const session = sessions.get(userId);

    if (!session) {
      return res.status(404).json({ error: 'No session found' });
    }

    if (session.revoked) {
      return res.status(403).json({ error: 'Session revoked' });
    }

    if (Date.now() > session.expiresAt) {
      return res.status(403).json({ error: 'Session expired' });
    }

    console.log(`✓ Signing transaction for user ${userId}`);
    console.log(`  From: ${session.accountAddress}`);
    console.log(`  To: ${to}`);
    console.log(`  Value: ${value}`);
    console.log(`  Using session: ${session.sessionId}`);

    // Create signer from session key
    const sessionSigner = LocalAccountSigner.privateKeyToAccountSigner(session.sessionKey as Hex);

    // Create Alchemy client with session key signer
    const client = await createModularAccountAlchemyClient({
      apiKey: ALCHEMY_API_KEY,
      chain: sepolia,
      signer: sessionSigner,
      accountAddress: session.accountAddress as Hex,
    });

    // Send user operation using session key
    const result = await client.sendUserOperation({
      uo: {
        target: to as Hex,
        data: (data || '0x') as Hex,
        value: BigInt(value || 0),
      },
    });

    console.log(`  UserOp hash: ${result.hash}`);

    // Wait for transaction to be mined
    const txHash = await client.waitForUserOperationTransaction(result);

    console.log(`  Transaction hash: ${txHash}`);

    res.json({
      success: true,
      transactionHash: txHash,
      userOpHash: result.hash
    });
  } catch (error: any) {
    console.error('Transaction error:', error);
    res.status(500).json({
      error: 'Transaction failed',
      message: error.message
    });
  }
});

// Get session info
app.get('/api/session/:userId', (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);

  if (!session) {
    return res.status(404).json({ error: 'No session found' });
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
app.delete('/api/session/:userId', (req, res) => {
  const { userId } = req.params;
  const session = sessions.get(userId);

  if (!session) {
    return res.status(404).json({ error: 'No session found' });
  }

  session.revoked = true;
  console.log(`✓ Session revoked for user ${userId}`);

  res.json({ ok: true, message: 'Session revoked' });
});

app.listen(PORT, () => {
  console.log(`✓ Server running on http://localhost:${PORT}`);
});

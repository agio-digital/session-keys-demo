import type { Hex, Address, Chain } from "viem";
import { getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { createSmartWalletClient, signPreparedCalls } from "@account-kit/wallet-client";
import { LocalAccountSigner } from "@aa-sdk/core";
import { alchemy } from "@account-kit/infra";
import {
  type SessionData,
  type WalletData,
  type TransactionRequest,
  type TransactionResult,
  type SessionValidation,
  validateSession,
} from "agio-smart-wallet-core";
import type { SessionStorage, WalletStorage } from "./storage.js";

export interface SmartWalletServiceConfig {
  /** Alchemy API key */
  alchemyApiKey: string;
  /** Alchemy Gas Manager policy ID */
  policyId: string;
  /** Chain to use (e.g., sepolia from viem/chains) */
  chain: Chain;
  /** Session storage implementation */
  sessionStorage: SessionStorage;
  /** Wallet storage implementation */
  walletStorage: WalletStorage;
}

/**
 * Server-side service for smart wallet session key management.
 * Transport-agnostic - use with REST, GraphQL, tRPC, etc.
 */
export class SmartWalletService {
  private config: SmartWalletServiceConfig;

  constructor(config: SmartWalletServiceConfig) {
    this.config = config;
  }

  // ==================== Wallet Operations ====================

  /**
   * Save wallet address for a user
   *
   * @param userId - User identifier (e.g., Auth0 sub claim)
   * @param accountAddress - Smart wallet address
   * @param accountId - Optional account identifier for multi-account support
   */
  async saveWallet(
    userId: string,
    accountAddress: Address,
    accountId?: string
  ): Promise<void> {
    const wallet: WalletData = {
      accountAddress: getAddress(accountAddress),
      accountId,
      createdAt: Date.now(),
    };
    // Use composite key for multi-account support
    const storageKey = accountId ? `${userId}:${accountId}` : userId;
    await this.config.walletStorage.saveWallet(storageKey, wallet);
  }

  /**
   * Get wallet for a user
   *
   * @param userId - User identifier
   * @param accountId - Optional account identifier for multi-account support
   */
  async getWallet(userId: string, accountId?: string): Promise<WalletData | null> {
    const storageKey = accountId ? `${userId}:${accountId}` : userId;
    return this.config.walletStorage.getWallet(storageKey);
  }

  // ==================== Session Operations ====================

  /**
   * Store a session key for a user.
   * Called after client-side grantPermissions().
   */
  async storeSession(
    userId: string,
    session: Omit<SessionData, "revoked" | "createdAt">
  ): Promise<void> {
    // Verify session key address matches derived address
    const derivedAddress = privateKeyToAccount(session.sessionKey).address;
    if (derivedAddress.toLowerCase() !== session.sessionKeyAddress.toLowerCase()) {
      throw new Error("Session key address mismatch");
    }

    const fullSession: SessionData = {
      ...session,
      sessionKeyAddress: getAddress(session.sessionKeyAddress),
      accountAddress: getAddress(session.accountAddress),
      revoked: false,
      createdAt: Date.now(),
    };

    await this.config.sessionStorage.saveSession(userId, fullSession);
  }

  /**
   * Get session for a user
   */
  async getSession(userId: string, sessionId?: string): Promise<SessionData | null> {
    return this.config.sessionStorage.getSession(userId, sessionId);
  }

  /**
   * Validate a session
   */
  async validateUserSession(userId: string, sessionId?: string): Promise<SessionValidation> {
    const session = await this.getSession(userId, sessionId);
    return validateSession(session);
  }

  /**
   * Revoke a session
   */
  async revokeSession(userId: string, sessionId?: string): Promise<void> {
    await this.config.sessionStorage.revokeSession(userId, sessionId);
  }

  // ==================== Transaction Operations ====================

  /**
   * Send a transaction using the stored session key.
   * This is the main method for delegated transaction signing.
   */
  async sendTransaction(
    userId: string,
    tx: TransactionRequest,
    sessionId?: string
  ): Promise<TransactionResult> {
    // Get and validate session
    const session = await this.getSession(userId, sessionId);
    const validation = validateSession(session);

    if (!validation.valid || !session) {
      throw new Error(`Session ${validation.reason || "invalid"}`);
    }

    // Validate permissions context exists
    if (!session.permissionsContext) {
      throw new Error("No permissions context found for session");
    }

    // Create session signer from stored key
    const sessionSigner = LocalAccountSigner.privateKeyToAccountSigner(session.sessionKey);

    // Create smart wallet client
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: this.config.alchemyApiKey }),
      chain: this.config.chain,
      signer: sessionSigner,
      policyId: this.config.policyId,
    });

    const permissions = { context: session.permissionsContext as `0x${string}` };
    const valueHex = `0x${BigInt(tx.value || 0).toString(16)}` as Hex;
    const checksummedTo = getAddress(tx.to);

    // Prepare transaction
    const preparedCalls = await client.prepareCalls({
      from: session.accountAddress as `0x${string}`,
      calls: [
        {
          to: checksummedTo as `0x${string}`,
          value: valueHex,
          data: (tx.data || "0x") as `0x${string}`,
        },
      ],
      capabilities: {
        permissions,
        paymasterService: { policyId: this.config.policyId },
      },
    });

    // Sign with session key
    const signedCalls = await signPreparedCalls(sessionSigner, preparedCalls);

    // Send transaction
    const result = await client.sendPreparedCalls({
      ...signedCalls,
      capabilities: { permissions },
    } as Parameters<typeof client.sendPreparedCalls>[0]);

    // Wait for confirmation
    const callId = result.preparedCallIds?.[0];
    let txHash = callId || "";

    if (callId) {
      try {
        const txResult = await client.waitForCallsStatus({ id: callId });
        txHash = txResult.receipts?.[0]?.transactionHash || callId;
      } catch {
        // Transaction submitted but confirmation failed - return callId
      }
    }

    return {
      success: true,
      transactionHash: txHash,
    };
  }
}

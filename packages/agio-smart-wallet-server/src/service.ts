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
   * @param walletIndex - Optional wallet index for multi-wallet support (0 = first wallet)
   */
  async saveWallet(
    userId: string,
    accountAddress: Address,
    walletIndex?: number
  ): Promise<void> {
    const wallet: WalletData = {
      accountAddress: getAddress(accountAddress),
      accountId: walletIndex !== undefined && walletIndex > 0 ? String(walletIndex) : undefined,
      createdAt: Date.now(),
    };
    await this.config.walletStorage.saveWallet(userId, wallet, walletIndex);
  }

  /**
   * Get wallet for a user
   *
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  async getWallet(userId: string, walletIndex?: number): Promise<WalletData | null> {
    return this.config.walletStorage.getWallet(userId, walletIndex);
  }

  // ==================== Session Operations ====================

  /**
   * Store a session key for a user.
   * Called after client-side grantPermissions().
   *
   * @param userId - User identifier
   * @param session - Session data (without revoked/createdAt)
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  async storeSession(
    userId: string,
    session: Omit<SessionData, "revoked" | "createdAt">,
    walletIndex?: number
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

    await this.config.sessionStorage.saveSession(userId, fullSession, walletIndex);
  }

  /**
   * Get session for a user
   *
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  async getSession(userId: string, walletIndex?: number): Promise<SessionData | null> {
    return this.config.sessionStorage.getSession(userId, walletIndex);
  }

  /**
   * Validate a session
   *
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  async validateUserSession(userId: string, walletIndex?: number): Promise<SessionValidation> {
    const session = await this.getSession(userId, walletIndex);
    return validateSession(session);
  }

  /**
   * Revoke a session
   *
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  async revokeSession(userId: string, walletIndex?: number): Promise<void> {
    await this.config.sessionStorage.revokeSession(userId, walletIndex);
  }

  // ==================== Transaction Operations ====================

  /**
   * Send a transaction using the stored session key.
   * This is the main method for delegated transaction signing.
   *
   * @param userId - User identifier
   * @param tx - Transaction request
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  async sendTransaction(
    userId: string,
    tx: TransactionRequest,
    walletIndex?: number
  ): Promise<TransactionResult> {
    // Get and validate session
    const session = await this.getSession(userId, walletIndex);
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

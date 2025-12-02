import type { Chain, Hex, Address } from "viem";
import { parseEther, toHex, getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { alchemy } from "@account-kit/infra";
import type { AlchemyWebSigner } from "@account-kit/signer";
import {
  type SessionData,
  type CreateSessionOptions,
  type Permission,
  calculateExpiry,
  extractSessionId,
  extractSignature,
} from "agio-smart-wallet-core";

export interface SmartWalletClientConfig {
  /** Alchemy API key */
  alchemyApiKey: string;
  /** Alchemy Gas Manager policy ID */
  policyId: string;
  /** Chain to use (e.g., sepolia from viem/chains) */
  chain: Chain;
}

export interface CreateWalletOptions {
  /**
   * Optional account identifier for multi-account support.
   * If specified, creates a new account even if one already exists for this signer.
   * Use different IDs to create multiple accounts per signer.
   */
  accountId?: string;
}

export interface CreateSessionResult {
  sessionId: string;
  sessionKey: Hex;
  sessionKeyAddress: Address;
  signature: Hex;
  permissionsContext: Hex;
  permissions: Permission[];
  expiresAt: number;
}

/**
 * Client-side SDK for smart wallet operations.
 * Framework-agnostic - use with Vue, React, or vanilla JS.
 */
export class SmartWalletClient {
  private config: SmartWalletClientConfig;

  constructor(config: SmartWalletClientConfig) {
    this.config = config;
  }

  /**
   * Create a smart wallet for the user.
   * Returns counterfactual address (deployed on first transaction).
   *
   * @param signer - AlchemyWebSigner instance
   * @param options - Optional settings including accountId for multi-account support
   */
  async createWallet(
    signer: AlchemyWebSigner,
    options?: CreateWalletOptions
  ): Promise<Address> {
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: this.config.alchemyApiKey }),
      chain: this.config.chain,
      signer,
      policyId: this.config.policyId,
    });

    const account = await client.requestAccount(
      options?.accountId ? { id: options.accountId } : undefined
    );
    return getAddress(account.address);
  }

  /**
   * Create a session key with permissions.
   * User will sign an authorization message.
   *
   * @param signer - AlchemyWebSigner instance
   * @param accountAddress - The smart wallet address
   * @param options - Session options including expiry, permissions, and accountId
   */
  async createSession(
    signer: AlchemyWebSigner,
    accountAddress: Address,
    options?: CreateSessionOptions
  ): Promise<CreateSessionResult> {
    // Generate ephemeral session key
    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);

    // Calculate expiry
    const expiresAt = calculateExpiry(options);
    const expirySec = Math.floor(expiresAt / 1000);

    // Create smart wallet client
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: this.config.alchemyApiKey }),
      chain: this.config.chain,
      signer,
      policyId: this.config.policyId,
    });

    // Request account to associate signer (with optional accountId for multi-account)
    await client.requestAccount(
      options?.accountId ? { id: options.accountId } : undefined
    );

    // Grant permissions (user signs authorization)
    const permissions = options?.permissions || [{ type: "root" }];
    const grantResult = await client.grantPermissions({
      account: accountAddress,
      expirySec,
      key: {
        publicKey: sessionKeyAccount.address,
        type: "secp256k1",
      },
      permissions: permissions as Parameters<typeof client.grantPermissions>[0]["permissions"],
    });

    // Extract sessionId and signature from context
    const sessionId = extractSessionId(grantResult.context);
    const signature = extractSignature(grantResult.context);

    return {
      sessionId,
      sessionKey: sessionPrivateKey,
      sessionKeyAddress: sessionKeyAccount.address,
      signature: signature as Hex,
      permissionsContext: grantResult.context as Hex,
      permissions,
      expiresAt,
    };
  }

  /**
   * Send a transaction directly using the user's signer.
   * This bypasses session keys - user signs directly.
   */
  async sendDirectTransaction(
    signer: AlchemyWebSigner,
    tx: { to: Address; value?: string; data?: Hex }
  ): Promise<string> {
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: this.config.alchemyApiKey }),
      chain: this.config.chain,
      signer,
      policyId: this.config.policyId,
    });

    const account = await client.requestAccount();
    const valueHex = tx.value ? toHex(parseEther(tx.value)) : "0x0";

    // Prepare transaction
    const preparedCalls = await client.prepareCalls({
      from: account.address,
      calls: [
        {
          to: tx.to as `0x${string}`,
          value: valueHex as `0x${string}`,
          data: (tx.data || "0x") as `0x${string}`,
        },
      ],
      capabilities: {
        paymasterService: { policyId: this.config.policyId },
      },
    });

    // Sign and send
    const signedCalls = await client.signPreparedCalls(preparedCalls);
    const result = await client.sendPreparedCalls(signedCalls);

    // Wait for confirmation
    const callId = result.preparedCallIds[0];
    if (callId) {
      const txResult = await client.waitForCallsStatus({ id: callId });
      return txResult.receipts?.[0]?.transactionHash || callId;
    }

    return callId || "";
  }

  /**
   * Check if an account is deployed on-chain
   */
  async isAccountDeployed(accountAddress: Address): Promise<boolean> {
    const response = await fetch(
      `https://eth-${this.config.chain.name.toLowerCase()}.g.alchemy.com/v2/${this.config.alchemyApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getCode",
          params: [accountAddress, "latest"],
        }),
      }
    );

    const data = await response.json();
    return data.result && data.result !== "0x" && data.result !== "0x0";
  }

  /**
   * Get native token balance for an account
   */
  async getBalance(accountAddress: Address): Promise<bigint> {
    const response = await fetch(
      `https://eth-${this.config.chain.name.toLowerCase()}.g.alchemy.com/v2/${this.config.alchemyApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: [accountAddress, "latest"],
        }),
      }
    );

    const data = await response.json();
    return data.result ? BigInt(data.result) : 0n;
  }
}

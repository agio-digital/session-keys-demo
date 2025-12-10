import type { Hex, Address } from "viem";

// Re-export viem types for convenience
export type { Hex, Address };

/**
 * Permission types for session keys
 */
export type PermissionType =
  | "root"
  | "native-token-transfer"
  | "erc20-token-transfer"
  | "contract-call";

/**
 * Base permission structure
 */
export interface Permission {
  type: PermissionType;
  data?: Record<string, unknown>;
}

/**
 * Root permission - full access (use only for testing)
 */
export interface RootPermission extends Permission {
  type: "root";
}

/**
 * Native token transfer permission with optional limit
 */
export interface NativeTokenTransferPermission extends Permission {
  type: "native-token-transfer";
  data: {
    maxAmount: string; // Wei as string
  };
}

/**
 * ERC-20 token transfer permission
 */
export interface ERC20TransferPermission extends Permission {
  type: "erc20-token-transfer";
  data: {
    token: Address;
    maxAmount: string;
  };
}

/**
 * Contract call permission
 */
export interface ContractCallPermission extends Permission {
  type: "contract-call";
  data: {
    address: Address;
    functions?: string[]; // Optional function selectors
  };
}

/**
 * Session data stored on server
 */
export interface SessionData {
  sessionId: string;
  sessionKey: Hex;
  sessionKeyAddress: Address;
  accountAddress: Address;
  signature: Hex;
  permissionsContext: Hex;
  permissions: Permission[];
  expiresAt: number; // Unix timestamp in ms
  revoked: boolean;
  createdAt?: number;
}

/**
 * Wallet data stored on server
 */
export interface WalletData {
  accountAddress: Address;
  accountId?: string; // Optional account identifier for multi-account support
  createdAt: number;
}

/**
 * Options for creating a wallet
 */
export interface CreateWalletOptions {
  /** Optional account identifier for multi-account support */
  accountId?: string;
}

/**
 * Options for creating a session
 */
export interface CreateSessionOptions {
  /** Expiry in hours (0 = never) */
  expiryHours?: number;
  /** Expiry as Unix timestamp in ms */
  expiresAt?: number;
  /** Permissions for the session key */
  permissions?: Permission[];
  /**
   * Wallet index for deterministic salt generation.
   * Index 0 = first/default wallet, index 1+ = additional wallets with different addresses.
   * Must match the walletIndex used when creating the wallet.
   */
  walletIndex?: number;
}

/**
 * Transaction request
 */
export interface TransactionRequest {
  to: Address;
  value?: string; // Wei as string
  data?: Hex;
}

/**
 * Transaction result
 */
export interface TransactionResult {
  success: boolean;
  transactionHash: string;
}

/**
 * Session validation result
 */
export interface SessionValidation {
  valid: boolean;
  reason?: "not_found" | "revoked" | "expired";
}

/**
 * Public session info returned by API (excludes sensitive data like sessionKey)
 */
export interface SessionInfo {
  sessionId: string;
  permissions: Permission[];
  expiresAt: number;
  revoked: boolean;
}

// Client operations
export {
  SmartWalletClient,
  type SmartWalletClientConfig,
  type CreateWalletOptions,
  type CreateSessionResult,
} from "./client.js";

// Re-export core types for convenience
export type {
  SessionData,
  WalletData,
  Permission,
  CreateSessionOptions,
  TransactionRequest,
  TransactionResult,
} from "agio-smart-wallet-core";

export {
  calculateExpiry,
  extractSessionId,
  extractSignature,
  formatExpiry,
  isSessionActive,
  validateSession,
  MAX_EXPIRY_MS,
  MAX_EXPIRY_SEC,
  DEFAULT_EXPIRY_HOURS,
  EXPIRY_PRESETS,
} from "agio-smart-wallet-core";

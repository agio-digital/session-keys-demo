// Service
export { SmartWalletService, type SmartWalletServiceConfig } from "./service.js";

// Storage interfaces and implementations
export {
  type SessionStorage,
  type WalletStorage,
  InMemoryStorage,
} from "./storage.js";

// Re-export core types for convenience
export type {
  SessionData,
  WalletData,
  TransactionRequest,
  TransactionResult,
  SessionValidation,
  Permission,
  CreateSessionOptions,
} from "agio-smart-wallet-core";

export {
  validateSession,
  isSessionActive,
  calculateExpiry,
  extractSessionId,
  extractSignature,
  MAX_EXPIRY_MS,
  MAX_EXPIRY_SEC,
  DEFAULT_EXPIRY_HOURS,
  EXPIRY_PRESETS,
} from "agio-smart-wallet-core";

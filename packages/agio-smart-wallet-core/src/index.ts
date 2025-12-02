// Types
export type {
  Hex,
  Address,
  Permission,
  PermissionType,
  RootPermission,
  NativeTokenTransferPermission,
  ERC20TransferPermission,
  ContractCallPermission,
  SessionData,
  SessionInfo,
  WalletData,
  CreateSessionOptions,
  TransactionRequest,
  TransactionResult,
  SessionValidation,
} from "./types.js";

// Constants
export {
  MAX_EXPIRY_SEC,
  MAX_EXPIRY_MS,
  DEFAULT_EXPIRY_HOURS,
  EXPIRY_PRESETS,
  type ExpiryPreset,
} from "./constants.js";

// Utilities
export {
  calculateExpiry,
  validateSession,
  isSessionActive,
  extractSessionId,
  extractSignature,
  formatExpiry,
} from "./utils.js";

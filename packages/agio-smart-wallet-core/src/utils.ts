import type { SessionData, SessionInfo, SessionValidation, CreateSessionOptions } from "./types.js";
import { MAX_EXPIRY_MS, DEFAULT_EXPIRY_HOURS } from "./constants.js";

/**
 * Calculate expiry timestamp from options
 */
export function calculateExpiry(options?: CreateSessionOptions): number {
  if (options?.expiresAt) {
    return options.expiresAt;
  }

  const hours = options?.expiryHours ?? DEFAULT_EXPIRY_HOURS;

  // 0 = never expires
  if (hours === 0) {
    return MAX_EXPIRY_MS;
  }

  return Date.now() + hours * 60 * 60 * 1000;
}

/** Minimal session fields needed for validation */
type SessionLike = Pick<SessionData | SessionInfo, "revoked" | "expiresAt">;

/**
 * Validate a session
 */
export function validateSession(session: SessionLike | null | undefined): SessionValidation {
  if (!session) {
    return { valid: false, reason: "not_found" };
  }

  if (session.revoked) {
    return { valid: false, reason: "revoked" };
  }

  if (Date.now() > session.expiresAt) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true };
}

/**
 * Check if a session is active (exists, not revoked, not expired)
 */
export function isSessionActive(session: SessionLike | null | undefined): boolean {
  return validateSession(session).valid;
}

/**
 * Extract sessionId from permissions context
 * Context format: 0x00 + sessionId (16 bytes hex = 32 chars) + signature
 */
export function extractSessionId(context: string): string {
  return `0x${context.slice(4, 36)}`;
}

/**
 * Extract signature from permissions context
 */
export function extractSignature(context: string): string {
  return `0x${context.slice(36)}`;
}

/**
 * Format expiry for display
 */
export function formatExpiry(expiresAt: number): string {
  const now = Date.now();
  const diff = expiresAt - now;

  if (diff <= 0) {
    return "Expired";
  }

  // Check if "never" (max uint32)
  if (expiresAt >= MAX_EXPIRY_MS - 1000) {
    return "Never";
  }

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (days > 365) {
    return `${Math.floor(days / 365)}y`;
  }
  if (days > 30) {
    return `${Math.floor(days / 30)}mo`;
  }
  if (days > 0) {
    return `${days}d`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }

  const minutes = Math.floor(diff / (1000 * 60));
  return `${minutes}m`;
}

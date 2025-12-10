import type { SessionData, WalletData } from "agio-smart-wallet-core";

/**
 * Storage interface for session data.
 * Implement this for your database (PostgreSQL, MongoDB, Redis, etc.)
 */
export interface SessionStorage {
  /**
   * Save a session for a user
   * @param userId - User identifier (e.g., Auth0 sub claim)
   * @param session - Session data to store
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  saveSession(userId: string, session: SessionData, walletIndex?: number): Promise<void>;

  /**
   * Get a session for a user
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   * @returns Session data or null if not found
   */
  getSession(userId: string, walletIndex?: number): Promise<SessionData | null>;

  /**
   * Get all sessions for a user
   * @param userId - User identifier
   * @returns Array of sessions
   */
  getSessions?(userId: string): Promise<SessionData[]>;

  /**
   * Revoke a session
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  revokeSession(userId: string, walletIndex?: number): Promise<void>;

  /**
   * Delete a session completely
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  deleteSession?(userId: string, walletIndex?: number): Promise<void>;
}

/**
 * Storage interface for wallet data.
 */
export interface WalletStorage {
  /**
   * Save wallet data for a user
   * @param userId - User identifier
   * @param wallet - Wallet data to store
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  saveWallet(userId: string, wallet: WalletData, walletIndex?: number): Promise<void>;

  /**
   * Get wallet data for a user
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   * @returns Wallet data or null if not found
   */
  getWallet(userId: string, walletIndex?: number): Promise<WalletData | null>;

  /**
   * Delete wallet data for a user
   * @param userId - User identifier
   * @param walletIndex - Optional wallet index for multi-wallet support
   */
  deleteWallet?(userId: string, walletIndex?: number): Promise<void>;
}

/**
 * Build storage key from userId and optional walletIndex.
 * First wallet (index undefined/0) uses just userId for backward compat.
 */
function buildStorageKey(userId: string, walletIndex?: number): string {
  if (walletIndex === undefined || walletIndex === 0) {
    return userId;
  }
  return `${userId}:${walletIndex}`;
}

/**
 * In-memory storage implementation (for development/testing only)
 */
export class InMemoryStorage implements SessionStorage, WalletStorage {
  private sessions = new Map<string, SessionData>();
  private wallets = new Map<string, WalletData>();

  async saveSession(userId: string, session: SessionData, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.sessions.set(key, session);
  }

  async getSession(userId: string, walletIndex?: number): Promise<SessionData | null> {
    const key = buildStorageKey(userId, walletIndex);
    return this.sessions.get(key) ?? null;
  }

  async getSessions(userId: string): Promise<SessionData[]> {
    const sessions: SessionData[] = [];
    for (const [key, session] of this.sessions) {
      if (key === userId || key.startsWith(`${userId}:`)) {
        sessions.push(session);
      }
    }
    return sessions;
  }

  async revokeSession(userId: string, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    const session = this.sessions.get(key);
    if (session) {
      session.revoked = true;
    }
  }

  async deleteSession(userId: string, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.sessions.delete(key);
  }

  async saveWallet(userId: string, wallet: WalletData, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.wallets.set(key, wallet);
  }

  async getWallet(userId: string, walletIndex?: number): Promise<WalletData | null> {
    const key = buildStorageKey(userId, walletIndex);
    return this.wallets.get(key) ?? null;
  }

  async deleteWallet(userId: string, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.wallets.delete(key);
  }
}

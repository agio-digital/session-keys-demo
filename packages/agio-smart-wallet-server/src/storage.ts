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
   */
  saveSession(userId: string, session: SessionData): Promise<void>;

  /**
   * Get a session for a user
   * @param userId - User identifier
   * @param sessionId - Optional specific session ID (for multi-session support)
   * @returns Session data or null if not found
   */
  getSession(userId: string, sessionId?: string): Promise<SessionData | null>;

  /**
   * Get all sessions for a user
   * @param userId - User identifier
   * @returns Array of sessions
   */
  getSessions?(userId: string): Promise<SessionData[]>;

  /**
   * Revoke a session
   * @param userId - User identifier
   * @param sessionId - Optional specific session ID
   */
  revokeSession(userId: string, sessionId?: string): Promise<void>;

  /**
   * Delete a session completely
   * @param userId - User identifier
   * @param sessionId - Optional specific session ID
   */
  deleteSession?(userId: string, sessionId?: string): Promise<void>;
}

/**
 * Storage interface for wallet data.
 */
export interface WalletStorage {
  /**
   * Save wallet data for a user
   * @param userId - User identifier
   * @param wallet - Wallet data to store
   */
  saveWallet(userId: string, wallet: WalletData): Promise<void>;

  /**
   * Get wallet data for a user
   * @param userId - User identifier
   * @returns Wallet data or null if not found
   */
  getWallet(userId: string): Promise<WalletData | null>;

  /**
   * Delete wallet data for a user
   * @param userId - User identifier
   */
  deleteWallet?(userId: string): Promise<void>;
}

/**
 * In-memory storage implementation (for development/testing only)
 */
export class InMemoryStorage implements SessionStorage, WalletStorage {
  private sessions = new Map<string, SessionData>();
  private wallets = new Map<string, WalletData>();

  async saveSession(userId: string, session: SessionData): Promise<void> {
    this.sessions.set(userId, session);
  }

  async getSession(userId: string): Promise<SessionData | null> {
    return this.sessions.get(userId) ?? null;
  }

  async getSessions(userId: string): Promise<SessionData[]> {
    const session = this.sessions.get(userId);
    return session ? [session] : [];
  }

  async revokeSession(userId: string): Promise<void> {
    const session = this.sessions.get(userId);
    if (session) {
      session.revoked = true;
    }
  }

  async deleteSession(userId: string): Promise<void> {
    this.sessions.delete(userId);
  }

  async saveWallet(userId: string, wallet: WalletData): Promise<void> {
    this.wallets.set(userId, wallet);
  }

  async getWallet(userId: string): Promise<WalletData | null> {
    return this.wallets.get(userId) ?? null;
  }

  async deleteWallet(userId: string): Promise<void> {
    this.wallets.delete(userId);
  }
}

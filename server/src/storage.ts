import fs from "fs";
import path from "path";
import type { SessionData, WalletData } from "agio-smart-wallet-core";
import type { SessionStorage, WalletStorage } from "agio-smart-wallet-server";

const dataDir = path.resolve(process.cwd(), "data");
const sessionsFile = path.join(dataDir, "sessions.json");
const walletsFile = path.join(dataDir, "wallets.json");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

/**
 * File-based storage for development/demo purposes.
 * Production should use a proper database + KMS for session keys.
 */
export class FileStorage implements SessionStorage, WalletStorage {
  private sessions = new Map<string, SessionData>();
  private wallets = new Map<string, WalletData>();

  constructor() {
    this.loadSessions();
    this.loadWallets();
  }

  // Session Storage
  async saveSession(userId: string, session: SessionData): Promise<void> {
    this.sessions.set(userId, session);
    this.persistSessions();
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
      this.persistSessions();
    }
  }

  async deleteSession(userId: string): Promise<void> {
    this.sessions.delete(userId);
    this.persistSessions();
  }

  // Wallet Storage
  async saveWallet(userId: string, wallet: WalletData): Promise<void> {
    this.wallets.set(userId, wallet);
    this.persistWallets();
  }

  async getWallet(userId: string): Promise<WalletData | null> {
    return this.wallets.get(userId) ?? null;
  }

  async deleteWallet(userId: string): Promise<void> {
    this.wallets.delete(userId);
    this.persistWallets();
  }

  // Persistence helpers
  private loadSessions(): void {
    try {
      if (fs.existsSync(sessionsFile)) {
        const data = JSON.parse(fs.readFileSync(sessionsFile, "utf-8"));
        Object.entries(data).forEach(([userId, session]) => {
          this.sessions.set(userId, session as SessionData);
        });
      }
    } catch {
      // Ignore load errors
    }
  }

  private loadWallets(): void {
    try {
      if (fs.existsSync(walletsFile)) {
        const data = JSON.parse(fs.readFileSync(walletsFile, "utf-8"));
        Object.entries(data).forEach(([userId, wallet]) => {
          this.wallets.set(userId, wallet as WalletData);
        });
      }
    } catch {
      // Ignore load errors
    }
  }

  private persistSessions(): void {
    const data = Object.fromEntries(this.sessions);
    fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2));
  }

  private persistWallets(): void {
    const data = Object.fromEntries(this.wallets);
    fs.writeFileSync(walletsFile, JSON.stringify(data, null, 2));
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  get walletCount(): number {
    return this.wallets.size;
  }
}

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
 * Build storage key from userId and optional walletIndex.
 * First wallet (index undefined/0) uses just userId for backward compat.
 * Subsequent wallets use userId:index pattern.
 */
function buildStorageKey(userId: string, walletIndex?: number): string {
  if (walletIndex === undefined || walletIndex === 0) {
    return userId;
  }
  return `${userId}:${walletIndex}`;
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
  async saveSession(userId: string, session: SessionData, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.sessions.set(key, session);
    this.persistSessions();
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
      this.persistSessions();
    }
  }

  async deleteSession(userId: string, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.sessions.delete(key);
    this.persistSessions();
  }

  // Wallet Storage
  async saveWallet(userId: string, wallet: WalletData, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.wallets.set(key, wallet);
    this.persistWallets();
  }

  async getWallet(userId: string, walletIndex?: number): Promise<WalletData | null> {
    const key = buildStorageKey(userId, walletIndex);
    return this.wallets.get(key) ?? null;
  }

  async getWallets(userId: string): Promise<Array<WalletData & { walletIndex: number }>> {
    const wallets: Array<WalletData & { walletIndex: number }> = [];
    for (const [key, wallet] of this.wallets) {
      if (key === userId) {
        wallets.push({ ...wallet, walletIndex: 0 });
      } else if (key.startsWith(`${userId}:`)) {
        const index = parseInt(key.split(":")[1], 10);
        wallets.push({ ...wallet, walletIndex: index });
      }
    }
    return wallets.sort((a, b) => a.walletIndex - b.walletIndex);
  }

  async getNextWalletIndex(userId: string): Promise<number> {
    const wallets = await this.getWallets(userId);
    if (wallets.length === 0) return 0;
    return Math.max(...wallets.map((w) => w.walletIndex)) + 1;
  }

  async deleteWallet(userId: string, walletIndex?: number): Promise<void> {
    const key = buildStorageKey(userId, walletIndex);
    this.wallets.delete(key);
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

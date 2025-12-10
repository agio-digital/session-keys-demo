import { http } from "../utils/http";
import type { WalletData } from "agio-smart-wallet-core";

export type WalletWithIndex = WalletData & { walletIndex: number };

export async function getWallet(walletIndex?: number): Promise<WalletWithIndex | null> {
  try {
    const params = walletIndex !== undefined ? `?walletIndex=${walletIndex}` : "";
    return await http.get<WalletWithIndex>(`/api/wallet${params}`);
  } catch {
    return null;
  }
}

export async function getWallets(): Promise<WalletWithIndex[]> {
  try {
    const result = await http.get<{ wallets: WalletWithIndex[] }>("/api/wallets");
    return result.wallets;
  } catch {
    return [];
  }
}

export async function saveWallet(accountAddress: string, walletIndex?: number) {
  return http.post<{ ok: boolean; accountAddress: string; walletIndex: number }>("/api/wallet", {
    accountAddress,
    walletIndex,
  });
}

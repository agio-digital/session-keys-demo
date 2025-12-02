import { http } from "../utils/http";
import type { WalletData } from "agio-smart-wallet-core";

export async function getWallet(): Promise<WalletData | null> {
  try {
    return await http.get<WalletData>("/api/wallet");
  } catch {
    return null;
  }
}

export async function saveWallet(accountAddress: string) {
  return http.post<{ ok: boolean; accountAddress: string }>("/api/wallet", {
    accountAddress,
  });
}

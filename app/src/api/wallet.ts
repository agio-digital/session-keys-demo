import { http } from "../utils/http";

export type LocalWalletData = {
  accountAddress: string;
};

// Check server only (bypasses localStorage cache)
export async function getWalletFromServer(): Promise<LocalWalletData | null> {
  try {
    const data = await http.get<{ accountAddress: string; createdAt: number }>("/api/wallet");
    return { accountAddress: data.accountAddress };
  } catch {
    return null;
  }
}

export async function getWallet(localCacheKey?: string): Promise<LocalWalletData | null> {
  // Check localStorage first (if cache key provided)
  if (localCacheKey) {
    const localData = localStorage.getItem(`wallet_${localCacheKey}`);
    if (localData) {
      return JSON.parse(localData);
    }
  }

  // Fallback to server (userId determined from JWT)
  try {
    const data = await http.get<{ accountAddress: string; createdAt: number }>("/api/wallet");
    // Cache in localStorage if cache key provided
    if (localCacheKey) {
      localStorage.setItem(
        `wallet_${localCacheKey}`,
        JSON.stringify({ accountAddress: data.accountAddress })
      );
    }
    return { accountAddress: data.accountAddress };
  } catch {
    // Server unavailable or 404, return null
    return null;
  }
}

export async function saveWallet(accountAddress: string, localCacheKey?: string) {
  // Cache locally if key provided
  if (localCacheKey) {
    localStorage.setItem(`wallet_${localCacheKey}`, JSON.stringify({ accountAddress }));
  }

  // Save to server (userId determined from JWT)
  return http.post<{ ok: boolean; accountAddress: string }>("/api/wallet", {
    accountAddress,
  });
}

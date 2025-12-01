const API_URL = import.meta.env.VITE_API_URL || "";

export type LocalWalletData = {
  accountAddress: string;
};

export async function getWallet(userId: string): Promise<LocalWalletData | null> {
  // Check localStorage first
  const localData = localStorage.getItem(`wallet_${userId}`);
  if (localData) {
    return JSON.parse(localData);
  }

  // Fallback to server
  try {
    const response = await fetch(`${API_URL}/api/wallet/${userId}`);
    if (response.ok) {
      const data = await response.json();
      // Cache in localStorage
      localStorage.setItem(`wallet_${userId}`, JSON.stringify({ accountAddress: data.accountAddress }));
      return { accountAddress: data.accountAddress };
    }
  } catch {
    // Server unavailable, return null
  }

  return null;
}

export async function saveWallet(userId: string, accountAddress: string) {
  localStorage.setItem(
    `wallet_${userId}`,
    JSON.stringify({
      accountAddress,
    })
  );

  const response = await fetch(`${API_URL}/api/wallet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userId,
      accountAddress,
    }),
  });

  if (!response.ok) {
    throw new Error("Failed to save wallet address");
  }

  return response.json();
}

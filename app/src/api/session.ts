const API_URL = import.meta.env.VITE_API_URL || "";

export type SessionData = {
  sessionId: string;
  accountAddress: string;
  expiresAt: number;
  revoked: boolean;
  permissions: any[];
};

export async function getSession(userId: string): Promise<SessionData | null> {
  if (!userId) return null;

  const response = await fetch(`${API_URL}/api/session/${userId}`);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error("Failed to load session");
  }

  const data = await response.json();

  if (data.revoked || Date.now() > data.expiresAt) {
    return null;
  }

  return data;
}

export async function createSession(params: {
  userId: string;
  sessionId: string;
  sessionKey: string;
  sessionKeyAddress: string; // Address registered with Alchemy
  accountAddress: string;
  signature: string;
  permissionsContext?: string; // Full context from SDK grantPermissions
  permissions: any[];
  expiresAt: number;
}) {
  const response = await fetch(`${API_URL}/api/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      throw new Error(`Session creation failed: ${response.status} ${response.statusText}`);
    }
    throw new Error(errorData.message || errorData.error || "Failed to create session");
  }

  return response.json();
}

export async function revokeSession(userId: string) {
  const response = await fetch(`${API_URL}/api/session/${userId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to revoke session");
  }

  return response.json();
}

export async function sendTransaction(params: {
  userId: string;
  to: string;
  value: string;
  data?: string;
}) {
  const response = await fetch(`${API_URL}/api/transaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      throw new Error(`Transaction failed: ${response.status} ${response.statusText}`);
    }
    throw new Error(errorData.message || errorData.error || "Transaction failed");
  }

  return response.json();
}

// Wallet API session creation (uses Alchemy's managed sessions)
export type CreateWalletSessionParams = {
  account: string;
  chainId: number;
  publicKey: string;
  expirySec: number;
  permissions: Array<{ type: string; data?: any }>;
};

export type CreateWalletSessionResponse = {
  sessionId: string;
  signatureRequest: {
    type: "eth_signTypedData_v4" | "personal_sign";
    data: any;
  };
};

export async function createWalletSession(
  params: CreateWalletSessionParams
): Promise<CreateWalletSessionResponse> {
  const response = await fetch(`${API_URL}/api/wallet-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      throw new Error(`Wallet session creation failed: ${response.status} ${response.statusText}`);
    }
    throw new Error(errorData.message || errorData.error || "Failed to create wallet session");
  }

  return response.json();
}

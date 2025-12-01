import { http } from "../utils/http";

export type SessionData = {
  sessionId: string;
  accountAddress: string;
  expiresAt: number;
  revoked: boolean;
  permissions: any[];
};

export async function getSession(): Promise<SessionData | null> {
  try {
    const data = await http.get<SessionData>("/api/session");

    if (data.revoked || Date.now() > data.expiresAt) {
      return null;
    }

    return data;
  } catch {
    // 404 or error - no session
    return null;
  }
}

export async function createSession(params: {
  sessionId: string;
  sessionKey: string;
  sessionKeyAddress: string;
  accountAddress: string;
  signature: string;
  permissionsContext?: string;
  permissions: any[];
  expiresAt: number;
}) {
  return http.post<{ ok: boolean; sessionId: string; accountAddress: string }>(
    "/api/session",
    params
  );
}

export async function revokeSession() {
  return http.delete<{ ok: boolean; message: string }>("/api/session");
}

export async function sendTransaction(params: { to: string; value: string; data?: string }) {
  return http.post<{ success: boolean; transactionHash: string }>("/api/transaction", params);
}

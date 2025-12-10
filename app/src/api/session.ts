import { http } from "../utils/http";
import type { SessionInfo } from "agio-smart-wallet-core";

export type SessionWithIndex = SessionInfo & { walletIndex: number };

export async function getSession(walletIndex?: number): Promise<SessionWithIndex | null> {
  try {
    const params = walletIndex !== undefined ? `?walletIndex=${walletIndex}` : "";
    return await http.get<SessionWithIndex>(`/api/session${params}`);
  } catch {
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
  walletIndex?: number;
}) {
  return http.post<{ ok: boolean; sessionId: string; accountAddress: string; walletIndex: number }>(
    "/api/session",
    params
  );
}

export async function revokeSession(walletIndex?: number) {
  const params = walletIndex !== undefined ? `?walletIndex=${walletIndex}` : "";
  return http.delete<{ ok: boolean; message: string; walletIndex: number }>(`/api/session${params}`);
}

export async function sendTransaction(params: { to: string; value: string; data?: string; walletIndex?: number }) {
  return http.post<{ success: boolean; transactionHash: string; walletIndex: number }>("/api/transaction", params);
}

import { http } from "../utils/http";
import type { SessionInfo } from "agio-smart-wallet-core";

export async function getSession(): Promise<SessionInfo | null> {
  try {
    return await http.get<SessionInfo>("/api/session");
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

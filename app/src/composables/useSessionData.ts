import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { computed } from "vue";
import {
  getSession,
  createSession as createSessionApi,
  revokeSession as revokeSessionApi,
  sendTransaction as sendTransactionApi,
} from "../api/session";

export function useSessionData(userId: string) {
  const queryCache = useQueryCache();

  const { state } = useQuery({
    key: () => ["session", userId],
    query: () => getSession(userId),
    staleTime: 60_000,
  });

  const { mutate: createSession } = useMutation({
    mutation: (params: {
      sessionId: string;
      sessionKey: string;
      sessionKeyAddress: string;
      accountAddress: string;
      signature: string;
      permissionsContext?: string;
      permissions: any[];
      expiresAt: number;
    }) => createSessionApi({ userId, ...params }),
    onSuccess: () => queryCache.invalidateQueries({ key: ["session", userId] }),
  });

  const { mutate: revokeSession } = useMutation({
    mutation: () => revokeSessionApi(userId),
    onSuccess: () => queryCache.invalidateQueries({ key: ["session", userId] }),
  });

  const { mutateAsync: sendTransaction } = useMutation({
    mutation: (params: { to: string; value: string; data?: string }) =>
      sendTransactionApi({ userId, ...params }),
  });

  return {
    session: computed(() => state.value.data),
    isSessionActive: computed(() => {
      const s = state.value.data;
      return !!s && !s.revoked && Date.now() < s.expiresAt;
    }),
    createSession,
    revokeSession,
    sendTransaction,
  };
}

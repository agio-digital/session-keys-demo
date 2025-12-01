import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import {
  getSession,
  createSession as createSessionApi,
  revokeSession as revokeSessionApi,
  sendTransaction as sendTransactionApi,
} from "../api/session";

// isAuthenticated controls when the query runs (waits for auth)
export function useSessionData(isAuthenticated?: MaybeRefOrGetter<boolean>) {
  const queryCache = useQueryCache();

  const { state, refetch } = useQuery({
    key: () => ["session"],
    query: () => getSession(),
    staleTime: 60_000,
    // Only fetch when authenticated (if provided)
    enabled: () => (isAuthenticated !== undefined ? !!toValue(isAuthenticated) : true),
  });

  const { mutateAsync: createSession } = useMutation({
    mutation: (params: {
      sessionId: string;
      sessionKey: string;
      sessionKeyAddress: string;
      accountAddress: string;
      signature: string;
      permissionsContext?: string;
      permissions: any[];
      expiresAt: number;
    }) => createSessionApi(params),
    onSuccess: () => queryCache.invalidateQueries({ key: ["session"] }),
  });

  const { mutateAsync: revokeSession } = useMutation({
    mutation: () => revokeSessionApi(),
    onSuccess: () => queryCache.invalidateQueries({ key: ["session"] }),
  });

  const { mutateAsync: sendTransaction } = useMutation({
    mutation: (params: { to: string; value: string; data?: string }) => sendTransactionApi(params),
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
    refetchSession: refetch,
  };
}

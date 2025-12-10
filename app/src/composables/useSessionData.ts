import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { computed, toValue, type MaybeRefOrGetter, type Ref } from "vue";
import { isSessionActive } from "agio-smart-wallet-core";
import {
  getSession,
  createSession as createSessionApi,
  revokeSession as revokeSessionApi,
  sendTransaction as sendTransactionApi,
} from "../api/session";

// isAuthenticated controls when the query runs (waits for auth)
// walletIndex is reactive to automatically refetch when wallet changes
export function useSessionData(
  isAuthenticated?: MaybeRefOrGetter<boolean>,
  walletIndex?: Ref<number>
) {
  const queryCache = useQueryCache();
  const getWalletIndex = () => walletIndex?.value ?? 0;

  const { state, refetch } = useQuery({
    key: () => ["session", getWalletIndex()],
    query: () => getSession(getWalletIndex() > 0 ? getWalletIndex() : undefined),
    staleTime: 60_000,
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
      walletIndex?: number;
    }) => createSessionApi(params),
    onSuccess: () => queryCache.invalidateQueries({ key: ["session"] }),
  });

  const { mutateAsync: revokeSession } = useMutation({
    mutation: (params?: { walletIndex?: number }) => revokeSessionApi(params?.walletIndex),
    onSuccess: () => queryCache.invalidateQueries({ key: ["session"] }),
  });

  const { mutateAsync: sendTransaction } = useMutation({
    mutation: (params: { to: string; value: string; data?: string; walletIndex?: number }) =>
      sendTransactionApi(params),
  });

  return {
    session: computed(() => state.value.data),
    sessionStatus: computed(() => state.value.status),
    isSessionActive: computed(() => isSessionActive(state.value.data)),
    createSession,
    revokeSession,
    sendTransaction,
    refetchSession: refetch,
  };
}

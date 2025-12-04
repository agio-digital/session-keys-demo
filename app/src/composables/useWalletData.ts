import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { getWallet, saveWallet as saveWalletApi } from "../api/wallet";

// isAuthenticated controls when the query runs (waits for auth)
export function useWalletData(isAuthenticated?: MaybeRefOrGetter<boolean>) {
  const queryCache = useQueryCache();

  const { state, refetch } = useQuery({
    key: () => ["wallet"],
    query: () => getWallet(),
    staleTime: Infinity,
    enabled: () => (isAuthenticated !== undefined ? !!toValue(isAuthenticated) : true),
  });

  const { mutateAsync: saveWallet } = useMutation({
    mutation: ({ accountAddress }: { accountAddress: string }) => saveWalletApi(accountAddress),
    onSuccess: () => queryCache.invalidateQueries({ key: ["wallet"] }),
  });

  return {
    wallet: computed(() => state.value.data),
    walletStatus: computed(() => state.value.status),
    saveWallet,
    refetchWallet: refetch,
  };
}

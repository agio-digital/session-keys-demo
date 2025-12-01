import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { computed, toValue, type MaybeRefOrGetter } from "vue";
import { getWallet, saveWallet as saveWalletApi } from "../api/wallet";

// localCacheKey is optional - used for localStorage caching (e.g., Alchemy userId)
// When provided, query only runs when localCacheKey has a value (user is authenticated)
export function useWalletData(localCacheKey?: MaybeRefOrGetter<string>) {
  const queryCache = useQueryCache();
  const cacheKey = () => toValue(localCacheKey) || "";

  const { state, refetch } = useQuery({
    key: () => ["wallet", cacheKey()],
    query: () => getWallet(cacheKey() || undefined),
    staleTime: Infinity,
    // Only fetch when we have a cache key (user is authenticated with Alchemy)
    enabled: () => !!cacheKey(),
  });

  const { mutateAsync: saveWallet } = useMutation({
    mutation: ({ accountAddress }: { accountAddress: string }) =>
      saveWalletApi(accountAddress, cacheKey() || undefined),
    onSuccess: () => queryCache.invalidateQueries({ key: ["wallet", cacheKey()] }),
  });

  return {
    wallet: computed(() => state.value.data),
    saveWallet,
    refetchWallet: refetch,
  };
}

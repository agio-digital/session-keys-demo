import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { computed } from "vue";
import { getWallet, saveWallet as saveWalletApi } from "../api/wallet";

export function useWalletData(userId: string) {
  const queryCache = useQueryCache();

  const { state } = useQuery({
    key: () => ["wallet", userId],
    query: () => getWallet(userId),
    staleTime: Infinity,
  });

  const { mutate: saveWallet } = useMutation({
    mutation: ({ accountAddress }: { accountAddress: string }) =>
      saveWalletApi(userId, accountAddress),
    onSuccess: () => queryCache.invalidateQueries({ key: ["wallet", userId] }),
  });

  return {
    wallet: computed(() => state.value.data),
    saveWallet,
  };
}

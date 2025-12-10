import { useQuery, useMutation, useQueryCache } from "@pinia/colada";
import { computed, toValue, ref, type MaybeRefOrGetter } from "vue";
import { getWallet, getWallets, saveWallet as saveWalletApi } from "../api/wallet";

// isAuthenticated controls when the query runs (waits for auth)
export function useWalletData(isAuthenticated?: MaybeRefOrGetter<boolean>) {
  const queryCache = useQueryCache();
  const selectedWalletIndex = ref(0);

  // Fetch all wallets for the user
  const { state: walletsState, refetch: refetchWallets } = useQuery({
    key: () => ["wallets"],
    query: () => getWallets(),
    staleTime: Infinity,
    enabled: () => (isAuthenticated !== undefined ? !!toValue(isAuthenticated) : true),
  });

  // Fetch current selected wallet
  const { state, refetch } = useQuery({
    key: () => ["wallet", selectedWalletIndex.value],
    query: () => getWallet(selectedWalletIndex.value > 0 ? selectedWalletIndex.value : undefined),
    staleTime: Infinity,
    enabled: () => (isAuthenticated !== undefined ? !!toValue(isAuthenticated) : true),
  });

  const { mutateAsync: saveWallet } = useMutation({
    mutation: ({ accountAddress, walletIndex }: { accountAddress: string; walletIndex?: number }) =>
      saveWalletApi(accountAddress, walletIndex),
    onSuccess: () => {
      queryCache.invalidateQueries({ key: ["wallet"] });
      queryCache.invalidateQueries({ key: ["wallets"] });
    },
  });

  const selectWallet = (index: number) => {
    selectedWalletIndex.value = index;
  };

  return {
    wallet: computed(() => state.value.data),
    walletStatus: computed(() => state.value.status),
    wallets: computed(() => walletsState.value.data ?? []),
    walletsStatus: computed(() => walletsState.value.status),
    selectedWalletIndex,
    selectWallet,
    saveWallet,
    refetchWallet: refetch,
    refetchWallets,
  };
}

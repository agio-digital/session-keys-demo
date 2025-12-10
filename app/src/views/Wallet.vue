<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive } from "vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { sepolia } from "@account-kit/infra";
import { parseEther, parseUnits, encodeFunctionData, erc20Abi, type Hex, type Address } from "viem";
import { SmartWalletClient } from "agio-smart-wallet-client";
import { logger } from "../utils/logger";
import { getTokens, getNativeToken, type TokenConfig } from "../config/tokens";
import { until } from "../utils/until";
import { useWalletData } from "../composables/useWalletData";
import { useSessionData } from "../composables/useSessionData";
import { useAlchemySigner } from "../composables/useAlchemySigner";
import router from "@/router";
import { delay } from "@/utils/delay";

// Props from router
const props = defineProps<{
  walletId: number;
}>();

const { logout: auth0Logout, isLoading, isAuthenticated } = useAuth0();
const {
  isAuthenticated: isAlchemyAuthenticated,
  isInitializing,
  error: alchemyError,
  initializeSigner,
  loginWithAuth0: loginAlchemyWithAuth0,
  logout: alchemyLogout,
  signer: getAlchemySigner,
} = useAlchemySigner();

const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const ALCHEMY_GAS_POLICY_ID = import.meta.env.VITE_ALCHEMY_GAS_POLICY_ID;

if (!ALCHEMY_API_KEY) {
  throw new Error("VITE_ALCHEMY_API_KEY is required in environment variables");
}

if (!ALCHEMY_GAS_POLICY_ID) {
  throw new Error("VITE_ALCHEMY_GAS_POLICY_ID is required in environment variables");
}

// Initialize smart wallet client
const walletClient = new SmartWalletClient({
  alchemyApiKey: ALCHEMY_API_KEY,
  policyId: ALCHEMY_GAS_POLICY_ID,
  chain: sepolia,
});

const mounting = ref(true);

// Initialize Alchemy signer on mount and auto-connect if not authenticated
onMounted(async () => {
  // Wait for Auth0 to finish loading first
  await router.isReady();
  await until(() => isLoading.value === false && isInitializing.value === false);
  try {
    await initializeSigner();
    await delay(300);

    logger.info(
      {
        isAuth0Authenticated: isAuthenticated.value,
        isAlchemyAuthenticated: isAlchemyAuthenticated.value,
      },
      "Initializing Alchemy signer..."
    );

    if (!isAuthenticated.value) {
      logger.info("[Wallet] Not Auth0 authenticated");
      return;
    }

    if (!isAlchemyAuthenticated.value) {
      logger.info("[Wallet] Alchemy not authenticated, waiting for user to connect");
    }
  } catch (err) {
    logger.error({ err }, "[Wallet] Failed to initialize signer");
  } finally {
    mounting.value = false;
  }
});

// Pinia Colada auto-fetches and caches (userId determined from JWT on server)
const {
  wallet,
  walletStatus,
  wallets,
  selectedWalletIndex,
  selectWallet,
  saveWallet: saveWalletMutation,
  refetchWallets,
} = useWalletData(isAlchemyAuthenticated);

// Sync route param with selected wallet index
watch(
  () => props.walletId,
  (newId) => {
    if (newId !== selectedWalletIndex.value) {
      selectWallet(newId);
    }
  },
  { immediate: true }
);

// Navigate when wallet selection changes (from dropdown)
function navigateToWallet(index: number) {
  router.push(`/wallet/${index}`);
}

const {
  session,
  sessionStatus,
  isSessionActive,
  createSession: createSessionMutation,
  revokeSession: revokeSessionMutation,
  sendTransaction: sendTransactionMutation,
} = useSessionData(isAlchemyAuthenticated, selectedWalletIndex);

// Local UI state
const loading = ref(false);
const status = ref("");
const txHash = ref("");
const recipientAddress = ref(
  localStorage.getItem("recipientAddress") || "0x0000000000000000000000000000000000000000"
);
const amount = ref("0.00001");
const txMethod = ref<"session" | "direct">("session");
const sessionDuration = ref("24"); // hours
const isConnectingWallet = ref(false);
const lastTxHash = ref("");
const isRefreshing = ref(false);

// Token configuration from chain
const chainId = sepolia.id;
const nativeToken = getNativeToken(chainId);
const configuredTokens = getTokens(chainId);

// Token state - native + ERC20 tokens
const selectedToken = ref<string>(nativeToken.symbol);
const tokenAmounts = reactive<Record<string, string>>({
  [nativeToken.symbol]: "0.00001",
  ...Object.fromEntries(configuredTokens.map((t) => [t.symbol, "1"])),
});

// Token balances: { symbol: { balance, decimals, formatted } }
interface TokenBalance {
  balance: bigint;
  decimals: number;
  formatted: string;
}
const tokenBalances = reactive<Record<string, TokenBalance | null>>({});

// Computed for unified amount input
const unifiedAmount = computed({
  get: () => tokenAmounts[selectedToken.value] ?? "0",
  set: (val) => {
    tokenAmounts[selectedToken.value] = val;
  },
});

// Get current token's balance info
const currentTokenBalance = computed(() => {
  if (selectedToken.value === nativeToken.symbol) {
    return accountBalance.value ? { formatted: accountBalance.value } : null;
  }
  return tokenBalances[selectedToken.value];
});

// Get current token config (for ERC20s)
const currentTokenConfig = computed(() =>
  configuredTokens.find((t) => t.symbol === selectedToken.value)
);

// Persist recipient address
watch(recipientAddress, (val) => localStorage.setItem("recipientAddress", val));

// Computed from Pinia Colada queries
const accountAddress = computed(() => wallet.value?.accountAddress || "");
const hasWallet = computed(() => !!wallet.value);

// Validate data consistency: if session exists but no wallet, revoke the session
// Only run after both queries have completed to avoid race conditions
watch(
  [session, wallet, walletStatus, sessionStatus, mounting, selectedWalletIndex],
  ([sessionData, walletData, wStatus, sStatus, isMounting, walletIdx]) => {
    // Don't check during initial mount
    if (isMounting) return;

    // Wait for both queries to complete (not pending/loading)
    if (wStatus === "pending" || sStatus === "pending") return;

    if (sessionData && !walletData) {
      logger.warn({ walletIndex: walletIdx }, "Inconsistent state: session exists but no wallet found. Revoking session.");
      revokeSessionMutation({ walletIndex: walletIdx > 0 ? walletIdx : undefined });
      status.value = "Session revoked: wallet data missing. Please create a new wallet.";
    }
  }
);

// Check if account is deployed and fetch balances when account address is available
watch(
  () => accountAddress.value,
  async (address) => {
    if (address) {
      await Promise.all([checkAccountDeployed(), fetchAccountBalance(), fetchTokenBalances()]);
    }
  },
  { immediate: true }
);

async function connectAlchemyWallet() {
  isConnectingWallet.value = true;
  try {
    await loginAlchemyWithAuth0({ mode: "redirect" });
  } catch (err: any) {
    status.value = `Wallet connection error: ${err.message}`;
    isConnectingWallet.value = false;
  }
}

async function createWallet(isAdditional = false) {
  if (hasWallet.value && !isAdditional) {
    status.value = "Wallet already exists";
    return;
  }

  const alchemySigner = getAlchemySigner();
  if (!alchemySigner) {
    status.value = "Please connect your wallet first";
    return;
  }

  try {
    loading.value = true;

    // For additional wallets, use next index
    const nextIndex = isAdditional ? wallets.value.length : 0;

    status.value = isAdditional
      ? `Creating additional wallet #${nextIndex}...`
      : "Creating wallet via Alchemy Wallet API...";

    logger.info({ walletIndex: nextIndex }, "Creating wallet");

    // Pass walletIndex to Alchemy SDK - walletIndex > 0 uses creationHint with salt for different address
    const address = await walletClient.createWallet(alchemySigner, { walletIndex: nextIndex });

    // Save wallet data to server with walletIndex
    status.value = "Saving wallet to server...";
    await saveWalletMutation({ accountAddress: address, walletIndex: nextIndex });
    await refetchWallets();

    // Navigate to the new wallet (this also updates selection via route watcher)
    router.push(`/wallet/${nextIndex}`);

    status.value = `Wallet ${isAdditional ? `#${nextIndex}` : ""} created: ${address}`;
    logger.info({ accountAddress: address, walletIndex: nextIndex }, "Wallet created and saved to server");
  } catch (error: any) {
    logger.error({ error }, "Wallet creation error");
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

// Check if account is deployed on-chain
const isAccountDeployed = ref(false);
const accountBalance = ref<string | null>(null);

async function checkAccountDeployed() {
  if (!accountAddress.value) return false;

  try {
    const deployed = await walletClient.isAccountDeployed(accountAddress.value as `0x${string}`);
    isAccountDeployed.value = deployed;
    return deployed;
  } catch (error) {
    logger.error({ error }, "Failed to check account deployment");
    return false;
  }
}

async function fetchAccountBalance() {
  if (!accountAddress.value) {
    accountBalance.value = null;
    return;
  }

  try {
    const wei = await walletClient.getBalance(accountAddress.value as `0x${string}`);
    const eth = Number(wei) / 1e18;
    accountBalance.value = eth.toFixed(6);
  } catch (error) {
    logger.error({ error }, "Failed to fetch account balance");
  }
}

async function fetchTokenBalances() {
  if (!accountAddress.value) {
    // Clear all token balances
    for (const token of configuredTokens) {
      tokenBalances[token.symbol] = null;
    }
    return;
  }

  try {
    // Fetch all token balances in parallel using getTokenInfo
    const results = await Promise.all(
      configuredTokens.map(async (token) => {
        const info = await walletClient.getTokenInfo(
          accountAddress.value as Address,
          token.address as Address
        );
        return { symbol: token.symbol, info };
      })
    );

    // Update reactive state
    for (const { symbol, info } of results) {
      tokenBalances[symbol] = {
        balance: info.balance,
        decimals: info.decimals,
        formatted: parseFloat(info.formatted).toFixed(Math.min(info.decimals, 6)),
      };
    }
  } catch (error) {
    logger.error({ error }, "Failed to fetch token balances");
  }
}

async function createSession() {
  const alchemySigner = getAlchemySigner();
  if (!alchemySigner || !accountAddress.value) {
    status.value = "Please login and create a wallet first";
    return;
  }

  try {
    loading.value = true;
    status.value = "Creating session via SDK grantPermissions...";

    const durationHours = parseInt(sessionDuration.value);
    const walletIdx = selectedWalletIndex.value;

    const result = await walletClient.createSession(
      alchemySigner,
      accountAddress.value as `0x${string}`,
      {
        expiryHours: durationHours,
        permissions: [{ type: "root" }],
        walletIndex: walletIdx,  // Pass walletIndex for creationHint with salt
      }
    );

    // Store session data on server with walletIndex
    await createSessionMutation({
      sessionId: result.sessionId,
      sessionKey: result.sessionKey,
      sessionKeyAddress: result.sessionKeyAddress,
      accountAddress: accountAddress.value,
      signature: result.signature,
      permissionsContext: result.permissionsContext,
      permissions: result.permissions,
      expiresAt: result.expiresAt,
      walletIndex: walletIdx,
    });

    status.value = `Session created: ${result.sessionId}`;
    logger.info({ sessionId: result.sessionId, walletIndex: walletIdx }, "Session created");
  } catch (error: any) {
    logger.error({ error }, "Session creation error");
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

// Test: Send transaction directly from frontend using main signer (no session key)
// This tests if the account can send transactions at all
async function sendDirectTransaction() {
  const alchemySigner = getAlchemySigner();
  if (!alchemySigner || !accountAddress.value) {
    status.value = "Please login and create a wallet first";
    return;
  }

  try {
    loading.value = true;
    txHash.value = "";
    status.value = "Sending direct transaction (main signer)...";

    const hash = await walletClient.sendDirectTransaction(alchemySigner, {
      to: recipientAddress.value as `0x${string}`,
      value: amount.value,
    });

    txHash.value = hash;
    status.value = "Direct transaction sent!";
    logger.info({ txHash: txHash.value }, "Direct transaction completed");
  } catch (error: any) {
    logger.error({ error }, "Direct transaction error");
    status.value = `Direct TX Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

async function sendSessionTransaction() {
  if (!isSessionActive.value) {
    status.value = "Please create a session first";
    return;
  }

  try {
    loading.value = true;
    txHash.value = "";
    status.value = "Sending transaction via session key...";

    const walletIdx = selectedWalletIndex.value;
    const result = await sendTransactionMutation({
      to: recipientAddress.value,
      value: parseEther(amount.value).toString(),
      data: "0x",
      walletIndex: walletIdx > 0 ? walletIdx : undefined,
    });

    txHash.value = result.transactionHash;
    status.value = "Transaction sent!";
    logger.info({ txHash: txHash.value, walletIndex: walletIdx }, "Session key transaction completed");
  } catch (error: any) {
    logger.error({ error }, "Transaction error");
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

async function handleSendTransaction() {
  if (txMethod.value === "session") {
    await sendSessionTransaction();
  } else {
    await sendDirectTransaction();
  }
}

// Generic ERC20 Transfer encoding using viem's erc20Abi
function encodeErc20Transfer(to: Address, amount: bigint): Hex {
  return encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [to, amount],
  });
}

// Generic token send - works for any configured ERC20
async function sendDirectTokenTransaction(tokenConfig: TokenConfig) {
  const alchemySigner = getAlchemySigner();
  if (!alchemySigner || !accountAddress.value) {
    status.value = "Please login and create a wallet first";
    return null;
  }

  try {
    loading.value = true;
    status.value = `Sending ${tokenConfig.symbol} direct transaction...`;

    const tokenBalance = tokenBalances[tokenConfig.symbol];
    const decimals = tokenBalance?.decimals ?? tokenConfig.decimals ?? 18;
    const amountValue = tokenAmounts[tokenConfig.symbol] ?? "0";
    const amountInSmallestUnit = parseUnits(amountValue, decimals);

    const transferData = encodeErc20Transfer(
      recipientAddress.value as Address,
      amountInSmallestUnit
    );

    const hash = await walletClient.sendDirectTransaction(alchemySigner, {
      to: tokenConfig.address,
      value: "0",
      data: transferData,
    });

    status.value = `${tokenConfig.symbol} sent!`;
    logger.info({ txHash: hash, token: tokenConfig.symbol }, "Direct token transaction completed");
    return hash;
  } catch (error: any) {
    logger.error({ error, token: tokenConfig.symbol }, "Direct token transaction error");
    status.value = `${tokenConfig.symbol} TX Error: ${error.message}`;
    return null;
  } finally {
    loading.value = false;
  }
}

async function sendSessionTokenTransaction(tokenConfig: TokenConfig) {
  if (!isSessionActive.value) {
    status.value = "Please create a session first";
    return null;
  }

  try {
    loading.value = true;
    status.value = `Sending ${tokenConfig.symbol} via session key...`;

    const tokenBalance = tokenBalances[tokenConfig.symbol];
    const decimals = tokenBalance?.decimals ?? tokenConfig.decimals ?? 18;
    const amountValue = tokenAmounts[tokenConfig.symbol] ?? "0";
    const amountInSmallestUnit = parseUnits(amountValue, decimals);

    const transferData = encodeErc20Transfer(
      recipientAddress.value as Address,
      amountInSmallestUnit
    );

    const walletIdx = selectedWalletIndex.value;
    const result = await sendTransactionMutation({
      to: tokenConfig.address,
      value: "0",
      data: transferData,
      walletIndex: walletIdx > 0 ? walletIdx : undefined,
    });

    status.value = `${tokenConfig.symbol} sent!`;
    logger.info({ txHash: result.transactionHash, token: tokenConfig.symbol, walletIndex: walletIdx }, "Session token transaction completed");
    return result.transactionHash;
  } catch (error: any) {
    logger.error({ error, token: tokenConfig.symbol }, "Session token transaction error");
    status.value = `${tokenConfig.symbol} TX Error: ${error.message}`;
    return null;
  } finally {
    loading.value = false;
  }
}

async function refreshBalances() {
  isRefreshing.value = true;
  try {
    await Promise.all([fetchAccountBalance(), fetchTokenBalances()]);
  } finally {
    isRefreshing.value = false;
  }
}

async function handleUnifiedSend() {
  let hash: string | null = null;

  if (selectedToken.value === nativeToken.symbol) {
    // Native token (ETH)
    await handleSendTransaction();
    hash = txHash.value;
  } else {
    // ERC20 token
    const tokenConfig = currentTokenConfig.value;
    if (!tokenConfig) {
      status.value = "Token configuration not found";
      return;
    }

    if (txMethod.value === "session") {
      hash = await sendSessionTokenTransaction(tokenConfig);
    } else {
      hash = await sendDirectTokenTransaction(tokenConfig);
    }
  }

  if (hash) {
    lastTxHash.value = hash;
    await refreshBalances();
  }
}

async function revokeSession() {
  if (!isSessionActive.value) {
    return;
  }

  try {
    loading.value = true;
    const walletIdx = selectedWalletIndex.value;
    status.value = `Revoking session for wallet #${walletIdx}...`;

    await revokeSessionMutation({ walletIndex: walletIdx > 0 ? walletIdx : undefined });

    status.value = "Session revoked";
    logger.info({ walletIndex: walletIdx }, "Session revoked");
  } catch (error: any) {
    logger.error({ error }, "Revoke error");
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

async function resetWallet() {
  try {
    loading.value = true;
    const walletIdx = selectedWalletIndex.value;
    status.value = `Revoking session for wallet #${walletIdx}...`;

    if (session.value) {
      await revokeSessionMutation({ walletIndex: walletIdx > 0 ? walletIdx : undefined });
    }

    window.location.reload();
  } catch (error: any) {
    logger.error({ error }, "Reset wallet error");
    status.value = `Reset error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

const handleLogout = async () => {
  await alchemyLogout();
  await auth0Logout({ logoutParams: { returnTo: window.location.origin } });
};

const timeoutRef = ref<ReturnType<typeof setTimeout> | null>(null);

const unload = () => {
  mounting.value = true;
  timeoutRef.value = setTimeout(() => {
    mounting.value = false;
  }, 3000);
};

onMounted(() => {
  window.addEventListener("beforeunload", unload);
});

onUnmounted(() => {
  window.removeEventListener("beforeunload", unload);
  clearTimeout(timeoutRef.value!);
});
</script>

<template>
  <main v-if="mounting" class="container">
    <p aria-busy="true">Loading...</p>
  </main>
  <main v-else-if="isInitializing" class="container">
    <p aria-busy="true">Initializing wallet...</p>
  </main>

  <!-- Error state: Auth0 logged in but Alchemy not connected -->
  <main v-else-if="!isAlchemyAuthenticated" class="container">
    <nav>
      <ul>
        <li><strong>Agio Smart Wallet</strong></li>
      </ul>
      <ul>
        <li><a href="#/home">Home</a></li>
        <li><a href="#/wallet">Wallet</a></li>
        <li><button class="secondary outline" @click="handleLogout">Logout</button></li>
      </ul>
    </nav>

    <article style="text-align: center">
      <h2>Wallet Connection Required</h2>
      <p>You need to connect your Alchemy wallet to access this page.</p>
      <button
        @click="connectAlchemyWallet"
        :aria-busy="isConnectingWallet"
        :disabled="isConnectingWallet"
      >
        {{ isConnectingWallet ? "Connecting..." : "Connect Wallet" }}
      </button>
      <p v-if="alchemyError" role="alert" style="color: var(--pico-color-red-500); margin-top: 1rem">
        {{ alchemyError }}
      </p>
      <p v-else-if="status" role="alert" style="color: var(--pico-color-red-500); margin-top: 1rem">
        {{ status }}
      </p>
    </article>
  </main>

  <!-- Main wallet UI when fully authenticated -->
  <main v-else class="container">
    <nav>
      <ul>
        <li><strong>Agio Smart Wallet</strong></li>
      </ul>
      <ul>
        <li><a href="#/home">Home</a></li>
        <li><a href="#/wallet">Wallet</a></li>
        <li><button class="secondary outline" @click="handleLogout">Logout</button></li>
      </ul>
    </nav>

    <article>
      <h3>1. Smart Wallet</h3>

      <!-- Wallet Selector (only show if multiple wallets) -->
      <div v-if="wallets.length > 1" style="margin-bottom: 1rem">
        <label>
          Select Wallet
          <select :value="selectedWalletIndex" @change="(e) => navigateToWallet(Number((e.target as HTMLSelectElement).value))">
            <option v-for="w in wallets" :key="w.walletIndex" :value="w.walletIndex">
              Wallet #{{ w.walletIndex }} - {{ w.accountAddress.slice(0, 8) }}...{{ w.accountAddress.slice(-6) }}
            </option>
          </select>
        </label>
        <button @click="() => createWallet(true)" :disabled="loading" class="outline" style="margin-top: 0.5rem; width: auto; padding: 0.5rem 1rem;">
          + Add Wallet
        </button>
      </div>

      <div v-else role="group">
        <button @click="() => createWallet(false)" :disabled="loading || hasWallet">
          {{ hasWallet ? "Wallet Created" : "Create Wallet" }}
        </button>
        <button v-if="hasWallet" @click="() => createWallet(true)" :disabled="loading" class="outline">
          + Add Wallet
        </button>
        <button v-if="hasWallet" @click="resetWallet" :disabled="loading" class="secondary">
          Clear &amp; Revoke
        </button>
      </div>

      <p v-if="accountAddress">
        <small>
          <strong>Wallet #{{ selectedWalletIndex }}:</strong> <code>{{ accountAddress }}</code>
          &nbsp;
          <mark v-if="isAccountDeployed">Deployed</mark>
          <ins v-else>Counterfactual</ins>
        </small>
      </p>
      <p v-if="wallets.length > 1">
        <small>Total wallets: {{ wallets.length }}</small>
      </p>
    </article>

    <article>
      <h3>2. Session Key</h3>
      <label v-if="!isSessionActive"
        >Expiry
        <select v-model="sessionDuration">
          <option value="1">1 hour</option>
          <option value="6">6 hours</option>
          <option value="24">24 hours</option>
          <option value="168">7 days</option>
          <option value="720">30 days</option>
          <option value="8760">1 year</option>
          <option value="0">Never</option>
        </select>
      </label>
      <div role="group">
        <button @click="createSession" :disabled="loading || !accountAddress || isSessionActive">
          {{ isSessionActive ? "Active" : "Create" }}
        </button>
        <button
          @click="revokeSession"
          :disabled="loading || !isSessionActive"
          class="secondary"
        >
          Revoke
        </button>
      </div>
      <p v-if="session?.sessionId">
        <small
          ><strong>Session:</strong> <code>{{ session.sessionId }}</code>
          &nbsp;
          <mark v-if="isSessionActive">Active</mark>
          <ins v-else>Expired</ins></small
        >
      </p>
    </article>

    <!-- Balances Card -->
    <article v-if="accountAddress">
      <header>
        <h3>Balances</h3>
        <button class="outline secondary" style="padding: 0.25rem 0.5rem; margin: 0" @click="refreshBalances" :aria-busy="isRefreshing">↻</button>
      </header>
      <div class="grid">
        <!-- Native Token -->
        <div>
          <small>{{ nativeToken.symbol }}</small>
          <div><strong>{{ accountBalance ?? '—' }}</strong></div>
        </div>
        <!-- ERC20 Tokens -->
        <div v-for="token in configuredTokens" :key="token.symbol">
          <small>{{ token.symbol }}</small>
          <div><strong>{{ tokenBalances[token.symbol]?.formatted ?? '—' }}</strong></div>
        </div>
      </div>
    </article>

    <!-- Unified Send Transaction -->
    <article>
      <h3>3. Send Transaction</h3>

      <div class="grid">
        <label>
          Token
          <select v-model="selectedToken">
            <option :value="nativeToken.symbol">{{ nativeToken.symbol }}</option>
            <option v-for="token in configuredTokens" :key="token.symbol" :value="token.symbol">
              {{ token.symbol }}
            </option>
          </select>
        </label>
        <label>
          Signing Method
          <select v-model="txMethod" :disabled="!isSessionActive && txMethod === 'session'">
            <option value="session" :disabled="!isSessionActive">Session Key</option>
            <option value="direct">Direct (MPC)</option>
          </select>
        </label>
      </div>

      <label>
        Recipient
        <input v-model="recipientAddress" type="text" placeholder="0x..." />
      </label>

      <label>
        Amount
        <input
          v-model="unifiedAmount"
          type="text"
          :placeholder="selectedToken === nativeToken.symbol ? '0.00001' : '1'"
        />
        <small
          v-if="currentTokenBalance"
          style="cursor: pointer; color: var(--pico-primary)"
          @click="unifiedAmount = currentTokenBalance.formatted"
        >
          Available: {{ currentTokenBalance.formatted }} {{ selectedToken }}
        </small>
      </label>

      <button
        @click="handleUnifiedSend"
        :disabled="loading || !accountAddress || (txMethod === 'session' && !isSessionActive)"
        :aria-busy="loading"
      >
        Send {{ selectedToken }}
      </button>

      <p v-if="lastTxHash">
        <small>
          <a :href="`https://sepolia.etherscan.io/tx/${lastTxHash}`" target="_blank" style="font-family: monospace">
            {{ lastTxHash.slice(0, 10) }}...{{ lastTxHash.slice(-8) }}
          </a>
        </small>
      </p>
      <p v-if="currentTokenConfig">
        <small>Contract: <code>{{ currentTokenConfig.address }}</code></small>
      </p>
    </article>

    <div v-if="status" class="toast" @click="status = ''">
      {{ status }}
    </div>

    <footer>
      <small>Sepolia testnet • Gas sponsored by Alchemy</small>
    </footer>
    <br>
  </main>
</template>

<style scoped>
/* Toast notification - only custom style needed */
.toast {
  position: fixed;
  bottom: 1rem;
  right: 1rem;
  background: var(--pico-contrast);
  color: var(--pico-contrast-inverse);
  padding: 1rem;
  border-radius: var(--pico-border-radius);
  cursor: pointer;
  max-width: 400px;
  z-index: 1000;
}

/* Flex header for balance card */
article > header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

article > header h3 {
  margin: 0;
}
</style>

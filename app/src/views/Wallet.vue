<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { sepolia, alchemy } from "@account-kit/infra";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseEther, toHex } from "viem";
import { logger } from "../utils/logger";
import { until } from "../utils/until";
import { useWalletData } from "../composables/useWalletData";
import { useSessionData } from "../composables/useSessionData";
import { useAlchemySigner } from "../composables/useAlchemySigner";
import { getWalletFromServer } from "../api/wallet";
import router from "@/router";
import { delay } from "@/utils/delay";

const { logout: auth0Logout, isLoading, isAuthenticated } = useAuth0();
const {
  user,
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

    // If Alchemy authenticated, sync wallet to server if needed
    if (isAlchemyAuthenticated.value) {
      logger.info("[Wallet] Alchemy authenticated, checking wallet sync");
      await syncWalletToServer();
    } else {
      // Don't auto-redirect - let user click "Connect Wallet" button
      logger.info("[Wallet] Alchemy not authenticated, waiting for user to connect");
    }
  } catch (err) {
    logger.error({ err }, "[Wallet] Failed to initialize signer");
  } finally {
    mounting.value = false;
  }
});

// Use Alchemy user ID for localStorage caching only
const alchemyUserId = computed(() => user.value?.userId || user.value?.address || "");

// Pinia Colada auto-fetches and caches (userId determined from JWT on server)
// Queries only run when alchemyUserId/isAlchemyAuthenticated have values
const { wallet, saveWallet: saveWalletMutation } = useWalletData(alchemyUserId);
const {
  session,
  isSessionActive,
  createSession: createSessionMutation,
  revokeSession: revokeSessionMutation,
  sendTransaction: sendTransactionMutation,
} = useSessionData(isAlchemyAuthenticated);

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

// Persist recipient address
watch(recipientAddress, (val) => localStorage.setItem("recipientAddress", val));

// Sync local wallet to server if it exists locally but not on server
async function syncWalletToServer() {
  const localCacheKey = alchemyUserId.value;
  if (!localCacheKey) return;

  const localData = localStorage.getItem(`wallet_${localCacheKey}`);
  if (!localData) return;

  const localWallet = JSON.parse(localData);
  const serverWallet = await getWalletFromServer();

  if (localWallet.accountAddress && !serverWallet) {
    logger.info({ accountAddress: localWallet.accountAddress }, "[Wallet] Syncing local wallet to server");
    status.value = "Syncing wallet to server...";
    try {
      await saveWalletMutation({ accountAddress: localWallet.accountAddress });
      status.value = "Wallet synced to server";
      logger.info("[Wallet] Wallet synced to server successfully");
    } catch (err: any) {
      logger.error({ err }, "[Wallet] Failed to sync wallet to server");
      status.value = `Failed to sync wallet: ${err.message}`;
    }
  }
}

// Computed from Pinia Colada queries
const accountAddress = computed(() => wallet.value?.accountAddress || "");
const hasWallet = computed(() => !!wallet.value);

// Validate data consistency: if session exists but no wallet, revoke the session
// Only run after initial mount completes to avoid race with async queries
watch([session, wallet, mounting], ([sessionData, walletData, isMounting]) => {
  // Don't check during initial mount - wait for queries to complete
  if (isMounting) return;

  if (sessionData && !walletData) {
    logger.warn("Inconsistent state: session exists but no wallet found. Revoking session.");
    revokeSessionMutation();
    status.value = "Session revoked: wallet data missing. Please create a new wallet.";
  }
});

// Check if account is deployed and fetch balance when account address is available
watch(
  () => accountAddress.value,
  async (address) => {
    if (address) {
      await Promise.all([checkAccountDeployed(), fetchAccountBalance()]);
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

async function createWallet() {
  if (hasWallet.value) {
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
    status.value = "Creating wallet via Alchemy Wallet API...";

    // Create smart wallet client with Alchemy's Wallet API
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
      chain: sepolia,
      signer: alchemySigner,
      policyId: ALCHEMY_GAS_POLICY_ID,
    });

    // Request account from Alchemy - counterfactual until first transaction
    status.value = "Registering account with Alchemy...";
    const account = await client.requestAccount();
    const address = account.address;

    // Save wallet data to server (required for session key transactions)
    status.value = "Saving wallet to server...";
    await saveWalletMutation({ accountAddress: address });

    status.value = `Wallet created: ${address}`;
    logger.info({ accountAddress: address }, "Wallet created and saved to server");
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
    // Check bytecode at account address
    const response = await fetch(`https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getCode",
        params: [accountAddress.value, "latest"],
      }),
    });
    const data = await response.json();
    const hasCode = data.result && data.result !== "0x" && data.result !== "0x0";
    isAccountDeployed.value = hasCode;
    return hasCode;
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
    const response = await fetch(`https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_getBalance",
        params: [accountAddress.value, "latest"],
      }),
    });
    const data = await response.json();
    if (data.result) {
      // Convert hex wei to ETH with 6 decimal places
      const wei = BigInt(data.result);
      const eth = Number(wei) / 1e18;
      accountBalance.value = eth.toFixed(6);
    }
  } catch (error) {
    logger.error({ error }, "Failed to fetch account balance");
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

    // Generate session key locally
    const sessionPrivateKey = generatePrivateKey();
    const sessionKeyAccount = privateKeyToAccount(sessionPrivateKey);
    const durationMs = parseInt(sessionDuration.value) * 60 * 60 * 1000;
    const expiresAt = Date.now() + durationMs;
    const expirySec = Math.floor(expiresAt / 1000);

    // Create smart wallet client with AlchemyWebSigner
    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
      chain: sepolia,
      signer: alchemySigner,
      policyId: ALCHEMY_GAS_POLICY_ID,
    });

    // Request account to associate signer with account
    const account = await client.requestAccount();

    // Use SDK's grantPermissions - expects ADDRESS as "publicKey" for secp256k1
    const permissions = await client.grantPermissions({
      account: account.address,
      expirySec,
      key: {
        publicKey: sessionKeyAccount.address,
        type: "secp256k1",
      },
      permissions: [{ type: "root" }],
    });

    // Extract sessionId from context (context = 0x00 + sessionId + signature)
    const sessionId = `0x${permissions.context.slice(4, 36)}`;
    const signature = `0x${permissions.context.slice(36)}`;

    // Store session data on server
    await createSessionMutation({
      sessionId,
      sessionKey: sessionPrivateKey,
      sessionKeyAddress: sessionKeyAccount.address, // Also store address for verification
      accountAddress: accountAddress.value,
      signature,
      permissionsContext: permissions.context, // Store the full context
      permissions: [{ type: "root" }],
      expiresAt,
    });

    status.value = `Session created: ${sessionId}`;
    logger.info({ sessionId }, "Session created");
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

    const client = createSmartWalletClient({
      transport: alchemy({ apiKey: ALCHEMY_API_KEY }),
      chain: sepolia,
      signer: alchemySigner,
      policyId: ALCHEMY_GAS_POLICY_ID,
    });

    const account = await client.requestAccount();
    const valueHex = toHex(parseEther(amount.value));

    // Prepare, sign, and send
    const preparedCalls = await client.prepareCalls({
      from: account.address,
      calls: [
        {
          to: recipientAddress.value as `0x${string}`,
          value: valueHex,
          data: "0x" as `0x${string}`,
        },
      ],
      capabilities: {
        paymasterService: { policyId: ALCHEMY_GAS_POLICY_ID },
      },
    });

    const signedCalls = await client.signPreparedCalls(preparedCalls);
    const result = await client.sendPreparedCalls(signedCalls);

    // Wait for confirmation
    const callId = result.preparedCallIds[0];
    if (callId) {
      status.value = "Waiting for confirmation...";
      const txResult = await client.waitForCallsStatus({ id: callId });
      txHash.value = txResult.receipts?.[0]?.transactionHash || callId;
    }

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

    const result = await sendTransactionMutation({
      to: recipientAddress.value,
      value: parseEther(amount.value).toString(),
      data: "0x",
    });

    txHash.value = result.transactionHash;
    status.value = "Transaction sent!";
    logger.info({ txHash: txHash.value }, "Session key transaction completed");
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

async function revokeSession() {
  if (!isSessionActive.value) {
    return;
  }

  try {
    loading.value = true;
    status.value = "Revoking session...";

    await revokeSessionMutation();

    status.value = "Session revoked";
  } catch (error: any) {
    logger.error({ error }, "Revoke error");
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

async function resetWallet() {
  if (!alchemyUserId.value) return;

  try {
    loading.value = true;
    status.value = "Resetting wallet...";

    // Clear local storage for this user
    localStorage.removeItem(`wallet_${alchemyUserId.value}`);

    // Also revoke any existing session
    if (session.value) {
      await revokeSessionMutation();
    }

    // Force refresh wallet data (will return null now)
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
      <h3>1. Create Smart Wallet</h3>
      <div role="group">
        <button @click="createWallet" :disabled="loading || !!accountAddress">
          {{ accountAddress ? "Wallet Created" : "Create Wallet" }}
        </button>
        <button v-if="hasWallet" @click="resetWallet" :disabled="loading" class="secondary">
          Clear &amp; Revoke
        </button>
      </div>
      <p v-if="accountAddress">
        <small
          ><strong>Wallet:</strong> <code>{{ accountAddress }}</code>
          &nbsp;
          <mark v-if="isAccountDeployed">Deployed</mark>
          <ins v-else>Counterfactual</ins></small
        >
      </p>
    </article>

    <article>
      <h3>2. Session Key</h3>
      <label v-if="!isSessionActive"
        >Duration
        <select v-model="sessionDuration">
          <option value="1">1 hour</option>
          <option value="6">6 hours</option>
          <option value="24">24 hours</option>
          <option value="168">7 days</option>
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

    <article>
      <h3>3. Send Transaction</h3>
      <label
        >To Address
        <input v-model="recipientAddress" type="text" placeholder="0x..." />
      </label>
      <label
        >Amount (ETH)
        <input v-model="amount" type="text" placeholder="0.00001" />
        <small v-if="accountBalance !== null" style="cursor: pointer" @click="amount = accountBalance"
          >Balance: {{ accountBalance }} ETH</small
        >
      </label>
      <fieldset>
        <legend>Signing Method</legend>
        <label>
          <input
            type="radio"
            name="txMethod"
            value="session"
            v-model="txMethod"
            :disabled="!isSessionActive"
          />
          Session Key
        </label>
        <label>
          <input type="radio" name="txMethod" value="direct" v-model="txMethod" />
          Direct (Main Signer)
        </label>
      </fieldset>
      <button
        @click="handleSendTransaction"
        :disabled="loading || !accountAddress || (txMethod === 'session' && !isSessionActive)"
      >
        Send
      </button>
      <p v-if="txHash">
        <a :href="`https://sepolia.etherscan.io/tx/${txHash}`" target="_blank">{{ txHash }}</a>
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
</style>

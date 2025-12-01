<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { createSmartWalletClient } from "@account-kit/wallet-client";
import { sepolia, alchemy } from "@account-kit/infra";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { parseEther, toHex } from "viem";
import { logger } from "../utils/logger";
import { useWalletData } from "../composables/useWalletData";
import { useSessionData } from "../composables/useSessionData";
import { useAlchemySigner } from "../composables/useAlchemySigner";

const router = useRouter();
const { user, isAuthenticated, logout: alchemyLogout, signer: getAlchemySigner } = useAlchemySigner();

const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;
const ALCHEMY_GAS_POLICY_ID = import.meta.env.VITE_ALCHEMY_GAS_POLICY_ID;

if (!ALCHEMY_API_KEY) {
  throw new Error("VITE_ALCHEMY_API_KEY is required in environment variables");
}

if (!ALCHEMY_GAS_POLICY_ID) {
  throw new Error("VITE_ALCHEMY_GAS_POLICY_ID is required in environment variables");
}

// Use Alchemy user ID (orgId + address combination)
const userId = computed(() => user.value?.userId || user.value?.address || "");

// Redirect to login if not authenticated
watch(
  () => isAuthenticated.value,
  (authenticated) => {
    if (!authenticated) {
      router.push("/");
    }
  },
  { immediate: true }
);

// Pinia Colada auto-fetches and caches with reactive keys
const { wallet, saveWallet: saveWalletMutation } = useWalletData(userId.value);
const {
  session,
  isSessionActive,
  createSession: createSessionMutation,
  revokeSession: revokeSessionMutation,
  sendTransaction: sendTransactionMutation,
} = useSessionData(userId.value);

// Local UI state
const loading = ref(false);
const status = ref("");
const txHash = ref("");
const recipientAddress = ref(localStorage.getItem("recipientAddress") || "0x0000000000000000000000000000000000000000");
const amount = ref("0.00001");

// Persist recipient address
watch(recipientAddress, (val) => localStorage.setItem("recipientAddress", val));

// Computed from Pinia Colada queries
const accountAddress = computed(() => wallet.value?.accountAddress || "");
const hasWallet = computed(() => !!wallet.value);

// Validate data consistency: if session exists but no wallet, revoke the session
watch(
  [session, wallet],
  ([sessionData, walletData]) => {
    if (sessionData && !walletData) {
      logger.warn("Inconsistent state: session exists but no wallet found. Revoking session.");
      revokeSessionMutation();
      status.value = "Session revoked: wallet data missing. Please create a new wallet.";
    }
  },
  { immediate: true }
);

// Check if account is deployed when account address is available
watch(
  () => accountAddress.value,
  async (address) => {
    if (address) {
      await checkAccountDeployed();
    }
  },
  { immediate: true }
);

async function createWallet() {
  if (hasWallet.value) {
    status.value = "Wallet already exists";
    return;
  }

  const alchemySigner = getAlchemySigner();
  if (!alchemySigner) {
    status.value = "Please login first";
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

    // Save wallet data (no private key needed - Alchemy manages it)
    await saveWalletMutation({ accountAddress: address });

    status.value = `Wallet created: ${address}`;
    logger.info({ accountAddress: address }, "Wallet created");
  } catch (error: any) {
    logger.error({ error }, "Wallet creation error");
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

// Check if account is deployed on-chain
const isAccountDeployed = ref(false);

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
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
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
      calls: [{
        to: recipientAddress.value as `0x${string}`,
        value: valueHex,
        data: "0x" as `0x${string}`,
      }],
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

async function sendTransaction() {
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
  if (!userId.value) return;

  try {
    loading.value = true;
    status.value = "Resetting wallet...";

    // Clear local storage for this user
    localStorage.removeItem(`wallet_${userId.value}`);

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
  router.push("/");
};
</script>

<template>
  <main class="container">
    <nav>
      <ul>
        <li><strong>Agio Smart Wallet</strong></li>
      </ul>
      <ul>
        <li><small>{{ user?.email || user?.name }}</small></li>
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
          Reset
        </button>
      </div>
      <p v-if="accountAddress">
        <small><strong>Account:</strong> <code>{{ accountAddress }}</code></small>
        <br />
        <mark v-if="isAccountDeployed">Deployed</mark>
        <ins v-else>Counterfactual (deploys on first tx)</ins>
      </p>
    </article>

    <article>
      <h3>2. Session Key</h3>
      <div role="group">
        <button @click="createSession" :disabled="loading || !accountAddress || isSessionActive">
          {{ isSessionActive ? "Active" : "Create" }}
        </button>
        <button @click="revokeSession" :disabled="loading || !isSessionActive" class="pico-background-red-500">
          Revoke
        </button>
      </div>
      <p v-if="session?.sessionId">
        <small><code>{{ session.sessionId }}</code></small>
      </p>
    </article>

    <article>
      <h3>3. Send Transaction</h3>
      <label>To Address
        <input v-model="recipientAddress" type="text" placeholder="0x..." />
      </label>
      <label>Amount (ETH)
        <input v-model="amount" type="text" placeholder="0.00001" />
      </label>
      <div role="group">
        <button @click="sendTransaction" :disabled="loading || !isSessionActive">
          Session Key
        </button>
        <button @click="sendDirectTransaction" :disabled="loading || !accountAddress" class="secondary">
          Direct
        </button>
      </div>
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

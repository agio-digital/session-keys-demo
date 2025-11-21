<script setup lang="ts">
import { ref, computed } from "vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { createModularAccountAlchemyClient } from "@alchemy/aa-alchemy";
import { LocalAccountSigner, type SmartAccountSigner } from "@alchemy/aa-core";
import { sepolia } from "viem/chains";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const { user, logout } = useAuth0();

// Validate required environment variables
const API_URL = import.meta.env.VITE_API_URL;
const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;

if (!API_URL) {
  throw new Error("VITE_API_URL is required in environment variables");
}

if (!ALCHEMY_API_KEY) {
  throw new Error("VITE_ALCHEMY_API_KEY is required in environment variables");
}

// State
const userSigner = ref<SmartAccountSigner | null>(null);
const accountAddress = ref<string>("");
const sessionKey = ref<string>("");
const sessionId = ref<string>("");
const sessionActive = ref(false);
const loading = ref(false);
const status = ref("");
const txHash = ref("");
const recipientAddress = ref("0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb");
const amount = ref("0.001");

const userId = computed(() => user.value?.sub || "");

async function createWallet() {
  try {
    loading.value = true;
    status.value = "Creating wallet...";

    // Generate a random EOA as the owner
    const privateKey = generatePrivateKey();
    const owner = privateKeyToAccount(privateKey);

    // Create signer
    const signer = new LocalAccountSigner(owner);
    userSigner.value = signer;

    // Create Alchemy Modular Account
    const client = await createModularAccountAlchemyClient({
      apiKey: ALCHEMY_API_KEY,
      chain: sepolia,
      signer,
    });

    accountAddress.value = client.getAddress();
    status.value = `Wallet created: ${accountAddress.value}`;

    console.log("Wallet created:", accountAddress.value);
    console.log("Owner EOA:", owner.address);
  } catch (error: any) {
    console.error("Wallet creation error:", error);
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

async function createSession() {
  if (!userSigner.value || !accountAddress.value) {
    status.value = "Please create a wallet first";
    return;
  }

  try {
    loading.value = true;
    status.value = "Creating session key...";

    // Generate session key (temporary private key)
    const sessionPrivateKey = generatePrivateKey();
    sessionKey.value = sessionPrivateKey;

    // Create session ID
    const newSessionId = "session-" + Math.random().toString(36).slice(2, 11);
    sessionId.value = newSessionId;

    // Define permissions
    const permissions = [
      {
        type: "native-token-transfer",
        data: {
          maxAmount: "1000000000000000000", // 1 ETH max
        },
      },
    ];

    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days

    // Sign session authorization message
    const message = `Authorize session ${newSessionId} until ${new Date(expiresAt).toISOString()}`;
    const signature = await userSigner.value.signMessage(message);

    // Send to backend
    const response = await fetch(`${API_URL}/api/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId.value,
        sessionId: newSessionId,
        sessionKey: sessionPrivateKey,
        accountAddress: accountAddress.value,
        signature,
        permissions,
        expiresAt,
      }),
    });

    const data = await response.json();

    if (data.ok) {
      sessionActive.value = true;
      status.value = `Session created: ${newSessionId}`;
      console.log("Session created:", data);
    } else {
      throw new Error("Failed to create session");
    }
  } catch (error: any) {
    console.error("Session creation error:", error);
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

async function sendTransaction() {
  if (!sessionActive.value) {
    status.value = "Please create a session first";
    return;
  }

  try {
    loading.value = true;
    txHash.value = "";
    status.value = "Sending transaction...";

    const valueInWei = (parseFloat(amount.value) * 1e18).toString();

    const response = await fetch(`${API_URL}/api/transaction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: userId.value,
        to: recipientAddress.value,
        value: valueInWei,
        data: "0x",
      }),
    });

    const data = await response.json();

    if (data.success) {
      txHash.value = data.transactionHash;
      status.value = "Transaction sent!";
      console.log("Transaction:", data);
    } else {
      throw new Error(data.message || "Transaction failed");
    }
  } catch (error: any) {
    console.error("Transaction error:", error);
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

async function revokeSession() {
  if (!sessionActive.value) {
    return;
  }

  try {
    loading.value = true;
    status.value = "Revoking session...";

    const response = await fetch(`${API_URL}/api/session/${userId.value}`, {
      method: "DELETE",
    });

    const data = await response.json();

    if (data.ok) {
      sessionActive.value = false;
      sessionId.value = "";
      status.value = "Session revoked";
    }
  } catch (error: any) {
    console.error("Revoke error:", error);
    status.value = `Error: ${error.message}`;
  } finally {
    loading.value = false;
  }
}

const handleLogout = () => {
  logout({ logoutParams: { returnTo: window.location.origin } });
};
</script>

<template>
  <div class="container">
    <div class="header">
      <h1>Alchemy Session Keys</h1>
      <div class="user-info">
        <span>{{ user?.email || user?.name }}</span>
        <button @click="handleLogout" class="logout-btn">Logout</button>
      </div>
    </div>

    <div class="card">
      <h2>1. Create Smart Wallet</h2>
      <button @click="createWallet" :disabled="loading || !!accountAddress">
        {{ accountAddress ? "Wallet Created" : "Create Wallet" }}
      </button>
      <div v-if="accountAddress" class="info"><strong>Account:</strong> {{ accountAddress }}</div>
    </div>

    <div class="card">
      <h2>2. Create Session Key</h2>
      <button @click="createSession" :disabled="loading || !accountAddress || sessionActive">
        {{ sessionActive ? "Session Active" : "Create Session" }}
      </button>
      <div v-if="sessionId" class="info"><strong>Session ID:</strong> {{ sessionId }}</div>
    </div>

    <div class="card">
      <h2>3. Send Transaction (Delegated)</h2>
      <div class="form-group">
        <label>To Address:</label>
        <input v-model="recipientAddress" type="text" placeholder="0x..." />
      </div>
      <div class="form-group">
        <label>Amount (ETH):</label>
        <input v-model="amount" type="text" placeholder="0.001" />
      </div>
      <button @click="sendTransaction" :disabled="loading || !sessionActive">
        Send Transaction
      </button>
      <div v-if="txHash" class="info success">
        <strong>TX Hash:</strong>
        <a :href="`https://sepolia.etherscan.io/tx/${txHash}`" target="_blank">
          {{ txHash }}
        </a>
      </div>
    </div>

    <div class="card">
      <h2>4. Revoke Session</h2>
      <button @click="revokeSession" :disabled="loading || !sessionActive" class="danger">
        Revoke Session
      </button>
    </div>

    <div v-if="status" class="status">
      {{ status }}
    </div>

    <div class="note">
      <strong>Note:</strong> This demo uses Sepolia testnet. Make sure your wallet has Sepolia ETH.
    </div>
  </div>
</template>

<style scoped>
.container {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid #dee2e6;
}

.header h1 {
  margin: 0;
  color: #2c3e50;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.user-info span {
  color: #6c757d;
}

.logout-btn {
  background: #6c757d;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.logout-btn:hover {
  background: #5a6268;
}

h2 {
  font-size: 1.2rem;
  margin-bottom: 1rem;
  color: #34495e;
}

.card {
  background: #f8f9fa;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

button {
  background: #007bff;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  transition: background 0.2s;
}

button:hover:not(:disabled) {
  background: #0056b3;
}

button:disabled {
  background: #6c757d;
  cursor: not-allowed;
}

button.danger {
  background: #dc3545;
}

button.danger:hover:not(:disabled) {
  background: #c82333;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
}

.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
}

.info {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #e7f3ff;
  border-left: 3px solid #007bff;
  font-size: 0.9rem;
  word-break: break-all;
}

.info.success {
  background: #d4edda;
  border-left-color: #28a745;
}

.info a {
  color: #007bff;
  text-decoration: none;
}

.info a:hover {
  text-decoration: underline;
}

.status {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  background: #343a40;
  color: white;
  padding: 1rem 1.5rem;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  max-width: 400px;
}

.note {
  margin-top: 2rem;
  padding: 1rem;
  background: #fff3cd;
  border-left: 3px solid #ffc107;
  font-size: 0.9rem;
}
</style>

<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { useRouter } from "vue-router";
import { watch } from "vue";

const { loginWithRedirect, isAuthenticated, isLoading } = useAuth0();
const router = useRouter();

// Redirect if already authenticated
watch(
  () => [isAuthenticated.value, isLoading.value],
  ([authenticated, loading]) => {
    if (!loading && authenticated) {
      router.push("/wallet");
    }
  },
  { immediate: true }
);

const login = () => {
  loginWithRedirect({
    appState: { targetUrl: "/wallet" },
  });
};
</script>

<template>
  <div class="login-container">
    <div class="login-card">
      <h1>Alchemy Session Keys Demo</h1>
      <p class="subtitle">Secure delegated transaction signing with smart contract wallets</p>

      <div class="features">
        <div class="feature">
          <div class="feature-icon">🔐</div>
          <h3>Session Keys</h3>
          <p>Delegate signing to backend with scoped permissions</p>
        </div>
        <div class="feature">
          <div class="feature-icon">💼</div>
          <h3>Smart Wallets</h3>
          <p>ERC-4337 account abstraction powered by Alchemy</p>
        </div>
        <div class="feature">
          <div class="feature-icon">⚡</div>
          <h3>Secure</h3>
          <p>Main key never leaves your device</p>
        </div>
      </div>

      <button @click="login" class="login-button">Login with Auth0</button>

      <div class="note"><strong>Network:</strong> Sepolia Testnet</div>
    </div>
  </div>
</template>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 2rem;
}

.login-card {
  background: white;
  border-radius: 12px;
  padding: 3rem;
  max-width: 600px;
  width: 100%;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

h1 {
  text-align: center;
  color: #2c3e50;
  margin-bottom: 0.5rem;
  font-size: 2rem;
}

.subtitle {
  text-align: center;
  color: #6c757d;
  margin-bottom: 2rem;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 1.5rem;
  margin-bottom: 2rem;
}

.feature {
  text-align: center;
}

.feature-icon {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.feature h3 {
  font-size: 1rem;
  margin-bottom: 0.5rem;
  color: #34495e;
}

.feature p {
  font-size: 0.85rem;
  color: #6c757d;
  line-height: 1.4;
}

.login-button {
  width: 100%;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: 8px;
  font-size: 1.1rem;
  font-weight: 600;
  cursor: pointer;
  transition:
    transform 0.2s,
    box-shadow 0.2s;
}

.login-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}

.note {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #fff3cd;
  border-left: 3px solid #ffc107;
  font-size: 0.9rem;
  text-align: center;
}
</style>

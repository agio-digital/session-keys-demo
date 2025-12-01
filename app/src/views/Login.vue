<script setup lang="ts">
import { useRouter } from "vue-router";
import { watch, ref, onMounted } from "vue";
import { useAlchemySigner } from "../composables/useAlchemySigner";

const router = useRouter();
const { isAuthenticated, isInitializing, initializeSigner, loginWithAuth0, error } = useAlchemySigner();
const isLoggingIn = ref(false);

onMounted(() => initializeSigner());

watch(
  () => isAuthenticated.value,
  (authenticated) => {
    if (authenticated) router.push("/wallet");
  },
  { immediate: true }
);

const login = async () => {
  isLoggingIn.value = true;
  try {
    await loginWithAuth0();
  } finally {
    isLoggingIn.value = false;
  }
};
</script>

<template>
  <main class="container" style="display: flex; align-items: center; min-height: 100vh">
    <article style="text-align: center; width: 100%">
      <h1>Agio Smart Wallet</h1>
      <p>Session keys demo on Sepolia testnet</p>
      <button @click="login" :disabled="isInitializing || isLoggingIn" :aria-busy="isLoggingIn" style="width: 100%">
        {{ isInitializing ? "Initializing..." : "Login" }}
      </button>
      <p v-if="error" role="alert">{{ error }}</p>
    </article>
  </main>
</template>

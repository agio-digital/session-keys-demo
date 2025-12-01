<script setup lang="ts">
import { useRouter } from "vue-router";
import { watch, computed, type Ref } from "vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { logger } from "../utils/logger";
import { until } from "../utils/until";

const router = useRouter();
const { isAuthenticated: auth0IsAuthenticated, loginWithRedirect } = useAuth0();

// Unwrap for template use
const isAuthenticated = computed(() => auth0IsAuthenticated.value);

watch(
  auth0IsAuthenticated as any as Ref<boolean>,
  async (authenticated) => {
    if (authenticated) {
      logger.debug("[Login] Authenticated");
      await until(async () => {
        await router.isReady();
        return true;
      });
      await router.push({
        name: "home",
        force: true,
        replace: true,
      });
      logger.debug("[Login] Redirected to home");
    }
  },
  { immediate: true }
);

async function login() {
  await loginWithRedirect();
}
</script>

<template>
  <main
    class="container"
    style="display: flex; align-items: center; min-height: 100vh"
    :data-auth="isAuthenticated"
  >
    <article style="text-align: center; width: 100%">
      <h1>Agio Smart Wallet</h1>
      <p>Session keys demo on Sepolia testnet</p>

      <button @click="login" :disabled="isAuthenticated" style="width: 100%">Login</button>
    </article>
  </main>
</template>

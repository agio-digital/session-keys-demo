<script setup lang="ts">
import { useAuth0 } from "@auth0/auth0-vue";
import { useRoute } from "vue-router";
import { initHttp } from "./utils/http";

const { isLoading, getAccessTokenSilently } = useAuth0();
const route = useRoute();

// Initialize HTTP client with Auth0 token getter
initHttp(getAccessTokenSilently);
</script>

<template>
  <main v-if="isLoading" class="container">
    <p aria-busy="true">Loading...</p>
  </main>
  <router-view v-else :key="route.path" />
</template>

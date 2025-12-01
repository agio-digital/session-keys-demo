<script setup lang="ts">
import { useAlchemySigner } from "./composables/useAlchemySigner";

const { isInitializing } = useAlchemySigner();
</script>

<template>
  <main v-if="isInitializing" class="container" aria-busy="true">
    <p>Loading...</p>
  </main>
  <router-view v-else />
</template>

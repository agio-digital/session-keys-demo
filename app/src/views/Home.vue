<script setup lang="ts">
import { computed } from "vue";
import { useAuth0 } from "@auth0/auth0-vue";
import { useRouter } from "vue-router";

const router = useRouter();
const { user: auth0User, logout } = useAuth0();

// Unwrap auth0 user ref for template
const user = computed(() => auth0User.value);

const handleLogout = () => {
  logout({ logoutParams: { returnTo: window.location.origin } });
};

const fullName = computed(() => {
  if (!user.value) return "";
  const names = [];
  if (user.value.given_name) names.push(user.value.given_name);
  if (user.value.family_name) names.push(user.value.family_name);
  if (!names.length && user.value.nickname) names.push(user.value.nickname);
  return names.join(" ");
});
</script>

<template>
  <main class="container">
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
      <img
        v-if="user?.picture"
        :src="user.picture"
        :alt="user.name || 'User'"
        style="border-radius: 50%; width: 100px; height: 100px; margin-bottom: 1rem"
      />

      <h2 v-if="fullName">
        {{ fullName }}
      </h2>
      <p v-if="user?.email">{{ user?.email }}</p>
      <p v-if="user?.sub"><code>{{ user.sub }}</code></p>

      <button
        @click="
          router.push({
            name: 'wallet',
          })
        "
      >
        Open Wallet
      </button>
    </article>
  </main>
</template>

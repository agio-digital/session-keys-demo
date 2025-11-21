import { createRouter, createWebHistory } from "vue-router";
import { authGuard } from "@auth0/auth0-vue";

const routes = [
  {
    path: "/",
    name: "login",
    component: () => import("../views/Login.vue"),
  },
  {
    path: "/wallet",
    name: "wallet",
    component: () => import("../views/Wallet.vue"),
    beforeEnter: authGuard,
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

export default router;

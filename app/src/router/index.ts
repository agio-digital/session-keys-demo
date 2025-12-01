import { createRouter, createWebHashHistory } from "vue-router";
import { authGuard } from "@auth0/auth0-vue";

const routes = [
  {
    path: "/",
    name: "login",
    component: () => import("../views/Login.vue"),
  },
  {
    path: "/home",
    name: "home",
    component: () => import("../views/Home.vue"),
    beforeEnter: authGuard,
  },
  {
    path: "/wallet",
    name: "wallet",
    component: () => import("../views/Wallet.vue"),
    beforeEnter: authGuard,
    meta: { requiresAlchemy: true },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

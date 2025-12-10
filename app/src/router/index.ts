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
    redirect: "/wallet/0",
  },
  {
    path: "/wallet/:id",
    name: "wallet",
    component: () => import("../views/Wallet.vue"),
    beforeEnter: authGuard,
    meta: { requiresAlchemy: true },
    props: (route: { params: { id: string } }) => ({
      walletId: parseInt(route.params.id, 10) || 0,
    }),
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

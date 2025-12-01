import { createRouter, createWebHashHistory } from "vue-router";
import { useAlchemySigner } from "../composables/useAlchemySigner";

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
    beforeEnter: () => {
      const { isAuthenticated } = useAlchemySigner();
      if (!isAuthenticated.value) {
        return { name: "login" };
      }
      return true;
    },
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

export default router;

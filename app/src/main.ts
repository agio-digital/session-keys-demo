import { createApp } from "vue";
import { createAuth0 } from "@auth0/auth0-vue";
import "./style.css";
import App from "./App.vue";
import router from "./router";

// Validate required environment variables
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;

if (!AUTH0_DOMAIN) {
  throw new Error("VITE_AUTH0_DOMAIN is required in environment variables");
}

if (!AUTH0_CLIENT_ID) {
  throw new Error("VITE_AUTH0_CLIENT_ID is required in environment variables");
}

const app = createApp(App);

app.use(
  createAuth0({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin + "/wallet",
    },
  })
);

app.use(router);
app.mount("#app");

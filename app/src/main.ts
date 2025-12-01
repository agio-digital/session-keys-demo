import { createApp, type Plugin } from "vue";
import { createPinia } from "pinia";
import { PiniaColada } from "@pinia/colada";
import { createAuth0 } from "@auth0/auth0-vue";
import "./style.css";
import App from "./App.vue";
import router from "./router";

const app = createApp(App);

app.use(createPinia());
app.use(PiniaColada);
app.use(router);

// Auth0 plugin for main app authentication
const AUTH0_DOMAIN = import.meta.env.VITE_AUTH0_DOMAIN;
const AUTH0_CLIENT_ID = import.meta.env.VITE_AUTH0_CLIENT_ID;

if (AUTH0_DOMAIN && AUTH0_CLIENT_ID) {
  app.use(
    createAuth0({
      domain: AUTH0_DOMAIN,
      clientId: AUTH0_CLIENT_ID,
      authorizationParams: {
        redirect_uri: window.location.origin,
      },
      cacheLocation: "localstorage",
    }) as unknown as Plugin
  );
}

app.mount("#app");

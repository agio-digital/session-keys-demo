import { ref } from "vue";
import { AlchemyWebSigner } from "@account-kit/signer";
import { logger } from "../utils/logger";

const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;

// Singleton instance
let signer: AlchemyWebSigner | null = null;
let iframeContainer: HTMLDivElement | null = null;

// Reactive state
const user = ref<any>(null);
const isAuthenticated = ref(false);
const isInitializing = ref(false);
const error = ref<string | null>(null);

export function useAlchemySigner() {
  async function initializeSigner() {
    if (signer) {
      // Already initialized, check if user is authenticated
      const existingUser = signer.inner.getUser();
      if (existingUser) {
        user.value = existingUser;
        isAuthenticated.value = true;
      }
      return signer;
    }

    try {
      isInitializing.value = true;
      error.value = null;

      // Create hidden iframe container if it doesn't exist
      if (!iframeContainer) {
        iframeContainer = document.createElement("div");
        iframeContainer.id = "alchemy-signer-iframe-container";
        iframeContainer.style.display = "none";
        document.body.appendChild(iframeContainer);
      }

      // Initialize the AlchemyWebSigner
      signer = new AlchemyWebSigner({
        client: {
          connection: { apiKey: ALCHEMY_API_KEY },
          iframeConfig: { iframeContainerId: "alchemy-signer-iframe-container" },
        },
      });

      // Prepare for popup OAuth (must be called before authenticate with popup mode)
      await signer.preparePopupOauth();

      // Subscribe to auth state changes to keep Vue state in sync
      signer.on("connected", (connectedUser) => {
        logger.info({ user: connectedUser }, "Signer connected event");
        user.value = connectedUser;
        isAuthenticated.value = true;
      });

      signer.on("disconnected", () => {
        logger.info("Signer disconnected event");
        user.value = null;
        isAuthenticated.value = false;
      });

      // Check if already authenticated
      const existingUser = signer.inner.getUser();
      if (existingUser) {
        user.value = existingUser;
        isAuthenticated.value = true;
        logger.info({ user: existingUser }, "User already authenticated");
      }

      logger.info("Alchemy Signer initialized");
      return signer;
    } catch (err: any) {
      error.value = err.message;
      logger.error({ error: err }, "Failed to initialize Alchemy Signer");
      throw err;
    } finally {
      isInitializing.value = false;
    }
  }

  async function loginWithAuth0() {
    if (!signer) {
      await initializeSigner();
    }

    try {
      logger.info("Starting Auth0 OAuth login via Alchemy");

      const authenticatedUser = await signer!.authenticate({
        type: "oauth",
        authProviderId: "auth0",
        mode: "popup",
      });

      user.value = authenticatedUser;
      isAuthenticated.value = true;
      logger.info({ user: authenticatedUser }, "Auth0 login successful");

      return authenticatedUser;
    } catch (err: any) {
      error.value = err.message;
      logger.error({ error: err }, "Auth0 login failed");
      throw err;
    }
  }

  async function logout() {
    if (signer) {
      await signer.disconnect();
      user.value = null;
      isAuthenticated.value = false;
      logger.info("User logged out");
    }
  }

  function getSigner() {
    return signer;
  }

  return {
    signer: getSigner,
    user,
    isAuthenticated,
    isInitializing,
    error,
    initializeSigner,
    loginWithAuth0,
    logout,
  };
}

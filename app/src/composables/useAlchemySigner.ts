import { ref } from "vue";
import { AlchemyWebSigner, type User } from "@account-kit/signer";
import { logger } from "../utils/logger";

const ALCHEMY_API_KEY = import.meta.env.VITE_ALCHEMY_API_KEY;

// Singleton instance and initialization lock
let signer: AlchemyWebSigner | null = null;
let initPromise: Promise<AlchemyWebSigner> | null = null;

// Reactive state (module-level for singleton behavior)
const user = ref<User | null>(null);
const isAuthenticated = ref(false);
const isInitializing = ref(false); // Only true during active initialization
const error = ref<string | null>(null);

logger.debug({ url: window.location.href }, "[Signer] Module loaded");

export function useAlchemySigner() {
  async function initializeSigner(): Promise<AlchemyWebSigner> {
    logger.debug(
      { signerExists: !!signer, initInProgress: !!initPromise },
      "[Signer] initializeSigner called"
    );

    // Already initialized - return existing signer
    if (signer) {
      const existingUser = signer.inner.getUser();
      logger.debug({ existingUser }, "[Signer] Signer already exists");
      if (existingUser) {
        user.value = existingUser;
        isAuthenticated.value = true;
      }
      isInitializing.value = false;
      return signer;
    }

    // Initialization in progress - await existing promise (prevents race condition)
    if (initPromise) {
      logger.debug("[Signer] Initialization already in progress, awaiting...");
      return initPromise;
    }

    // Start new initialization - store the promise so concurrent callers await it
    initPromise = doInitialize();

    try {
      return await initPromise;
    } catch (err) {
      // Clear promise on error so retry is possible
      initPromise = null;
      throw err;
    }
  }

  async function doInitialize(): Promise<AlchemyWebSigner> {
    try {
      isInitializing.value = true;
      error.value = null;

      // Create iframe container if needed
      let iframeContainer = document.getElementById(
        "alchemy-signer-iframe-container"
      ) as HTMLDivElement | null;
      if (!iframeContainer) {
        iframeContainer = document.createElement("div");
        iframeContainer.id = "alchemy-signer-iframe-container";
        iframeContainer.style.display = "none";
        document.body.appendChild(iframeContainer);
      }

      logger.debug("[Signer] Creating new AlchemyWebSigner");
      signer = new AlchemyWebSigner({
        client: {
          connection: { apiKey: ALCHEMY_API_KEY },
          iframeConfig: { iframeContainerId: "alchemy-signer-iframe-container" },
        },
      });
      logger.debug("[Signer] AlchemyWebSigner created");

      signer.on("connected", (connectedUser) => {
        logger.debug({ connectedUser }, "[Signer] connected event");
        user.value = connectedUser;
        isAuthenticated.value = true;
      });

      signer.on("disconnected", () => {
        logger.debug("[Signer] disconnected event");
        user.value = null;
        isAuthenticated.value = false;
      });

      // Check for existing user
      logger.debug("[Signer] Checking for existing user...");
      const existingUser = signer.inner.getUser();
      logger.debug({ existingUser }, "[Signer] After creation");
      if (existingUser) {
        user.value = existingUser;
        isAuthenticated.value = true;
      }

      // Check if we're returning from an Alchemy OAuth callback
      const url = new URL(window.location.href);
      const hasAlchemyCallback =
        url.searchParams.has("alchemy-bundle") ||
        url.searchParams.has("alchemy-status") ||
        url.searchParams.has("alchemy-error");

      logger.debug({ hasAlchemyCallback }, "[Signer] Checking callback");

      // Only prepare OAuth if:
      // 1. No existing user AND
      // 2. Not returning from an Alchemy callback (the signer will handle it via events)
      if (!existingUser && !hasAlchemyCallback) {
        logger.debug("[Signer] No existing user and no callback, calling preparePopupOauth");
        try {
          await signer.preparePopupOauth();
          logger.debug("[Signer] preparePopupOauth completed");
        } catch (prepareErr) {
          // Non-fatal: OAuth prep can fail due to network issues, signer still usable
          logger.warn({ err: prepareErr }, "[Signer] preparePopupOauth failed (non-fatal)");
        }
      } else if (hasAlchemyCallback && !existingUser) {
        // Check for OAuth error first
        const oauthError = url.searchParams.get("alchemy-error");
        if (oauthError) {
          logger.error({ oauthError }, "[Signer] OAuth callback returned error");
          error.value = `Wallet connection failed: ${oauthError}`;
          // Clean up URL params so user can retry
          url.searchParams.delete("alchemy-error");
          url.searchParams.delete("alchemy-bundle");
          url.searchParams.delete("alchemy-status");
          window.history.replaceState({}, "", url.toString());
          // Don't throw - let the UI show the error state
        } else {
          // Wait for the callback to be processed and user to be authenticated
          logger.debug("[Signer] Waiting for OAuth callback to complete...");
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error("OAuth callback timeout"));
            }, 10000);

            signer!.on("connected", () => {
              clearTimeout(timeout);
              logger.debug("[Signer] OAuth callback completed - user connected");
              resolve();
            });
          });
        }
      } else {
        logger.debug(
          { existingUser: !!existingUser, hasAlchemyCallback },
          "[Signer] Skipping preparePopupOauth"
        );
      }

      return signer;
    } catch (err: any) {
      error.value = err.message;
      signer = null; // Reset on error
      throw err;
    } finally {
      isInitializing.value = false;
    }
  }

  // OAuth via Auth0 (uses Auth0 configured in Alchemy dashboard)
  async function loginWithAuth0(options?: {
    auth0Connection?: string;
    mode?: "popup" | "redirect";
  }) {
    if (!signer) await initializeSigner();

    const mode = options?.mode || "redirect";

    try {
      // Build auth params based on mode - Alchemy expects specific structure
      const baseParams = {
        type: "oauth" as const,
        authProviderId: "auth0" as const,
        isCustomProvider: false as const,
        ...(options?.auth0Connection && { auth0Connection: options.auth0Connection }),
      };

      const authParams =
        mode === "redirect"
          ? { ...baseParams, mode: "redirect" as const, redirectUrl: window.location.href }
          : { ...baseParams, mode: "popup" as const };

      const authenticatedUser = await signer!.authenticate(authParams);

      // For redirect mode, page will redirect - no return
      // For popup mode, we get the user back
      if (authenticatedUser) {
        user.value = authenticatedUser;
        isAuthenticated.value = true;
      }
      return authenticatedUser;
    } catch (err: any) {
      error.value = err.message;
      throw err;
    }
  }

  async function logout() {
    if (signer) {
      await signer.disconnect();
      user.value = null;
      isAuthenticated.value = false;
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

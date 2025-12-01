/**
 * Auth0 Action: Add Alchemy tknonce claim
 *
 * This Action adds the `tknonce` claim to the ID token for Alchemy BYOA authentication.
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to Auth0 Dashboard → Actions → Library → Create Action
 * 2. Name: "Add Alchemy tknonce"
 * 3. Trigger: Login / Post Login
 * 4. Paste this code
 * 5. Deploy the Action
 * 6. Go to Actions → Flows → Login → Add the action to the flow
 *
 * The frontend passes the nonce via authorizationParams.tknonce when calling loginWithRedirect()
 */

exports.onExecutePostLogin = async (event, api) => {
  // Get the tknonce from the authorization request parameters
  const tknonce = event.request.query.tknonce || event.request.body?.tknonce;

  if (tknonce) {
    // Add tknonce to the ID token
    api.idToken.setCustomClaim('tknonce', tknonce);

    // Optionally add to access token as well
    api.accessToken.setCustomClaim('tknonce', tknonce);
  }

  // IMPORTANT: You also need to configure the audience
  // In Auth0 Dashboard → Applications → Your App → Settings
  // Add the Alchemy audience to "Allowed Audiences" or use an Auth0 API
};

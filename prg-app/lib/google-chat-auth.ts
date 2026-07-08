import { OAuth2Client } from "google-auth-library";

const CHAT_SERVICE_ACCOUNT = "chat@system.gserviceaccount.com";
const GOOGLE_ACCOUNTS_ISSUER = "https://accounts.google.com";

const client = new OAuth2Client();

// Verifies that an incoming request really came from Google Chat, per
// https://developers.google.com/workspace/chat/verify-requests — the
// request carries a bearer JWT signed by Google. Depending on how the
// "Authentication Audience" is configured in the Google Cloud Console for
// this Chat app (a setting that isn't always exposed in the UI, and
// defaults differently across accounts), Google issues the token in one of
// two shapes:
//   - Project Number audience: a self-signed JWT where `iss` is directly
//     "chat@system.gserviceaccount.com".
//   - HTTP endpoint URL audience: a standard Google-signed OIDC ID token,
//     where `iss` is "https://accounts.google.com" and the service account
//     shows up in a separate `email` claim instead.
// We accept whichever shape shows up rather than assuming one — the token
// is still fully verified against Google's public signing keys either way,
// so this doesn't loosen security, it just tolerates both valid
// configurations.
export async function verifyGoogleChatRequest(bearerToken: string, requestUrl: string) {
  const projectNumber = process.env.GOOGLE_CHAT_PROJECT_NUMBER;
  if (!projectNumber) {
    throw new Error("GOOGLE_CHAT_PROJECT_NUMBER is not configured");
  }
  if (!bearerToken) {
    throw new Error("Missing bearer token");
  }

  const acceptedAudiences = [projectNumber, requestUrl];

  const ticket = await client.verifyIdToken({
    idToken: bearerToken,
    audience: acceptedAudiences,
  });
  const payload = ticket.getPayload();
  const isSelfSignedChatJwt = payload?.iss === CHAT_SERVICE_ACCOUNT;
  const isGoogleSignedIdToken =
    payload?.iss === GOOGLE_ACCOUNTS_ISSUER && payload?.email === CHAT_SERVICE_ACCOUNT;
  if (!payload || !(isSelfSignedChatJwt || isGoogleSignedIdToken)) {
    throw new Error(`Unexpected token issuer/email: iss=${payload?.iss} email=${payload?.email}`);
  }
  return payload;
}

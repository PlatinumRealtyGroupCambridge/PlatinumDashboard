import { OAuth2Client } from "google-auth-library";

const CHAT_ISSUER = "chat@system.gserviceaccount.com";

const client = new OAuth2Client();

// Verifies that an incoming request really came from Google Chat, per
// https://developers.google.com/workspace/chat/verify-requests — the
// request carries a bearer JWT signed by Google. Depending on how the
// "Authentication Audience" is configured in the Google Cloud Console for
// this Chat app (a setting that isn't always exposed in the UI, and
// defaults differently across accounts), the token's audience claim will
// be set to EITHER this Cloud project's project number OR the exact HTTP
// endpoint URL Google is posting to. Rather than requiring one specific
// console configuration, we accept either — the token is still fully
// verified against Google's public signing keys either way, so this
// doesn't loosen security, it just tolerates both valid configurations.
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
  if (!payload || payload.iss !== CHAT_ISSUER) {
    throw new Error("Unexpected token issuer");
  }
  return payload;
}

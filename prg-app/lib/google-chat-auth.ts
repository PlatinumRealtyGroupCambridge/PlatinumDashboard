import { OAuth2Client } from "google-auth-library";

const CHAT_ISSUER = "chat@system.gserviceaccount.com";

const client = new OAuth2Client();

// Verifies that an incoming request really came from Google Chat, per
// https://developers.google.com/workspace/chat/verify-requests — the
// request carries a bearer JWT signed by Google, which we check against
// Google's public keys, the expected audience (this Cloud project's
// project number), and the expected issuer.
export async function verifyGoogleChatRequest(bearerToken: string) {
  const projectNumber = process.env.GOOGLE_CHAT_PROJECT_NUMBER;
  if (!projectNumber) {
    throw new Error("GOOGLE_CHAT_PROJECT_NUMBER is not configured");
  }
  if (!bearerToken) {
    throw new Error("Missing bearer token");
  }

  const ticket = await client.verifyIdToken({
    idToken: bearerToken,
    audience: projectNumber,
  });
  const payload = ticket.getPayload();
  if (!payload || payload.iss !== CHAT_ISSUER) {
    throw new Error("Unexpected token issuer");
  }
  return payload;
}

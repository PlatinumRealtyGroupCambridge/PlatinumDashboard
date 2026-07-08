import { OAuth2Client } from "google-auth-library";

const CHAT_SERVICE_ACCOUNT = "chat@system.gserviceaccount.com";
const GOOGLE_ACCOUNTS_ISSUER = "https://accounts.google.com";

const client = new OAuth2Client();

// Verifies that an incoming request really came from Google Chat, per
// https://developers.google.com/workspace/chat/verify-requests — the
// request carries a bearer JWT signed by Google. Google has been migrating
// Chat app configuration onto its newer "Workspace Add-ons" framework
// (visible from the `Google-gsuiteaddons` user-agent on incoming requests),
// which signs requests from a project-specific service account rather than
// the classic fixed "chat@system.gserviceaccount.com" account, e.g.
// "service-<PROJECT_NUMBER>@gcp-sa-gsuiteaddons.iam.gserviceaccount.com".
// We accept either shape — the token is still fully verified against
// Google's public signing keys either way, and the Add-ons variant is
// additionally pinned to this specific project's number, so this doesn't
// loosen security.
export async function verifyGoogleChatRequest(bearerToken: string, requestUrl: string) {
  const projectNumber = process.env.GOOGLE_CHAT_PROJECT_NUMBER;
  if (!projectNumber) {
    throw new Error("GOOGLE_CHAT_PROJECT_NUMBER is not configured");
  }
  if (!bearerToken) {
    throw new Error("Missing bearer token");
  }

  const acceptedAudiences = [projectNumber, requestUrl];
  const workspaceAddOnsServiceAccount = `service-${projectNumber}@gcp-sa-gsuiteaddons.iam.gserviceaccount.com`;

  const ticket = await client.verifyIdToken({
    idToken: bearerToken,
    audience: acceptedAudiences,
  });
  const payload = ticket.getPayload();
  const isSelfSignedChatJwt = payload?.iss === CHAT_SERVICE_ACCOUNT;
  const isGoogleSignedChatIdToken =
    payload?.iss === GOOGLE_ACCOUNTS_ISSUER && payload?.email === CHAT_SERVICE_ACCOUNT;
  const isGoogleWorkspaceAddOnsIdToken =
    payload?.iss === GOOGLE_ACCOUNTS_ISSUER && payload?.email === workspaceAddOnsServiceAccount;
  if (
    !payload ||
    !(isSelfSignedChatJwt || isGoogleSignedChatIdToken || isGoogleWorkspaceAddOnsIdToken)
  ) {
    throw new Error(`Unexpected token issuer/email: iss=${payload?.iss} email=${payload?.email}`);
  }
  return payload;
}

import { NextRequest, NextResponse } from "next/server";
import { verifyGoogleChatRequest } from "@/lib/google-chat-auth";
import { handleChatMessage } from "@/lib/chat-bot";

// Google Chat POSTs every event (message, added-to-space, etc.) here. We
// verify the request is really from Google, hand the event to the bot
// logic, and return the reply text synchronously in the response body —
// Google Chat displays that as the bot's message, so no separate
// credential is needed just to send a reply.
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  const requestUrl = `${req.nextUrl.origin}${req.nextUrl.pathname}`;

  try {
    await verifyGoogleChatRequest(token, requestUrl);
  } catch (err) {
    console.error("Google Chat request failed verification:", err);
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const event = await req.json().catch(() => null);
  if (!event) {
    return NextResponse.json({});
  }

  try {
    const text = await handleChatMessage(event);
    return NextResponse.json(text ? { text } : {});
  } catch (err) {
    console.error("Error handling Google Chat message:", err);
    return NextResponse.json({
      text: "Something went wrong on my end handling that — try again in a moment, or let Tim know if it keeps happening.",
    });
  }
}

// Google verifies the endpoint is reachable with a GET during setup in
// some configurations — respond so that check doesn't fail.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

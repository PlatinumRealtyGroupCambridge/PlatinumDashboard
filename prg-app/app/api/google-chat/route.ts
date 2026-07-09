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
    console.error("Google Chat request had no parseable JSON body");
    return NextResponse.json({});
  }
  // Temporary diagnostic logging while we confirm the exact shape of the
  // event payload Google is sending for this app (it can differ depending
  // on which Chat configuration framework the app was set up under) —
  // safe to remove once messages are confirmed working end-to-end.
  console.log("Google Chat event received:", JSON.stringify(event).slice(0, 4000));

  // Google sends events in one of two shapes (see lib/chat-bot.ts's
  // normalizeEvent for the input side), and expects the REPLY in the
  // matching shape too. This app's events arrive as the newer "common
  // event object" (a top-level "chat" key) — that format requires the
  // reply wrapped in hostAppDataAction.chatDataAction.createMessageAction,
  // NOT the simple {"text": "..."} shape the classic format uses. A plain
  // {"text"} reply to a "chat"-shaped event is silently ignored by Google
  // Chat, which is why the bot appeared to "not respond" even though it
  // was creating tasks/goals successfully server-side.
  const usesCommonEventObjectFormat = Boolean(event?.chat);

  function replyJson(text: string) {
    if (!text) return NextResponse.json({});
    if (usesCommonEventObjectFormat) {
      return NextResponse.json({
        hostAppDataAction: {
          chatDataAction: {
            createMessageAction: { message: { text } },
          },
        },
      });
    }
    return NextResponse.json({ text });
  }

  try {
    const text = await handleChatMessage(event);
    console.log("Google Chat reply text:", JSON.stringify(text));
    return replyJson(text);
  } catch (err) {
    console.error("Error handling Google Chat message:", err);
    return replyJson(
      "Something went wrong on my end handling that — try again in a moment, or let Tim know if it keeps happening."
    );
  }
}

// Google verifies the endpoint is reachable with a GET during setup in
// some configurations — respond so that check doesn't fail.
export async function GET() {
  return NextResponse.json({ status: "ok" });
}

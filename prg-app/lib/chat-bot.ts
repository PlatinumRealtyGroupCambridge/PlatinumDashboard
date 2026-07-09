import { prisma } from "./prisma";
import { anthropic, CHAT_BOT_MODEL } from "./anthropic";
import { getOrCreateNextInstance } from "./meetings-server";
import { colorForIndex } from "./colors";
import { nyTodayISO, zonedTimeToUtc } from "./timezone";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Loosely typed — Google Chat's event payload has more fields than this,
// we only read what we need. Google Chat apps can receive events in either
// of two shapes depending on how the app is configured:
//   - Classic shape: a flat object with top-level "type" ("MESSAGE" /
//     "ADDED_TO_SPACE" / ...), "message", and "user" fields. See
//     https://developers.google.com/workspace/chat/api/reference/rest/v1/HttpBody
//   - Common event object shape (Workspace Add-ons framework, which is what
//     this app is actually configured under — see the Configuration page
//     migration note in google-chat-auth.ts): everything lives under a
//     top-level "chat" object, e.g. "chat.messagePayload.message.text" for
//     the message text and "chat.user" for the sender, with
//     "chat.addedToSpacePayload" present instead when the app is newly
//     added to a space. See
//     https://developers.google.com/workspace/add-ons/concepts/event-objects
// normalizeEvent() below converts either shape into one common shape the
// rest of this file works with. The REPLY format also differs between the
// two — that's handled in app/api/google-chat/route.ts, not here.
type ChatSender = { email?: string; displayName?: string; name?: string };
type ChatEvent = {
  // classic shape
  type?: string;
  message?: { text?: string; argumentText?: string; sender?: ChatSender };
  user?: ChatSender;
  // common event object shape
  chat?: {
    user?: ChatSender;
    messagePayload?: { message?: { text?: string; argumentText?: string; sender?: ChatSender } };
    addedToSpacePayload?: unknown;
  };
};

type NormalizedEvent =
  | { kind: "ADDED_TO_SPACE" }
  | { kind: "MESSAGE"; text: string; sender?: ChatSender }
  | { kind: "OTHER" };

function normalizeEvent(event: ChatEvent): NormalizedEvent {
  if (event.chat) {
    if (event.chat.addedToSpacePayload) return { kind: "ADDED_TO_SPACE" };
    if (event.chat.messagePayload) {
      const msg = event.chat.messagePayload.message;
      const text = (msg?.argumentText ?? msg?.text ?? "").trim();
      const sender = event.chat.user ?? msg?.sender;
      return { kind: "MESSAGE", text, sender };
    }
    return { kind: "OTHER" };
  }
  if (event.type === "ADDED_TO_SPACE") return { kind: "ADDED_TO_SPACE" };
  if (event.type === "MESSAGE") {
    const text = (event.message?.argumentText ?? event.message?.text ?? "").trim();
    const sender = event.message?.sender ?? event.user;
    return { kind: "MESSAGE", text, sender };
  }
  return { kind: "OTHER" };
}

const GREETING =
  "Hi! I'm the Platinum Realty assistant. Message me things like:\n" +
  '• "Add to the team meeting agenda: discuss the Q3 budget"\n' +
  '• "Add a task for Jamie: draft the new sign-on packet, due next Friday"\n' +
  '• "Add a goal for Phong: finalize the QBO integration by end of August"\n' +
  '• "Schedule a meeting with Matt and Phong next Tuesday at 2pm about the vendor contract"\n' +
  "I can only add agenda items to meetings you're part of, but tasks, goals, and new meetings can involve anyone on the team.";

// How long a "did you want to give this a due date?" follow-up stays live
// waiting for an answer before we stop trying to match a later message to
// it (after this, a message like "next Friday" is just treated as a new,
// probably-confusing request instead of silently attaching to old context).
const FOLLOW_UP_WINDOW_MINUTES = 30;

// How long a back-and-forth conversation stays "live" for context purposes
// — messages within this window of each other are shown to the model as
// prior turns so it can resolve things like "yes, that's right" or a
// one-word answer to its own clarifying question, instead of parsing every
// message in total isolation. After this much silence, older turns are
// dropped (both from what's sent to the model and from the database) and
// the next message starts a fresh conversation.
const CONVERSATION_WINDOW_MINUTES = 60;

// Upper bound on how many prior turns to feed back to the model even if
// the window above would allow more — keeps prompt size sane during a
// long, chatty exchange.
const MAX_CONVERSATION_TURNS = 20;

export async function handleChatMessage(rawEvent: ChatEvent): Promise<string> {
  const event = normalizeEvent(rawEvent);
  console.log("handleChatMessage: normalized kind =", event.kind);
  if (event.kind === "ADDED_TO_SPACE") {
    return GREETING;
  }
  if (event.kind !== "MESSAGE") {
    console.log("handleChatMessage: unrecognized event kind, returning empty reply");
    return "";
  }

  const rawText = event.text;
  console.log("handleChatMessage: rawText =", JSON.stringify(rawText));
  if (!rawText) return GREETING;

  const sender = event.sender;
  console.log("handleChatMessage: sender =", JSON.stringify(sender));
  const user = await resolveSender(sender);
  console.log("handleChatMessage: resolved user =", user ? `${user.id} (${user.name})` : "none");
  if (!user) {
    return (
      "I couldn't match you to a Platinum Realty team member " +
      (sender?.email ? `(${sender.email})` : "") +
      ". Ask Tim to check your account, or make sure you're messaging from your work Google account."
    );
  }

  const followUpCutoff = new Date(Date.now() - FOLLOW_UP_WINDOW_MINUTES * 60 * 1000);
  const conversationCutoff = new Date(Date.now() - CONVERSATION_WINDOW_MINUTES * 60 * 1000);
  const [mySeries, allUsers, pendingFollowUp, recentTurnsDesc] = await Promise.all([
    prisma.meetingSeries.findMany({
      where: { participants: { some: { userId: user.id } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
    prisma.chatFollowUp.findFirst({
      where: { userId: user.id, createdAt: { gte: followUpCutoff } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.chatMessage.findMany({
      where: { userId: user.id, createdAt: { gte: conversationCutoff } },
      orderBy: { createdAt: "desc" },
      take: MAX_CONVERSATION_TURNS,
    }),
  ]);
  const conversationHistory = recentTurnsDesc
    .slice()
    .reverse()
    .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

  const action = await parseRequest(rawText, user, mySeries, allUsers, pendingFollowUp, conversationHistory);
  const reply = await executeAction(action, user, pendingFollowUp);

  // Remember this exchange for next time, and forget anything that's aged
  // out of the window so this table doesn't grow forever. The two creates
  // are deliberately sequential (not Promise.all'd together) so the user
  // turn's createdAt is guaranteed to sort before the assistant turn's —
  // a single createMany() call would give both rows the same transaction
  // timestamp in Postgres, and re-fetching them next turn (ordered by
  // createdAt) could then interleave them in the wrong order and break the
  // strict user/assistant alternation Claude's messages API expects.
  await prisma.chatMessage.create({ data: { userId: user.id, role: "user", content: rawText } });
  await prisma.chatMessage.create({ data: { userId: user.id, role: "assistant", content: reply } });
  await prisma.chatMessage.deleteMany({ where: { userId: user.id, createdAt: { lt: conversationCutoff } } });

  return reply;
}

// ---------- resolving the sender to a User row ----------

async function resolveSender(sender?: ChatSender) {
  if (sender?.email) {
    const byEmail = await prisma.user.findUnique({ where: { email: sender.email.toLowerCase() } });
    if (byEmail) return byEmail;
  }
  // Fallback for cases where Google Chat doesn't share the sender's email
  // with this app (depends on Workspace admin sharing settings) — match
  // on display name instead. Reasonable for a 5-person team; revisit if
  // this ever produces a wrong match.
  if (sender?.displayName) {
    const byName = await prisma.user.findFirst({
      where: { name: { equals: sender.displayName, mode: "insensitive" } },
    });
    if (byName) return byName;
  }
  return null;
}

// ---------- Claude-based intent parsing ----------

type ParsedAction =
  | { tool: "add_agenda_item"; seriesId: string; title: string; notes?: string }
  | { tool: "add_task"; assigneeUserId: string; title: string; dueDate?: string; notes?: string }
  | { tool: "add_goal"; assigneeUserId: string; title: string; dueDate?: string; notes?: string }
  | { tool: "set_due_date_on_pending_item"; dueDate?: string }
  | {
      tool: "create_meeting";
      title: string;
      participantUserIds: string[];
      date: string;
      time: string;
      durationMins?: number;
    }
  | { tool: "small_talk"; reply: string }
  | { tool: "ask_for_clarification"; question: string };

const TITLE_FIELD = {
  type: "string" as const,
  description:
    "A short, precise title — like a headline, well under 10 words. Do NOT just copy the sender's whole message; distill it down to the essential point.",
};
const NOTES_FIELD = {
  type: "string" as const,
  description:
    "Any additional detail, context, or specifics from the sender's message that don't fit in the short title. You may lightly summarize or rephrase for clarity — it doesn't need to be verbatim. Omit if the title alone already captures everything.",
};

const BASE_TOOLS = [
  {
    name: "add_agenda_item",
    description:
      "Add a discussion item to a meeting's agenda. Works identically for a recurring meeting series (adds to its next upcoming occurrence) and for a one-off meeting (adds directly to it, including one you just created with create_meeting earlier in this conversation) — both kinds appear together in the provided list and there's no difference in how you add to either. Only use an id from that list of the sender's own meetings.",
    input_schema: {
      type: "object" as const,
      properties: {
        seriesId: { type: "string" as const, description: "id of the meeting (recurring or one-off) from the provided list" },
        title: TITLE_FIELD,
        notes: NOTES_FIELD,
      },
      required: ["seriesId", "title"],
    },
  },
  {
    name: "add_task",
    description: "Create a to-do / task assigned to a team member.",
    input_schema: {
      type: "object" as const,
      properties: {
        assigneeUserId: { type: "string" as const, description: "id of the team member from the provided list" },
        title: TITLE_FIELD,
        notes: NOTES_FIELD,
        dueDate: { type: "string" as const, description: "ISO date YYYY-MM-DD if a due date was mentioned; omit otherwise" },
      },
      required: ["assigneeUserId", "title"],
    },
  },
  {
    name: "add_goal",
    description: "Create a longer-horizon goal assigned to a team member.",
    input_schema: {
      type: "object" as const,
      properties: {
        assigneeUserId: { type: "string" as const, description: "id of the team member from the provided list" },
        title: TITLE_FIELD,
        notes: NOTES_FIELD,
        dueDate: { type: "string" as const, description: "ISO date YYYY-MM-DD target date if mentioned; omit otherwise" },
      },
      required: ["assigneeUserId", "title"],
    },
  },
  {
    name: "create_meeting",
    description:
      "Schedule a brand-new one-off (non-repeating) meeting with specific people, at a specific date and time. Only use this the FIRST time — when the meeting doesn't exist yet and the sender is asking to set one up. Once created, that meeting behaves exactly like any other meeting on the list: to add agenda items or discussion topics to it (now or in a later message), use add_agenda_item with its id, never create_meeting again for the same meeting.",
    input_schema: {
      type: "object" as const,
      properties: {
        title: TITLE_FIELD,
        participantUserIds: {
          type: "array" as const,
          items: { type: "string" as const },
          description:
            "ids of team members to include, from the provided list. Do not include the sender — they're added automatically.",
        },
        date: { type: "string" as const, description: "ISO date YYYY-MM-DD the meeting should happen" },
        time: {
          type: "string" as const,
          description:
            "24-hour HH:MM Eastern time the meeting should start. If the sender didn't give a specific time, call ask_for_clarification and ask for one instead of guessing.",
        },
        durationMins: {
          type: "number" as const,
          description: "meeting length in minutes if mentioned (e.g. 'a quick 15 minute sync'); omit to default to 30",
        },
      },
      required: ["title", "participantUserIds", "date", "time"],
    },
  },
  {
    name: "ask_for_clarification",
    description:
      "Use this when the sender is asking for an action (adding something, scheduling something) but it's ambiguous, doesn't clearly map to a known meeting or person, or isn't something you can do (only add_agenda_item / add_task / add_goal / create_meeting are supported). Do NOT use this for a plain greeting, thanks, or acknowledgment with no request — use small_talk for those instead.",
    input_schema: {
      type: "object" as const,
      properties: { question: { type: "string" as const } },
      required: ["question"],
    },
  },
  {
    name: "small_talk",
    description:
      "Use this when the message is just a greeting, thanks, acknowledgment, or other pleasantry that doesn't request any action — reply naturally and briefly (like a person would), and do NOT ask what they need help with.",
    input_schema: {
      type: "object" as const,
      properties: {
        reply: { type: "string" as const, description: "a brief, warm, natural reply — a sentence or less" },
      },
      required: ["reply"],
    },
  },
];

const SET_DUE_DATE_TOOL = {
  name: "set_due_date_on_pending_item",
  description:
    "Use ONLY when the sender's message is directly answering the due-date follow-up question the bot just asked about the item it most recently created for them (see 'Pending follow-up' below) — e.g. they reply with just a date, 'next week', 'no rush', or 'none'. Do NOT use this if the message describes a new, separate request instead.",
  input_schema: {
    type: "object" as const,
    properties: {
      dueDate: {
        type: "string" as const,
        description: "ISO date YYYY-MM-DD if the sender gave one; omit if they said no due date is needed",
      },
    },
    required: [],
  },
};

type PendingFollowUp = { itemType: string; itemId: string; itemTitle: string } | null;

async function parseRequest(
  text: string,
  sender: { id: string; name: string },
  mySeries: { id: string; name: string }[],
  allUsers: { id: string; name: string }[],
  pendingFollowUp: PendingFollowUp,
  conversationHistory: { role: "user" | "assistant"; content: string }[]
): Promise<ParsedAction> {
  const today = nyTodayISO();
  const pendingNote = pendingFollowUp
    ? `\nPending follow-up: you just asked ${sender.name} whether to set a due date for the ${pendingFollowUp.itemType} "${pendingFollowUp.itemTitle}" you created moments ago. If this message looks like a direct answer to that question, call set_due_date_on_pending_item. Otherwise treat it as a new, unrelated request.\n`
    : "";
  const historyNote = conversationHistory.length
    ? "\nThe messages above are the recent back-and-forth between you and the sender, most recent last — including any clarifying question you just asked. Read them before deciding what to do: if your last message asked a question and the sender's new message answers it (even briefly, like a name, a date, or 'yes'), combine that answer with what you were already discussing rather than asking the same or a similar question again. Only ask another clarifying question if it's still genuinely unclear after considering that context.\n"
    : "";
  const system = `You are a warm, helpful assistant on the Platinum Realty team's chat, chatting like a competent human assistant would (brief, friendly, not robotic). You turn a team member's chat message into exactly one action by calling one of the provided tools.

Today's date: ${today}
Message sender: ${sender.name}
${pendingNote}${historyNote}
Meetings ${sender.name} can add agenda items to (use these exact ids, and ONLY these — the sender cannot add items to meetings they don't attend). This list mixes recurring meeting series and one-off meetings together — there is no distinction between the two for add_agenda_item, both work exactly the same way:
${mySeries.map((s) => `- ${s.id}: ${s.name}`).join("\n") || "(none)"}

Team members tasks/goals/new meetings can involve (use these exact ids):
${allUsers.map((u) => `- ${u.id}: ${u.name}`).join("\n")}

Resolve relative dates (like "next Friday" or "in two weeks") to an actual YYYY-MM-DD date using today's date above — today's date and all meeting times are in Eastern time (America/New_York), which is also what create_meeting's "time" field means. If the message doesn't clearly map to adding an agenda item, task, goal, or new meeting, or references a meeting/person you can't confidently match from the lists above, call ask_for_clarification instead of guessing.

Creating a meeting vs. adding to one that already exists: use create_meeting ONLY when the meeting doesn't exist yet — "schedule a meeting with Matt about the roof repair" or "set up time with Phong and Jamie next week to go over leasing numbers." Once a meeting exists — whether it's a long-running recurring series like the team meeting, or a one-off meeting created moments ago earlier in this same conversation — adding topics/details/notes to it (e.g. "for tomorrow's meeting with Matt, I also want to cover X") is add_agenda_item against that meeting's id from the list above, never create_meeting again. A new meeting needs a specific date AND time to be created — if the sender only gives one of those (or neither), call ask_for_clarification and ask for what's missing rather than guessing a time.

Titles and notes: write a short, precise title — a few words, like a headline — rather than pasting the sender's whole message as the title. If their message has extra detail beyond what a short title can hold (context, specifics, reasoning), put that in the notes field, summarized or lightly cleaned up as needed rather than verbatim. Example: "create a video script on the cambridge rental market pricing" → title "Cambridge rental market pricing video script", with any extra detail from the message in notes.

If the message is just a greeting, thanks, acknowledgment ("ok", "sounds good", "thanks!"), or otherwise doesn't ask for anything, call small_talk with a brief, natural reply — do NOT call ask_for_clarification or ask what they need help with, that reads as robotic right after someone says thanks.`;

  const tools = pendingFollowUp ? [...BASE_TOOLS, SET_DUE_DATE_TOOL] : BASE_TOOLS;

  const response = await anthropic.messages.create({
    model: CHAT_BOT_MODEL,
    max_tokens: 512,
    system,
    messages: [...conversationHistory, { role: "user", content: text }],
    tools,
    tool_choice: { type: "any" },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { tool: "ask_for_clarification", question: "Sorry, I didn't quite catch that — could you rephrase?" };
  }

  const input = toolUse.input as Record<string, unknown>;
  switch (toolUse.name) {
    case "add_agenda_item":
      return {
        tool: "add_agenda_item",
        seriesId: String(input.seriesId),
        title: String(input.title),
        notes: typeof input.notes === "string" ? input.notes : undefined,
      };
    case "add_task":
      return {
        tool: "add_task",
        assigneeUserId: String(input.assigneeUserId),
        title: String(input.title),
        dueDate: typeof input.dueDate === "string" ? input.dueDate : undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
      };
    case "add_goal":
      return {
        tool: "add_goal",
        assigneeUserId: String(input.assigneeUserId),
        title: String(input.title),
        dueDate: typeof input.dueDate === "string" ? input.dueDate : undefined,
        notes: typeof input.notes === "string" ? input.notes : undefined,
      };
    case "set_due_date_on_pending_item":
      return {
        tool: "set_due_date_on_pending_item",
        dueDate: typeof input.dueDate === "string" ? input.dueDate : undefined,
      };
    case "create_meeting":
      return {
        tool: "create_meeting",
        title: String(input.title),
        participantUserIds: Array.isArray(input.participantUserIds)
          ? input.participantUserIds.filter((x): x is string => typeof x === "string")
          : [],
        date: String(input.date),
        time: String(input.time),
        durationMins: typeof input.durationMins === "number" ? input.durationMins : undefined,
      };
    case "small_talk":
      return {
        tool: "small_talk",
        reply: typeof input.reply === "string" ? input.reply : "You're welcome!",
      };
    default:
      return {
        tool: "ask_for_clarification",
        question: typeof input.question === "string" ? input.question : "Could you rephrase that?",
      };
  }
}

// ---------- small talk helpers ----------

function pick<T>(options: T[]): T {
  return options[Math.floor(Math.random() * options.length)];
}

const ACK_OPENERS = ["Okay, I'm on it!", "Got it!", "Sure thing!", "On it!", "You got it!"];

function formatDueDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ---------- executing the parsed action ----------

async function executeAction(
  action: ParsedAction,
  sender: { id: string },
  pendingFollowUp: PendingFollowUp
): Promise<string> {
  if (action.tool === "ask_for_clarification") {
    return action.question;
  }

  if (action.tool === "small_talk") {
    // Deliberately does NOT clear the pending due-date follow-up — "thanks!"
    // isn't an answer to "did you want a deadline for this?", but it's not a
    // rejection of it either. It just quietly expires on its own after
    // FOLLOW_UP_WINDOW_MINUTES if never answered.
    return action.reply;
  }

  if (action.tool === "set_due_date_on_pending_item") {
    if (!pendingFollowUp) {
      return "Sorry, I lost track of which item that was for — could you tell me the task or goal by name along with the due date?";
    }
    if (action.dueDate) {
      const dueDate = new Date(action.dueDate);
      if (pendingFollowUp.itemType === "task") {
        await prisma.task.update({ where: { id: pendingFollowUp.itemId }, data: { dueDate } });
      } else {
        await prisma.goal.update({ where: { id: pendingFollowUp.itemId }, data: { dueDate } });
      }
      await clearPendingFollowUps(sender.id);
      return `Perfect, set "${pendingFollowUp.itemTitle}" to be due ${formatDueDate(action.dueDate)}.`;
    }
    await clearPendingFollowUps(sender.id);
    return `No problem, I'll leave "${pendingFollowUp.itemTitle}" without a due date.`;
  }

  if (action.tool === "add_agenda_item") {
    await clearPendingFollowUps(sender.id);
    const series = await prisma.meetingSeries.findUnique({
      where: { id: action.seriesId },
      include: { participants: true },
    });
    if (!series || !series.participants.some((p) => p.userId === sender.id)) {
      return "Hmm, I couldn't add that — that doesn't look like one of your meetings.";
    }
    const instance = await getOrCreateNextInstance(series.id);
    await prisma.agendaItem.create({
      data: {
        instanceId: instance.id,
        title: action.title,
        notes: action.notes ?? "",
        addedById: sender.id,
      },
    });
    const noteAside = action.notes ? " I jotted down the extra details in the notes." : "";
    // Explicit timeZone here (and everywhere else this file formats a
    // meeting instant back to a person) because this runs server-side on
    // Vercel, whose Node runtime defaults to UTC — without it, a meeting
    // in the evening Eastern could be read back as the following day.
    return `${pick(ACK_OPENERS)} Added "${action.title}" to the agenda for ${series.name} on ${instance.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" })}.${noteAside}`;
  }

  if (action.tool === "create_meeting") {
    await clearPendingFollowUps(sender.id);

    if (!DATE_RE.test(action.date) || !TIME_RE.test(action.time)) {
      return "I couldn't quite pin down a date and time for that — could you give me something like \"next Tuesday at 2pm\"?";
    }
    const [year, month, day] = action.date.split("-").map(Number);
    const [hour, minute] = action.time.split(":").map(Number);
    const startsAt = zonedTimeToUtc(year, month - 1, day, hour, minute);
    if (Number.isNaN(startsAt.getTime())) {
      return "I couldn't quite pin down a date and time for that — could you try again?";
    }

    const requestedUsers = await prisma.user.findMany({ where: { id: { in: action.participantUserIds } } });
    const participantIds = Array.from(new Set([sender.id, ...requestedUsers.map((u) => u.id)]));
    const durationMins =
      action.durationMins && Number.isFinite(action.durationMins)
        ? Math.min(480, Math.max(5, Math.round(action.durationMins)))
        : 30;
    const seriesCount = await prisma.meetingSeries.count();

    await prisma.meetingSeries.create({
      data: {
        type: "ONE_OFF",
        name: action.title,
        durationMins,
        color: colorForIndex(seriesCount),
        participants: { create: participantIds.map((userId) => ({ userId })) },
        instances: { create: [{ startsAt }] },
      },
    });

    const others = requestedUsers.filter((u) => u.id !== sender.id).map((u) => u.name.split(" ")[0]);
    const withWho = others.length ? ` with ${others.join(", ")}` : "";
    const whenStr = startsAt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "America/New_York",
    });
    const timeStr = startsAt.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "America/New_York",
    });
    return `${pick(ACK_OPENERS)} Scheduled "${action.title}"${withWho} for ${whenStr} at ${timeStr} ET. Everyone included will see it on the Meeting Management calendar.`;
  }

  if (action.tool === "add_task") {
    await clearPendingFollowUps(sender.id);
    const assignee = await prisma.user.findUnique({ where: { id: action.assigneeUserId } });
    if (!assignee) return "I couldn't find that team member to assign the task to — could you double check the name?";
    const firstName = assignee.name.split(" ")[0];
    const task = await prisma.task.create({
      data: {
        title: action.title,
        notes: action.notes ?? "",
        assigneeId: assignee.id,
        dueDate: action.dueDate ? new Date(action.dueDate) : null,
        createdById: sender.id,
      },
    });
    const noteAside = action.notes ? " I added the extra details to its notes." : "";
    if (action.dueDate) {
      return `${pick(ACK_OPENERS)} Added a task for ${firstName}: "${action.title}" — due ${formatDueDate(action.dueDate)}.${noteAside}`;
    }
    await prisma.chatFollowUp.create({
      data: { userId: sender.id, itemType: "task", itemId: task.id, itemTitle: action.title },
    });
    return `${pick(ACK_OPENERS)} I added a task for ${firstName}: "${action.title}".${noteAside} Did you want to give ${firstName} a deadline for this? Just tell me the date, or say "no rush" if not.`;
  }

  if (action.tool === "add_goal") {
    await clearPendingFollowUps(sender.id);
    const assignee = await prisma.user.findUnique({ where: { id: action.assigneeUserId } });
    if (!assignee) return "I couldn't find that team member to assign the goal to — could you double check the name?";
    const firstName = assignee.name.split(" ")[0];
    const goal = await prisma.goal.create({
      data: {
        title: action.title,
        notes: action.notes ?? "",
        assigneeId: assignee.id,
        dueDate: action.dueDate ? new Date(action.dueDate) : null,
        createdById: sender.id,
      },
    });
    const noteAside = action.notes ? " I added the extra details to its notes." : "";
    if (action.dueDate) {
      return `${pick(ACK_OPENERS)} Added a goal for ${firstName}: "${action.title}" — target ${formatDueDate(action.dueDate)}.${noteAside}`;
    }
    await prisma.chatFollowUp.create({
      data: { userId: sender.id, itemType: "goal", itemId: goal.id, itemTitle: action.title },
    });
    return `${pick(ACK_OPENERS)} I added a goal for ${firstName}: "${action.title}".${noteAside} Did you want to set a target date for this? Just tell me the date, or say "no rush" if not.`;
  }

  return "Sorry, something went wrong handling that.";
}

async function clearPendingFollowUps(userId: string) {
  await prisma.chatFollowUp.deleteMany({ where: { userId } });
}

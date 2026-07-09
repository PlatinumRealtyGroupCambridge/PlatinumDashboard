import { prisma } from "./prisma";
import { anthropic, CHAT_BOT_MODEL } from "./anthropic";
import { getOrCreateNextInstance } from "./meetings-server";

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
// rest of this file works with.
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
  "I can only add agenda items to meetings you're part of, but tasks and goals can go to anyone on the team.";

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

  const [mySeries, allUsers] = await Promise.all([
    prisma.meetingSeries.findMany({
      where: { participants: { some: { userId: user.id } } },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ orderBy: { name: "asc" } }),
  ]);

  const action = await parseRequest(rawText, user, mySeries, allUsers);
  return executeAction(action, user);
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
  | { tool: "add_agenda_item"; seriesId: string; title: string }
  | { tool: "add_task"; assigneeUserId: string; title: string; dueDate?: string }
  | { tool: "add_goal"; assigneeUserId: string; title: string; dueDate?: string }
  | { tool: "ask_for_clarification"; question: string };

const TOOLS = [
  {
    name: "add_agenda_item",
    description:
      "Add a discussion item to the agenda of the sender's next upcoming occurrence of a meeting series. Only use a seriesId from the provided list of the sender's own meetings.",
    input_schema: {
      type: "object" as const,
      properties: {
        seriesId: { type: "string" as const, description: "id of the meeting series from the provided list" },
        title: { type: "string" as const, description: "the agenda item text" },
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
        title: { type: "string" as const },
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
        title: { type: "string" as const },
        dueDate: { type: "string" as const, description: "ISO date YYYY-MM-DD target date if mentioned; omit otherwise" },
      },
      required: ["assigneeUserId", "title"],
    },
  },
  {
    name: "ask_for_clarification",
    description:
      "Use this when the request is ambiguous, doesn't clearly map to a known meeting or person, or isn't something you can do (only add_agenda_item / add_task / add_goal are supported).",
    input_schema: {
      type: "object" as const,
      properties: { question: { type: "string" as const } },
      required: ["question"],
    },
  },
];

async function parseRequest(
  text: string,
  sender: { id: string; name: string },
  mySeries: { id: string; name: string }[],
  allUsers: { id: string; name: string }[]
): Promise<ParsedAction> {
  const today = new Date().toISOString().slice(0, 10);
  const system = `You turn a Platinum Realty team member's chat message into exactly one action by calling one of the provided tools.

Today's date: ${today}
Message sender: ${sender.name}

Meetings ${sender.name} can add agenda items to (use these exact ids, and ONLY these — the sender cannot add items to meetings they don't attend):
${mySeries.map((s) => `- ${s.id}: ${s.name}`).join("\n") || "(none)"}

Team members tasks/goals can be assigned to (use these exact ids):
${allUsers.map((u) => `- ${u.id}: ${u.name}`).join("\n")}

Resolve relative dates (like "next Friday" or "in two weeks") to an actual YYYY-MM-DD date using today's date above. If the message doesn't clearly map to adding an agenda item, task, or goal, or references a meeting/person you can't confidently match from the lists above, call ask_for_clarification instead of guessing.`;

  const response = await anthropic.messages.create({
    model: CHAT_BOT_MODEL,
    max_tokens: 512,
    system,
    messages: [{ role: "user", content: text }],
    tools: TOOLS,
    tool_choice: { type: "any" },
  });

  const toolUse = response.content.find((block) => block.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    return { tool: "ask_for_clarification", question: "Sorry, I didn't quite catch that — could you rephrase?" };
  }

  const input = toolUse.input as Record<string, unknown>;
  switch (toolUse.name) {
    case "add_agenda_item":
      return { tool: "add_agenda_item", seriesId: String(input.seriesId), title: String(input.title) };
    case "add_task":
      return {
        tool: "add_task",
        assigneeUserId: String(input.assigneeUserId),
        title: String(input.title),
        dueDate: typeof input.dueDate === "string" ? input.dueDate : undefined,
      };
    case "add_goal":
      return {
        tool: "add_goal",
        assigneeUserId: String(input.assigneeUserId),
        title: String(input.title),
        dueDate: typeof input.dueDate === "string" ? input.dueDate : undefined,
      };
    default:
      return {
        tool: "ask_for_clarification",
        question: typeof input.question === "string" ? input.question : "Could you rephrase that?",
      };
  }
}

// ---------- executing the parsed action ----------

async function executeAction(action: ParsedAction, sender: { id: string }): Promise<string> {
  if (action.tool === "ask_for_clarification") {
    return action.question;
  }

  if (action.tool === "add_agenda_item") {
    const series = await prisma.meetingSeries.findUnique({
      where: { id: action.seriesId },
      include: { participants: true },
    });
    if (!series || !series.participants.some((p) => p.userId === sender.id)) {
      return "I couldn't add that — that doesn't look like one of your meetings.";
    }
    const instance = await getOrCreateNextInstance(series.id);
    await prisma.agendaItem.create({
      data: { instanceId: instance.id, title: action.title, addedById: sender.id },
    });
    return `Added "${action.title}" to the agenda for ${series.name} on ${instance.startsAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}.`;
  }

  if (action.tool === "add_task") {
    const assignee = await prisma.user.findUnique({ where: { id: action.assigneeUserId } });
    if (!assignee) return "I couldn't find that team member to assign the task to.";
    await prisma.task.create({
      data: {
        title: action.title,
        assigneeId: assignee.id,
        dueDate: action.dueDate ? new Date(action.dueDate) : null,
        createdById: sender.id,
      },
    });
    return `Added a task for ${assignee.name.split(" ")[0]}: "${action.title}"${action.dueDate ? ` (due ${action.dueDate})` : ""}.`;
  }

  if (action.tool === "add_goal") {
    const assignee = await prisma.user.findUnique({ where: { id: action.assigneeUserId } });
    if (!assignee) return "I couldn't find that team member to assign the goal to.";
    await prisma.goal.create({
      data: {
        title: action.title,
        assigneeId: assignee.id,
        dueDate: action.dueDate ? new Date(action.dueDate) : null,
        createdById: sender.id,
      },
    });
    return `Added a goal for ${assignee.name.split(" ")[0]}: "${action.title}"${action.dueDate ? ` (target ${action.dueDate})` : ""}.`;
  }

  return "Sorry, something went wrong handling that.";
}

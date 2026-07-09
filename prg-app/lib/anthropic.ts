import Anthropic from "@anthropic-ai/sdk";

const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };

export const anthropic =
  globalForAnthropic.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

if (process.env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
}

// Overridable via env in case this default model ID is ever retired —
// see the note in .env.example. This bot's job (turning a short chat
// message into one of a few structured actions) doesn't need the biggest
// model, so a fast/cheap one keeps monthly usage costs minimal.
export const CHAT_BOT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

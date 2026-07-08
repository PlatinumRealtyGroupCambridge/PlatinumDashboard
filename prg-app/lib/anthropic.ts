import Anthropic from "@anthropic-ai/sdk";

const globalForAnthropic = globalThis as unknown as { anthropic?: Anthropic };

export const anthropic =
  globalForAnthropic.anthropic ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

if (process.env.NODE_ENV !== "production") {
  globalForAnthropic.anthropic = anthropic;
}

// Overridable via env in case this default model ID is ever retired —
// see the note in .env.example.
export const CHAT_BOT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";

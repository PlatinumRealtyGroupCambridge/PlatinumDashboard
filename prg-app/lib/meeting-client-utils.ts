"use client";

// Shared client-side helpers used by MeetingApp, TodosApp, and GoalsApp —
// kept in one place so the three stay in sync (formatting, status colors,
// the fetch wrapper, etc).

import { useEffect, useRef } from "react";
import type { SeriesData } from "./meeting-types";

// Saves `value` automatically a moment after the user stops typing, instead
// of requiring a manual Save button. Skips the very first render (that's
// just the value already loaded from the server, not a new edit), and
// cancels a pending save if the value changes again (or the component
// unmounts) before the delay elapses, so we only ever send the latest text.
export function useAutosave(value: string, onSave: (value: string) => void, delayMs = 700) {
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handle = setTimeout(() => onSave(value), delayMs);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
}

export const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const fmtTime = (d: Date) =>
  d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

// Due dates are calendar days ("Dec 1"), not moments in time, and are
// stored as UTC midnight for that calendar day (see the comment in
// app/api/tasks/[id]/route.ts). Formatting them with the viewer's LOCAL
// timezone — like fmtDate/fmtTime above correctly do for actual meeting
// times — would shift the displayed date backward by a day for anyone west
// of GMT (e.g. Dec 1 UTC midnight is 7pm Nov 30 in Eastern time). Explicitly
// formatting in UTC keeps the calendar date the same for every viewer,
// which is what a due date should do.
export const fmtDueDate = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
export const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

// Converts a stored due-date ISO string (e.g. "2026-12-01T00:00:00.000Z")
// to the "YYYY-MM-DD" form <input type="date"> expects, for pre-filling an
// edit field. The ISO string's first 10 characters are already the UTC
// calendar date, so this is a plain substring — no Date object math, and
// so nothing that could reintroduce the timezone-shift bug above.
export const isoDateOnly = (iso: string) => iso.slice(0, 10);

export function daysUntil(due: Date | null) {
  if (!due) return null;
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // `due` is a UTC-midnight instant representing a calendar day — read it
  // back with UTC getters (not local ones) so it doesn't drift to the
  // previous day for viewers west of GMT, same reasoning as fmtDueDate.
  const b = new Date(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}
export function dueStatus(due: Date | null, done: boolean) {
  if (done) return "good";
  const d = daysUntil(due);
  if (d === null) return "good";
  if (d < 0) return "crit";
  if (d <= 3) return "warn";
  return "good";
}
export function dueLabel(due: Date | null, done: boolean) {
  if (done) return "Done";
  if (!due) return "No due date";
  const d = daysUntil(due)!;
  if (d < 0) return `${Math.abs(d)}d overdue`;
  if (d === 0) return "Due today";
  return `Due ${fmtDueDate(due)}`;
}

export const GOAL_STATUS_LABEL: Record<string, string> = { GOOD: "On track", WARN: "At risk", CRIT: "Behind" };
export const GOAL_STATUS_CYCLE: Record<string, "GOOD" | "WARN" | "CRIT"> = { GOOD: "WARN", WARN: "CRIT", CRIT: "GOOD" };
export const GOAL_STATUS_CLASS: Record<string, string> = { GOOD: "good", WARN: "warn", CRIT: "crit" };

export async function apiJson(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${method} ${url} failed: ${res.status} ${text}`);
  }
  return res.json();
}

export function defaultDueDateInput() {
  // Built from LOCAL date parts on purpose (not toISOString(), which
  // converts to UTC first and can land on the wrong calendar day depending
  // on the time of day and the viewer's timezone — the same class of bug
  // described above fmtDueDate).
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function firstNameOf(u: { name: string } | undefined) {
  return u ? u.name.split(" ")[0] : "";
}

// The nearest upcoming instance for a series — used to label "next: <date>"
// in the Add to meeting picker.
export function nextInstance(series: SeriesData) {
  const now = Date.now();
  const upcoming = series.instances.filter((i) => new Date(i.startsAt).getTime() >= now);
  if (upcoming.length) return upcoming[0];
  return series.instances[series.instances.length - 1];
}

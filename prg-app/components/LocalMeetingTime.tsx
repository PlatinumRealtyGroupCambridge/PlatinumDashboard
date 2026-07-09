"use client";

import { useEffect, useState } from "react";

// The Home page is a Server Component, so if it formats a date/time
// directly, that formatting runs on Vercel's server (which runs in UTC),
// not in the visitor's own timezone — meaning everyone, regardless of
// where they actually are, would see the same UTC-based time. Every other
// page in the app (Meetings/Todos/Goals) already avoids this because their
// date formatting happens in client components using lib/meeting-client-utils,
// which runs in the visitor's browser and therefore automatically uses
// whatever timezone their computer is set to — exactly "based on where the
// user is" with no extra setup needed. This component does the same for
// the Home page's upcoming-meeting time so the whole app is consistent.
//
// It formats after mount (rather than during the initial render) on
// purpose: this component's HTML is still generated once on the server
// during the initial page load (Next.js server-renders client components
// too, before handing off to the browser), which runs in UTC — formatting
// immediately would make that first render wrong and then visibly "jump"
// once the browser takes over. Rendering a plain placeholder first and
// filling in the real local time in an effect (which only ever runs in the
// browser) avoids that mismatch/flash entirely.
export default function LocalMeetingTime({ iso, durationMins }: { iso: string; durationMins: number }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    const dateStr = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
    const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    setLabel(`${dateStr} · ${timeStr} · ${durationMins} min`);
  }, [iso, durationMins]);

  return <>{label ?? "…"}</>;
}

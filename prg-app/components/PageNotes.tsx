"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

type Note = { id: string; content: string; createdAt: string; createdByName: string | null };

function fmtNoteDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
  });
}

// Admin-only freeform notes for future development ideas/thoughts, scoped
// to whatever page they're left on (the pathname). Rendered at the bottom
// of every page from app/(app)/layout.tsx — isAdmin is checked there too,
// but this component re-checks nothing itself since the API route is the
// real gate (see app/api/page-notes/route.ts).
export default function PageNotes() {
  const pathname = usePathname();
  const [notes, setNotes] = useState<Note[]>([]);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setLoaded(false);
    fetch(`/api/page-notes?pageKey=${encodeURIComponent(pathname)}`)
      .then((res) => res.json())
      .then((json) => setNotes(json.notes ?? []))
      .catch(() => setNotes([]))
      .finally(() => setLoaded(true));
  }, [pathname]);

  async function addNote() {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    try {
      const res = await fetch("/api/page-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageKey: pathname, content }),
      });
      const json = await res.json();
      if (res.ok && json.note) {
        setNotes((prev) => [json.note, ...prev]);
        setDraft("");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ marginTop: 40 }}>
      <div className="section-label">Notes (admin only — for future development ideas)</div>
      <div className="card" style={{ padding: 16 }}>
        <div style={{ marginBottom: notes.length ? 14 : 0 }}>
          <textarea
            className="ai-notes"
            placeholder="Jot down an idea or thought about this page…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ minHeight: 60, marginTop: 0 }}
          />
          <div style={{ marginTop: 8, textAlign: "right" }}>
            <button type="button" className="btn primary" disabled={saving || !draft.trim()} onClick={addNote}>
              {saving ? "Saving…" : "Add note"}
            </button>
          </div>
        </div>

        {loaded && notes.length === 0 && (
          <p style={{ color: "var(--text-muted)", fontSize: 12.5, margin: 0 }}>No notes yet on this page.</p>
        )}

        {notes.map((n) => (
          <div key={n.id} style={{ padding: "10px 0", borderTop: "1px solid var(--border)" }}>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap" }}>{n.content}</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
              {n.createdByName ?? "Unknown"} · {fmtNoteDate(n.createdAt)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

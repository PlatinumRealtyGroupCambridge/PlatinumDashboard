"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type UserOpt = { id: string; name: string; role: string };

export default function ViewerSwitcher({
  users,
  currentUserId,
}: {
  users: UserOpt[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(currentUserId);
  const [isPending, startTransition] = useTransition();

  async function onChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const userId = e.target.value;
    setValue(userId);
    await fetch("/api/viewer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="role-switch">
      <label htmlFor="viewer-select">Viewing as</label>
      <select id="viewer-select" value={value} onChange={onChange} disabled={isPending}>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.name} — {u.role}
          </option>
        ))}
      </select>
    </div>
  );
}

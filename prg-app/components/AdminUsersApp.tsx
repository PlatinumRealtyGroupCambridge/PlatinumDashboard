"use client";

import { useState } from "react";
import { DASHBOARD_SECTIONS } from "@/lib/sections";

export type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  color: string;
  isAdmin: boolean;
  allowedSections: string[];
  hasPassword: boolean;
};

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error || `Request failed (${res.status})`);
  return json;
}

function toggleIn(list: string[], value: string) {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function SectionCheckboxes({
  selected,
  onToggle,
}: {
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="section-checkbox-grid">
      {DASHBOARD_SECTIONS.map((s) => {
        const checked = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            className={"section-checkbox" + (checked ? " checked" : "")}
            onClick={() => onToggle(s.id)}
          >
            <span className={"checkbox" + (checked ? " checked" : "")} />
            <span className="dot" style={{ background: `var(--${s.color})` }} />
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminUsersApp({
  initialUsers,
  currentUserId,
}: {
  initialUsers: AdminUser[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [openId, setOpenId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <div>
      <h1 className="page-title">Manage Users</h1>
      <p className="page-sub">
        Add, edit, or remove logins for your team, and choose which dashboards each person can
        see. Everyone with a login can use Meeting Management, To-Dos, and Goals — Meeting
        Management automatically only shows a person their own meetings.
      </p>

      <div className="admin-toolbar">
        <button type="button" className="btn primary" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Cancel" : "+ Add teammate"}
        </button>
      </div>

      {showAdd && (
        <AddUserForm
          onCreated={(user) => {
            setUsers((us) => [...us, user].sort((a, b) => a.name.localeCompare(b.name)));
            setShowAdd(false);
          }}
        />
      )}

      <table className="list-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Access</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <UserRow
              key={u.id}
              user={u}
              isSelf={u.id === currentUserId}
              open={openId === u.id}
              onToggleOpen={() => setOpenId((id) => (id === u.id ? null : u.id))}
              onSaved={(updated) =>
                setUsers((us) => us.map((x) => (x.id === updated.id ? updated : x)).sort((a, b) => a.name.localeCompare(b.name)))
              }
              onDeleted={() => {
                setUsers((us) => us.filter((x) => x.id !== u.id));
                setOpenId(null);
              }}
            />
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="empty-state">
                No users yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function AddUserForm({ onCreated }: { onCreated: (user: AdminUser) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [sections, setSections] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const { user } = await call("/api/admin/users", "POST", {
        name,
        email,
        role,
        password,
        isAdmin,
        allowedSections: sections,
      });
      onCreated(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add user.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="card admin-form" onSubmit={submit}>
      {error && <div className="login-error">{error}</div>}
      <div className="admin-form-grid">
        <label>
          Name
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Role
          <input
            type="text"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="e.g. Leasing Specialist"
            required
          />
        </label>
        <label>
          Initial password
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
          />
        </label>
      </div>
      <label className="admin-admin-toggle" onClick={() => setIsAdmin((v) => !v)}>
        <span className={"checkbox" + (isAdmin ? " checked" : "")} />
        Admin (sees every dashboard and every meeting, and can manage users)
      </label>
      {!isAdmin && (
        <>
          <div className="section-checkbox-label">Dashboards this person can see</div>
          <SectionCheckboxes selected={sections} onToggle={(id) => setSections((s) => toggleIn(s, id))} />
        </>
      )}
      <div className="admin-form-actions">
        <button type="submit" className="btn primary" disabled={saving}>
          {saving ? "Adding…" : "Add teammate"}
        </button>
      </div>
    </form>
  );
}

function UserRow({
  user,
  isSelf,
  open,
  onToggleOpen,
  onSaved,
  onDeleted,
}: {
  user: AdminUser;
  isSelf: boolean;
  open: boolean;
  onToggleOpen: () => void;
  onSaved: (user: AdminUser) => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);
  const [sections, setSections] = useState<string[]>(user.allowedSections);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = { name, email, role, isAdmin, allowedSections: sections };
      if (newPassword) body.password = newPassword;
      const { user: updated } = await call(`/api/admin/users/${user.id}`, "PATCH", body);
      setNewPassword("");
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    setError(null);
    setDeleting(true);
    try {
      await call(`/api/admin/users/${user.id}`, "DELETE");
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <>
      <tr className="clickable-row" onClick={onToggleOpen}>
        <td>
          <span className="row-expand-indicator">{open ? "▾" : "▸"}</span>
          <span className="avatar-chip" style={{ background: `var(--${user.color})`, color: "#fff", marginRight: 8 }}>
            {user.initials}
          </span>
          {user.name}
          {isSelf && <span className="owner-chip"> (you)</span>}
        </td>
        <td>{user.email}</td>
        <td>{user.role}</td>
        <td>
          {user.isAdmin ? (
            <span className="status-badge good">All access (admin)</span>
          ) : (
            <span className="owner-chip">
              {user.allowedSections.length} of {DASHBOARD_SECTIONS.length} dashboards
            </span>
          )}
          {!user.hasPassword && <span className="owner-chip"> · no password set yet</span>}
        </td>
        <td></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5}>
            <div className="detail-panel admin-edit-panel" onClick={(e) => e.stopPropagation()}>
              {error && <div className="login-error">{error}</div>}
              <div className="admin-form-grid">
                <label>
                  Name
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label>
                  Email
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label>
                  Role
                  <input type="text" value={role} onChange={(e) => setRole(e.target.value)} />
                </label>
                <label>
                  New password
                  <input
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                  />
                </label>
              </div>
              <label className="admin-admin-toggle" onClick={() => setIsAdmin((v) => !v)}>
                <span className={"checkbox" + (isAdmin ? " checked" : "")} />
                Admin (sees every dashboard and every meeting, and can manage users)
              </label>
              {!isAdmin && (
                <>
                  <div className="mini-label">Dashboards this person can see</div>
                  <SectionCheckboxes selected={sections} onToggle={(id) => setSections((s) => toggleIn(s, id))} />
                </>
              )}
              <div className="admin-form-actions">
                <button type="button" className="btn primary" onClick={save} disabled={saving}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
                <button type="button" className="btn" onClick={onToggleOpen}>
                  Minimize ▴
                </button>
                {!isSelf && !confirmingDelete && (
                  <button type="button" className="btn ghost-danger" onClick={() => setConfirmingDelete(true)}>
                    Delete user
                  </button>
                )}
                {confirmingDelete && (
                  <>
                    <span className="owner-chip">Really delete {user.name}?</span>
                    <button type="button" className="btn ghost-danger" onClick={doDelete} disabled={deleting}>
                      {deleting ? "Deleting…" : "Yes, delete"}
                    </button>
                    <button type="button" className="btn" onClick={() => setConfirmingDelete(false)}>
                      Cancel
                    </button>
                  </>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

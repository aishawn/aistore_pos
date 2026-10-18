"use client";

import { FormEvent, useMemo, useState } from "react";
import { UserSettingsScaffold } from "@/components/admin/UserSettingsScaffold";
import { AsyncState } from "@/components/admin/AsyncState";
import { api, apiFailureMessage } from "@/lib/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/lib/auth";

interface StoreUser {
  id: string | number;
  name: string;
  username: string;
  email?: string | null;
  isAdmin?: boolean;
  pendingPasswordReset?: boolean;
}

interface InviteResponse {
  inviteUrl?: string;
  emailSent?: boolean;
  mailConfigured?: boolean;
  user?: StoreUser;
}

type Panel = "none" | "invite" | "create";

export default function UsersSettingsPage() {
  const { user, ready } = useAuth();
  const { data, loading, error, reload } = useApi<StoreUser[]>("/api/users");
  const users = data ?? [];

  const [panel, setPanel] = useState<Panel>("none");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviteEmailSent, setInviteEmailSent] = useState(false);
  const [copied, setCopied] = useState(false);

  const isAdmin = Boolean(user?.isAdmin);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) => {
        if (Boolean(a.isAdmin) !== Boolean(b.isAdmin)) {
          return a.isAdmin ? -1 : 1;
        }
        return (a.name || a.username).localeCompare(b.name || b.username);
      }),
    [users],
  );

  async function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setInviteUrl(null);
    setCopied(false);
    const form = event.currentTarget;
    const fd = new FormData(form);
    setBusy(true);
    try {
      const res = await api.post<InviteResponse>("/api/auth/invite", {
        name: String(fd.get("name") ?? "").trim() || undefined,
        username: String(fd.get("username") ?? "").trim(),
        email: String(fd.get("email") ?? "").trim(),
        isAdmin: fd.get("isAdmin") === "on",
      });
      setInviteUrl(res.inviteUrl ?? null);
      setInviteEmailSent(Boolean(res.emailSent));
      form.reset();
      reload();
    } catch (err) {
      setFormError(apiFailureMessage(err, "Could not invite user.", "Session expired"));
    } finally {
      setBusy(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setInviteUrl(null);
    const form = event.currentTarget;
    const fd = new FormData(form);
    const password = String(fd.get("password") ?? "");
    if (password.length < 12) {
      setFormError("Password must be at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      await api.post<StoreUser>("/api/users", {
        name: String(fd.get("name") ?? "").trim() || undefined,
        username: String(fd.get("username") ?? "").trim(),
        email: String(fd.get("email") ?? "").trim() || undefined,
        password,
        isAdmin: fd.get("isAdmin") === "on",
      });
      form.reset();
      setPanel("none");
      reload();
    } catch (err) {
      setFormError(apiFailureMessage(err, "Could not create user.", "Session expired"));
    } finally {
      setBusy(false);
    }
  }

  async function copyInviteLink() {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setFormError("Could not copy the invite link. Select and copy it manually.");
    }
  }

  if (ready && !isAdmin) {
    return (
      <UserSettingsScaffold>
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-6 py-8 text-[16px] text-amber-950">
          Only store administrators can manage user accounts. The account created
          when you registered this store (brand site or signup) is the store admin.
        </div>
      </UserSettingsScaffold>
    );
  }

  return (
    <UserSettingsScaffold>
      <p className="mb-4 max-w-2xl text-[14px] text-neutral-600">
        Store admin for this shop only — invite or create staff who can sign in at
        this store URL. Platform-wide store listing is on{" "}
        <code className="rounded bg-neutral-100 px-1">app.orithos.com.au</code> for
        platform operators, not here.
      </p>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            setPanel(panel === "invite" ? "none" : "invite");
            setFormError(null);
            setInviteUrl(null);
          }}
          className="rounded-md border border-[#5cb3e0] px-4 py-2.5 text-[15px] font-semibold text-[var(--sf-tab-blue)]"
        >
          Invite staff
        </button>
        <button
          type="button"
          onClick={() => {
            setPanel(panel === "create" ? "none" : "create");
            setFormError(null);
            setInviteUrl(null);
          }}
          className="rounded-md border border-neutral-300 bg-white px-4 py-2.5 text-[15px] font-semibold text-neutral-800"
        >
          Create with password
        </button>
      </div>

      {panel === "invite" && (
        <form
          onSubmit={onInvite}
          className="mb-6 max-w-xl space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5"
        >
          <h3 className="text-[18px] font-semibold text-black">Invite staff</h3>
          <p className="text-[14px] text-neutral-600">
            They receive a link to set their own password. If email is not configured,
            copy the invite link below after submitting.
          </p>
          <label className="block text-[14px] font-medium text-neutral-800">
            Name
            <input
              name="name"
              maxLength={120}
              className="mt-1 h-[44px] w-full rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
          </label>
          <label className="block text-[14px] font-medium text-neutral-800">
            Username <span className="text-red-600">*</span>
            <input
              name="username"
              required
              maxLength={120}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 h-[44px] w-full rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
          </label>
          <label className="block text-[14px] font-medium text-neutral-800">
            Email <span className="text-red-600">*</span>
            <input
              name="email"
              type="email"
              required
              maxLength={255}
              className="mt-1 h-[44px] w-full rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
          </label>
          <label className="flex items-center gap-2 text-[14px] text-neutral-800">
            <input name="isAdmin" type="checkbox" className="h-4 w-4" />
            Administrator
          </label>
          {formError && <p className="text-[14px] text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[var(--sf-tab-blue)] px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Sending…" : "Send invite"}
          </button>
          {inviteUrl && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-[14px] text-emerald-950">
              <p className="font-medium">
                {inviteEmailSent
                  ? "Invite email sent. You can also share this link:"
                  : "Invite created. Copy and share this link (email was not sent):"}
              </p>
              <p className="mt-2 break-all font-mono text-[13px]">{inviteUrl}</p>
              <button
                type="button"
                onClick={() => void copyInviteLink()}
                className="mt-2 text-[14px] font-semibold text-[var(--sf-tab-blue)] underline"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          )}
        </form>
      )}

      {panel === "create" && (
        <form
          onSubmit={onCreate}
          className="mb-6 max-w-xl space-y-4 rounded-lg border border-neutral-200 bg-neutral-50 p-5"
        >
          <h3 className="text-[18px] font-semibold text-black">Create with password</h3>
          <p className="text-[14px] text-neutral-600">
            Create a staff account immediately when you can set the password in person.
          </p>
          <label className="block text-[14px] font-medium text-neutral-800">
            Name
            <input
              name="name"
              maxLength={120}
              className="mt-1 h-[44px] w-full rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
          </label>
          <label className="block text-[14px] font-medium text-neutral-800">
            Username <span className="text-red-600">*</span>
            <input
              name="username"
              required
              maxLength={120}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-1 h-[44px] w-full rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
          </label>
          <label className="block text-[14px] font-medium text-neutral-800">
            Email
            <input
              name="email"
              type="email"
              maxLength={255}
              className="mt-1 h-[44px] w-full rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
          </label>
          <label className="block text-[14px] font-medium text-neutral-800">
            Password <span className="text-red-600">*</span>
            <input
              name="password"
              type="password"
              required
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              className="mt-1 h-[44px] w-full rounded-md border border-neutral-300 px-3 text-[15px] outline-none focus:border-[#5cb3e0]"
            />
            <span className="mt-1 block text-[13px] font-normal text-neutral-500">
              At least 12 characters.
            </span>
          </label>
          <label className="flex items-center gap-2 text-[14px] text-neutral-800">
            <input name="isAdmin" type="checkbox" className="h-4 w-4" />
            Administrator
          </label>
          {formError && <p className="text-[14px] text-red-600">{formError}</p>}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-[var(--sf-tab-blue)] px-4 py-2.5 text-[15px] font-semibold text-white disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      )}

      <AsyncState loading={loading} error={error} empty={sortedUsers.length === 0} onRetry={reload}>
        <div className="overflow-hidden rounded-lg border border-neutral-200">
          <table className="w-full border-collapse text-left text-[15px]">
            <thead className="bg-neutral-50 text-[13px] uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Username</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Role</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((row) => (
                <tr key={String(row.id)} className="border-t border-neutral-200">
                  <td className="px-4 py-3 text-black">{row.name || "—"}</td>
                  <td className="px-4 py-3 font-mono text-[14px] text-neutral-800">
                    {row.username}
                  </td>
                  <td className="px-4 py-3 text-neutral-700">{row.email || "—"}</td>
                  <td className="px-4 py-3">
                    {row.isAdmin ? (
                      <span className="rounded bg-[#e8f4fc] px-2 py-1 text-[13px] font-semibold text-[var(--sf-tab-blue)]">
                        Admin
                      </span>
                    ) : (
                      <span className="text-neutral-600">Staff</span>
                    )}
                    {row.pendingPasswordReset ? (
                      <span className="ml-2 text-[13px] text-amber-700">Pending invite</span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AsyncState>
    </UserSettingsScaffold>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { UserSettingsScaffold } from "@/components/admin/UserSettingsScaffold";
import { MousePointerClickIcon, SelectChevronIcon } from "@/components/icons";
import { useApi } from "@/hooks/useApi";

interface User {
  id: string;
  name: string;
  username: string;
}

const FALLBACK_USERS = ["Admin", "Andy", "Felix", "Orithopos Integrations", "staff"];

function UserSelector({
  users,
  selectedUser,
  onSelect,
}: {
  users: string[];
  selectedUser: string | null;
  onSelect: (user: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter((name) => name.toLowerCase().includes(q));
  }, [query, users]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  return (
    <div ref={containerRef} className="relative mb-6 max-w-md">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex h-[52px] w-full items-center justify-between rounded-lg border border-neutral-300 bg-white px-4 text-left text-[16px] text-black outline-none focus:border-[#5cb3e0]"
      >
        <span className={selectedUser ? "text-black" : "text-neutral-400"}>
          {selectedUser ?? "Select Users to edit..."}
        </span>
        <SelectChevronIcon size={18} className="text-neutral-500" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-neutral-300 bg-white shadow-lg">
          <div className="border-b border-neutral-200 p-2">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search users..."
              className="h-[40px] w-full rounded-md border border-neutral-300 px-3 text-[14px] outline-none focus:border-[#5cb3e0]"
              autoFocus
            />
          </div>
          <ul className="max-h-[240px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-[14px] text-neutral-500">No users found</li>
            ) : (
              filtered.map((name) => (
                <li key={name}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(name);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`w-full px-4 py-2.5 text-left text-[16px] hover:bg-[#e8f4fc] ${
                      selectedUser === name ? "bg-[#e8f4fc] text-[var(--sf-tab-blue)]" : "text-black"
                    }`}
                  >
                    {name}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function EmptyUserSelection() {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50">
      <div className="flex items-center gap-3 text-[18px] text-neutral-500">
        <MousePointerClickIcon size={22} className="text-neutral-400" />
        Select which Users to edit...
      </div>
    </div>
  );
}

export default function UsersSettingsPage() {
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const { data } = useApi<User[]>("/api/users");

  const users = useMemo(() => {
    const fromApi = (data ?? []).map((user) => user.name).filter(Boolean);
    if (fromApi.length > 0) return fromApi;
    return FALLBACK_USERS;
  }, [data]);

  return (
    <UserSettingsScaffold>
      <UserSelector users={users} selectedUser={selectedUser} onSelect={setSelectedUser} />
      {selectedUser ? (
        <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-6 py-8 text-[16px] text-neutral-600">
          Settings for <span className="font-semibold text-black">{selectedUser}</span> will appear here.
        </div>
      ) : (
        <EmptyUserSelection />
      )}
    </UserSettingsScaffold>
  );
}

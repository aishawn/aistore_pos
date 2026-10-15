"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, registerAuthFailureHandler } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
  /** Store / outlet id. Missing on sessions cached before this field existed. */
  outletId?: number;
  /** SaaS vendor id (subdomain tenant). */
  vendorId?: number;
  email?: string | null;
  pendingPasswordReset?: boolean;
  subdomain?: string | null;
}

interface LoginResponse {
  user: CurrentUserResponse;
  redirectHost?: string | null;
  bootstrapToken?: string | null;
}

type CurrentUserResponse = Omit<AuthUser, "id"> & { id: string | number };

function normalizeUser(user: CurrentUserResponse): AuthUser {
  return { ...user, id: String(user.id) };
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string, subdomain?: string) => Promise<LoginResponse>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const USER_KEY = "sf_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unregister = registerAuthFailureHandler(() => setUser(null));
    return unregister;
  }, []);

  useEffect(() => {
    // Revalidate the HttpOnly-cookie session after mount to avoid an SSR
    // hydration mismatch and stale local user data.
    /* eslint-disable react-hooks/set-state-in-effect */
    let active = true;
    const cached = typeof localStorage !== "undefined" ? localStorage.getItem(USER_KEY) : null;
    if (cached) {
      try { setUser(JSON.parse(cached) as AuthUser); } catch { localStorage.removeItem(USER_KEY); }
    }
    void api.get<CurrentUserResponse>("/api/auth/me")
      .then((current) => {
        if (!active) return;
        const normalized = normalizeUser(current);
        setUser(normalized);
        localStorage.setItem(USER_KEY, JSON.stringify(normalized));
      })
      .catch(() => {
        // A 401 handler clears the cached identity; keep it for transient 5xx/network outages.
      })
      .finally(() => { if (active) setReady(true); });
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => { active = false; };
  }, []);

  const login = useCallback(async (username: string, password: string, subdomain?: string) => {
    const body: Record<string, string> = { username, password };
    if (subdomain?.trim()) body.subdomain = subdomain.trim().toLowerCase();
    const res = await api.post<LoginResponse>("/api/auth/login", body);
    const normalized = normalizeUser(res.user);
    setUser(normalized);
    if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(normalized));
    return res;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api.post<LoginResponse>("/api/auth/change-password", { currentPassword, newPassword });
    const normalized = normalizeUser(res.user);
    setUser(normalized);
    if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(normalized));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore network errors on logout */
    }
    setUser(null);
    if (typeof localStorage !== "undefined") localStorage.removeItem(USER_KEY);
  }, []);

  return <AuthContext.Provider value={{ user, ready, login, changePassword, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

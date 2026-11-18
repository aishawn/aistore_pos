"use client";

import { setNativeReadIdentity, clearNativeReadCache } from "./native-read-cache";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, isLocalPreviewSession, refreshAccessToken, registerAuthFailureHandler } from "@/lib/api";
import { clearRegisterContext, type WorkContextSelection } from "@/lib/work-context";
import { clearRegisterStartupPromptAcks } from "@/lib/odoo-register-startup";
export type StoreRoleCode = "ADMIN" | "MANAGER" | "CLERK" | "NONE" | string;

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  /** Store administrator — can manage staff in this vendor only. */
  isAdmin: boolean;
  /** Fixed role: ADMIN | MANAGER | CLERK | NONE */
  roleCode?: StoreRoleCode;
  /** Granted operation keys (safe_name). Admins receive the full catalog. */
  permissions?: string[];
  /**
   * SaaS platform admin (operator vendor, e.g. demo on app.*).
   * Can list all stores; distinct from store-scoped isAdmin.
   */
  platformOperator?: boolean;
  /** Store / outlet id. Missing on sessions cached before this field existed. */
  outletId?: number;
  /** SaaS vendor id (subdomain tenant). */
  vendorId?: number;
  email?: string | null;
  roleId?: number | null;
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
  return {
    ...user,
    id: String(user.id),
    roleCode: user.roleCode ?? (user.isAdmin ? "ADMIN" : "NONE"),
    permissions: Array.isArray(user.permissions) ? user.permissions : [],
  };
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  hasPermission: (safeName: string) => boolean;
  recoverSession: () => Promise<boolean>;
  login: (username: string, password: string, subdomain?: string) => Promise<LoginResponse>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => Promise<void>;
  setWorkContext: (selection: WorkContextSelection) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const USER_KEY = "sf_user";
/** Set on explicit sign-out so `/login` does not immediately bounce back in. */
export const SKIP_SESSION_RECOVER_KEY = "orithos_skip_session_recover";
let sessionEpoch = 0;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

  const recoverSession = useCallback(async () => {
    const epoch = sessionEpoch;
    const refreshed = await refreshAccessToken();
    if (refreshed !== "ok" || epoch !== sessionEpoch) return false;
    try {
      const current = await api.get<CurrentUserResponse>("/api/auth/me");
      if (epoch !== sessionEpoch) return false;
      const normalized = normalizeUser(current);
      setUser(normalized);
      if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(normalized));
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const unregister = registerAuthFailureHandler(() => {
      void recoverSession().then((ok) => {
        if (!ok) {
          setNativeReadIdentity(null);
          setUser(null);
        }
      });
    });
    return unregister;
  }, [recoverSession]);

  useEffect(() => {
    // Revalidate the HttpOnly-cookie session after mount to avoid an SSR
    // hydration mismatch and stale local user data.
    /* eslint-disable react-hooks/set-state-in-effect */
    let active = true;
    if (isLocalPreviewSession()) {
      const cached = typeof localStorage !== "undefined" ? localStorage.getItem(USER_KEY) : null;
      let previewUser: CurrentUserResponse = {
        id: "local-preview",
        name: "Local Preview",
        username: "preview",
        isAdmin: true,
      };
      if (cached) {
        try { previewUser = JSON.parse(cached) as CurrentUserResponse; } catch { localStorage.removeItem(USER_KEY); }
      }
      setUser(normalizeUser(previewUser));
      setReady(true);
      return () => { active = false; };
    }
    const cached = typeof localStorage !== "undefined" ? localStorage.getItem(USER_KEY) : null;
    if (cached) {
      try { setUser(normalizeUser(JSON.parse(cached) as CurrentUserResponse)); } catch { localStorage.removeItem(USER_KEY); }
    }
    void (async () => {
      try {
        const current = await api.get<CurrentUserResponse>("/api/auth/me");
        if (!active) return;
        const normalized = normalizeUser(current);
        setUser(normalized);
        localStorage.setItem(USER_KEY, JSON.stringify(normalized));
      } catch {
        const refreshed = await refreshAccessToken();
        if (!active) return;
        if (refreshed === "ok") {
          try {
            const current = await api.get<CurrentUserResponse>("/api/auth/me");
            if (!active) return;
            const normalized = normalizeUser(current);
            setUser(normalized);
            localStorage.setItem(USER_KEY, JSON.stringify(normalized));
            return;
          } catch {
            // Fall through to cached identity.
          }
        }
        // Keep cached identity for transient outages; only hard logout clears cookies.
      } finally {
        if (active) setReady(true);
      }
    })();
    /* eslint-enable react-hooks/set-state-in-effect */
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const syncWorkContext = () => {
      void api.get<CurrentUserResponse>("/api/auth/me").then((current) => {
        const normalized = normalizeUser(current);
        setUser(normalized);
        if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(normalized));
      }).catch(() => undefined);
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === "orithos_work_outlet_id" || event.key === "orithos_work_register_id") syncWorkContext();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    setNativeReadIdentity(ready && user ? JSON.stringify([user.id, user.vendorId, user.outletId, user.roleCode, user.permissions]) : null);
  }, [ready, user]);

  useEffect(() => {
    if (!ready || !user || isLocalPreviewSession()) return;

    let active = true;
    const refreshIntervalMs = 20 * 60 * 1000;
    let lastRefreshAt = 0;
    const refreshIfDue = (force = false) => {
      if (document.visibilityState !== "visible") return;
      if (!force && Date.now() - lastRefreshAt < refreshIntervalMs) return;
      void refreshAccessToken().then((refreshed) => {
        if (active && refreshed === "ok") lastRefreshAt = Date.now();
      });
    };
    refreshIfDue(true);
    const onFocus = () => refreshIfDue(false);
    const onVisibility = () => refreshIfDue(false);
    const interval = window.setInterval(() => refreshIfDue(false), 5 * 60 * 1000);
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [ready, user]);

  const login = useCallback(async (username: string, password: string, subdomain?: string) => {
    const body: Record<string, string> = { username, password };
    if (subdomain?.trim()) body.subdomain = subdomain.trim().toLowerCase();
    const res = await api.post<LoginResponse>("/api/auth/login", body);
    const normalized = normalizeUser(res.user);
    setUser(normalized);
    if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(normalized));
    clearRegisterStartupPromptAcks();
    return res;
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api.post<LoginResponse>("/api/auth/change-password", { currentPassword, newPassword });
    const normalized = normalizeUser(res.user);
    setUser(normalized);
    if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(normalized));
  }, []);

  const logout = useCallback(async () => {
    sessionEpoch += 1;
    setNativeReadIdentity(null);
    clearNativeReadCache();
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore network errors on logout */
    }
    setUser(null);
    if (typeof localStorage !== "undefined") localStorage.removeItem(USER_KEY);
    clearRegisterContext();
    clearRegisterStartupPromptAcks();
    if (typeof sessionStorage !== "undefined") sessionStorage.setItem(SKIP_SESSION_RECOVER_KEY, "1");
    if (typeof document !== "undefined") document.cookie = "orithos_local_preview=;path=/;max-age=0;samesite=lax";
  }, []);

  const hasPermission = useCallback((safeName: string) => {
    if (!user) return false;
    if (user.isAdmin || user.roleCode === "ADMIN") return true;
    return (user.permissions ?? []).includes(safeName);
  }, [user]);

  const setWorkContext = useCallback(async (selection: WorkContextSelection) => {
    const response = await api.post<LoginResponse>("/api/auth/work-context", {
      outletId: selection.outletId,
      registerId: selection.registerId,
      globalMode: selection.globalMode,
    });
    const normalized = normalizeUser(response.user);
    setUser(normalized);
    if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(normalized));
  }, []);

  const value = useMemo(
    () => ({ user, ready, hasPermission, recoverSession, login, changePassword, logout, setWorkContext }),
    [user, ready, hasPermission, recoverSession, login, changePassword, logout, setWorkContext],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

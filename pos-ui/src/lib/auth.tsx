"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, registerAuthFailureHandler, setToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
  /** SaaS tenant id. Missing on sessions cached before this field existed. */
  outletId?: number;
  email?: string | null;
  pendingPasswordReset?: boolean;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
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
    // Restore session from a previous login if a token is present. Done after
    // mount (not in a lazy initializer) to avoid an SSR hydration mismatch.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (getToken() && typeof localStorage !== "undefined") {
      const cached = localStorage.getItem(USER_KEY);
      if (cached) {
        try {
          setUser(JSON.parse(cached));
        } catch {
          /* ignore */
        }
      }
    }
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api.post<LoginResponse>("/api/auth/login", { username, password });
    setToken(res.accessToken);
    setUser(res.user);
    if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api.post<LoginResponse>("/api/auth/change-password", { currentPassword, newPassword });
    setToken(res.accessToken);
    setUser(res.user);
    if (typeof localStorage !== "undefined") localStorage.setItem(USER_KEY, JSON.stringify(res.user));
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore network errors on logout */
    }
    setToken(null);
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

"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  isAdmin: boolean;
  /** SaaS tenant id. Missing on sessions cached before this field existed. */
  outletId?: number;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

interface AuthState {
  user: AuthUser | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const USER_KEY = "sf_user";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);

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

  return <AuthContext.Provider value={{ user, ready, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

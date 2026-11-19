"use client";

import { isQzTrayFallbackEnabled } from "@/lib/local-hardware";

export type LocalNetworkAccessState = "granted" | "prompt" | "denied" | "unsupported";

const LOOPBACK_PERMISSION = "loopback-network";
const LOCAL_PERMISSION = "local-network";

function runtimeWindow(): Window | undefined {
  if (typeof window !== "undefined") return window;
  return (globalThis as typeof globalThis & { window?: Window }).window;
}

async function queryPermission(name: string): Promise<PermissionState | "missing"> {
  const navigator = runtimeWindow()?.navigator;
  if (!navigator?.permissions?.query) return "missing";
  try {
    const status = await navigator.permissions.query({ name: name as PermissionName });
    return status.state;
  } catch {
    return "missing";
  }
}

type AddressSpaceRequestInit = RequestInit & { targetAddressSpace?: "loopback" | "local" | "public" };

/** Resolve Chrome-style local / loopback access without querying legacy `local-network-access`. */
export async function resolveLocalNetworkAccessState(): Promise<LocalNetworkAccessState> {
  const win = runtimeWindow();
  if (!win?.isSecureContext) return "unsupported";

  const loopback = await queryPermission(LOOPBACK_PERMISSION);
  const local = await queryPermission(LOCAL_PERMISSION);

  if (loopback === "missing" && local === "missing") return "unsupported";
  if (loopback === "denied" || local === "denied") return "denied";
  if (loopback === "prompt" || local === "prompt") return "prompt";
  return "granted";
}

/** Gate hardware setup on loopback (QZ / local connector on 127.0.0.1), not LAN-only prompt lag. */
export async function resolveHardwareNetworkAccessState(): Promise<LocalNetworkAccessState> {
  const win = runtimeWindow();
  if (!win?.isSecureContext) return "unsupported";

  const loopback = await queryPermission(LOOPBACK_PERMISSION);
  if (loopback !== "missing") {
    if (loopback === "denied") return "denied";
    if (loopback === "prompt") return "prompt";
    return "granted";
  }

  const local = await queryPermission(LOCAL_PERMISSION);
  if (local === "missing") return "unsupported";
  if (local === "denied") return "denied";
  if (local === "prompt") return "prompt";
  return "granted";
}

function probeLoopbackWebSocket(port = 8181): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://127.0.0.1:${port}/`);
    } catch {
      finish();
      return;
    }
    socket.addEventListener("open", finish);
    socket.addEventListener("error", finish);
    window.setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      finish();
    }, 2000);
  });
}

/** User-gesture probe for localhost agents; triggers the browser prompt when required. */
export async function probeLoopbackAccess(): Promise<void> {
  if (typeof window === "undefined") return;
  if (isQzTrayFallbackEnabled()) {
    await probeLoopbackWebSocket(8181);
  }
  const init: AddressSpaceRequestInit = {
    method: "GET",
    mode: "cors",
    cache: "no-store",
    targetAddressSpace: "loopback",
  };
  const loopbackUrls = ["http://127.0.0.1:9170/v1/health", "http://127.0.0.1:9167/v1/health"];
  if (isQzTrayFallbackEnabled()) loopbackUrls.push("http://127.0.0.1:8181/");
  for (const url of loopbackUrls) {
    try {
      await fetch(url, init);
    } catch {
      /* QZ / connector may be offline; the permission prompt is the goal */
    }
  }
  await new Promise((resolve) => window.setTimeout(resolve, 250));
}

export async function watchLocalNetworkAccess(onChange: (state: LocalNetworkAccessState) => void): Promise<() => void> {
  const initial = await resolveLocalNetworkAccessState();
  onChange(initial);
  const navigator = runtimeWindow()?.navigator;
  if (initial === "unsupported" || initial === "granted" || !navigator?.permissions?.query) {
    return () => undefined;
  }

  const controllers: PermissionStatus[] = [];
  for (const name of [LOOPBACK_PERMISSION, LOCAL_PERMISSION]) {
    try {
      const status = await navigator!.permissions.query({ name: name as PermissionName });
      const refresh = () => void resolveLocalNetworkAccessState().then(onChange);
      status.addEventListener("change", refresh);
      controllers.push(status);
    } catch {
      /* ignore unsupported names */
    }
  }

  return () => {
    for (const status of controllers) {
      status.onchange = null;
    }
  };
}

/** User-facing hint when Chromium is too old to surface LNA UI (Chrome 142+, Edge 143+). */
export function localNetworkAccessBrowserHint(): string | null {
  const ua = runtimeWindow()?.navigator.userAgent ?? "";
  const edge = ua.match(/\bEdg\/(\d+)/);
  if (edge) {
    const major = Number(edge[1]);
    if (major < 143) {
      return `This device reports Edge ${major}. Update to Edge 143 or newer, then reload.`;
    }
    return null;
  }
  const chrome = ua.match(/\bChrome\/(\d+)/);
  if (chrome) {
    const major = Number(chrome[1]);
    if (major < 142) {
      return `This device reports Chrome ${major}. Update to Chrome 142 or newer, then reload.`;
    }
  }
  return null;
}

export async function watchHardwareNetworkAccess(onChange: (state: LocalNetworkAccessState) => void): Promise<() => void> {
  const initial = await resolveHardwareNetworkAccessState();
  onChange(initial);
  const navigator = runtimeWindow()?.navigator;
  if (initial === "unsupported" || initial === "granted" || !navigator?.permissions?.query) {
    return () => undefined;
  }

  const controllers: PermissionStatus[] = [];
  const watchNames = (await queryPermission(LOOPBACK_PERMISSION)) === "missing"
    ? [LOCAL_PERMISSION]
    : [LOOPBACK_PERMISSION];
  for (const name of watchNames) {
    try {
      const status = await navigator!.permissions.query({ name: name as PermissionName });
      const refresh = () => void resolveHardwareNetworkAccessState().then(onChange);
      status.addEventListener("change", refresh);
      controllers.push(status);
    } catch {
      /* ignore unsupported names */
    }
  }

  return () => {
    for (const status of controllers) {
      status.onchange = null;
    }
  };
}
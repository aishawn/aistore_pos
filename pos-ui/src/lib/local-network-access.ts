"use client";

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

/** User-gesture probe for QZ / localhost; triggers the browser prompt when required. */
export async function probeLoopbackAccess(): Promise<void> {
  if (typeof window === "undefined") return;
  const init: AddressSpaceRequestInit = {
    method: "HEAD",
    mode: "no-cors",
    cache: "no-store",
    targetAddressSpace: "loopback",
  };
  try {
    await fetch("http://127.0.0.1:8181/", init);
  } catch {
    /* QZ may be offline; the permission prompt is the goal */
  }
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
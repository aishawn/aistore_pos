/** Per-device register preference. Outlet scope remains in the HttpOnly JWT. */

const REGISTER_KEY = "orithos_work_register_id";
const GLOBAL_KEY = "orithos_work_global_mode";
const OUTLET_KEY = "orithos_work_outlet_id";
const ACTIVITY_PREFIX = "orithos_work_activity:";
const ACTIVITY_TTL_MS = 12 * 60 * 60 * 1000;
export const WORK_CONTEXT_EVENT = "orithos:work-context-change";
let tabId: string | null = null;
let pagehideCleanupRegistered = false;

export type WorkActivityKind = "cart" | "operation" | "unsaved";

export type WorkContextSelection = {
  outletId: number;
  registerId: number | null;
  globalMode: boolean;
};

export function readRegisterId(): number | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(REGISTER_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function readContextOutletId(): number | null {
  if (typeof localStorage === "undefined") return null;
  const parsed = Number(localStorage.getItem(OUTLET_KEY));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function currentTabId(): string | null {
  if (typeof window === "undefined") return null;
  if (!tabId) {
    tabId = typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  if (!pagehideCleanupRegistered) {
    window.addEventListener("pagehide", () => {
      if (tabId) localStorage.removeItem(`${ACTIVITY_PREFIX}${tabId}`);
    });
    pagehideCleanupRegistered = true;
  }
  return tabId;
}

export function writeWorkActivity(active: boolean, userId: string, kind: WorkActivityKind = "operation") {
  if (typeof localStorage === "undefined") return;
  const tabId = currentTabId();
  if (!tabId) return;
  const key = `${ACTIVITY_PREFIX}${tabId}`;
  if (active) {
    localStorage.setItem(key, JSON.stringify({ userId, kind, updatedAt: Date.now() }));
  } else {
    localStorage.removeItem(key);
  }
}

export function readWorkActivityInCurrentTab(userId: string): WorkActivityKind | null {
  if (typeof localStorage === "undefined") return null;
  const id = currentTabId();
  if (!id) return null;
  const key = `${ACTIVITY_PREFIX}${id}`;
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as {
      userId?: string;
      kind?: WorkActivityKind;
      updatedAt?: number;
    } | null;
    if (!value || value.userId !== userId || typeof value.updatedAt !== "number"
        || Date.now() - value.updatedAt > ACTIVITY_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return value.kind === "cart" || value.kind === "unsaved" ? value.kind : "operation";
  } catch {
    localStorage.removeItem(key);
    return null;
  }
}

export function hasBlockingWorkActivityInCurrentTab(userId: string): boolean {
  return readWorkActivityInCurrentTab(userId) === "operation";
}

export function hasWorkActivityInOtherTab(userId: string): boolean {
  if (typeof localStorage === "undefined") return false;
  const currentId = currentTabId();
  const now = Date.now();
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(ACTIVITY_PREFIX) || key === `${ACTIVITY_PREFIX}${currentId}`) continue;
    try {
      const value = JSON.parse(localStorage.getItem(key) ?? "null") as { userId?: string; updatedAt?: number } | null;
      if (!value || typeof value.updatedAt !== "number" || now - value.updatedAt > ACTIVITY_TTL_MS) {
        localStorage.removeItem(key);
        continue;
      }
      if (value.userId === userId) return true;
    } catch {
      localStorage.removeItem(key);
    }
  }
  return false;
}

export function writeRegisterContext(outletId: number, registerId: number | null) {
  if (typeof localStorage === "undefined") return;
  const previousOutletId = readContextOutletId();
  const previousRegisterId = readRegisterId();
  if (registerId == null) {
    localStorage.removeItem(REGISTER_KEY);
  } else {
    localStorage.setItem(REGISTER_KEY, String(registerId));
  }
  localStorage.setItem(OUTLET_KEY, String(outletId));
  localStorage.removeItem(GLOBAL_KEY);
  if (previousOutletId !== outletId || previousRegisterId !== registerId) {
    window.dispatchEvent(new CustomEvent(WORK_CONTEXT_EVENT, { detail: { outletId, registerId } }));
  }
}

export function clearRegisterContext() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(REGISTER_KEY);
  localStorage.removeItem(OUTLET_KEY);
  localStorage.removeItem(GLOBAL_KEY);
  window.dispatchEvent(new CustomEvent(WORK_CONTEXT_EVENT, { detail: null }));
}

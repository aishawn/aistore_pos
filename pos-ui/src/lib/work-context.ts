/** Device work context (register + global mode). Outlet scope comes from the JWT. */

const REGISTER_KEY = "orithos_work_register_id";
const GLOBAL_KEY = "orithos_work_global_mode";

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

export function writeRegisterContext(registerId: number | null, globalMode: boolean) {
  if (typeof localStorage === "undefined") return;
  if (registerId == null || globalMode) {
    localStorage.removeItem(REGISTER_KEY);
  } else {
    localStorage.setItem(REGISTER_KEY, String(registerId));
  }
  if (globalMode) {
    localStorage.setItem(GLOBAL_KEY, "1");
  } else {
    localStorage.removeItem(GLOBAL_KEY);
  }
}

export function isGlobalWorkMode(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(GLOBAL_KEY) === "1";
}
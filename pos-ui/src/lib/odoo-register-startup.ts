export const REGISTER_STARTUP_PROMPT_PREFIX = "orithos-odoo-register-startup.v1:";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function readRegisterStartupPromptAck(userId: string, storage: StorageLike = sessionStorage): boolean {
  try {
    return storage.getItem(`${REGISTER_STARTUP_PROMPT_PREFIX}${userId}`) === "1";
  } catch {
    return false;
  }
}

export function writeRegisterStartupPromptAck(userId: string, storage: StorageLike = sessionStorage): void {
  try {
    storage.setItem(`${REGISTER_STARTUP_PROMPT_PREFIX}${userId}`, "1");
  } catch {
    /* Best-effort per-login acknowledgement. */
  }
}

export function clearRegisterStartupPromptAcks(storage: StorageLike = sessionStorage): void {
  try {
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const key = storage.key(index);
      if (key?.startsWith(REGISTER_STARTUP_PROMPT_PREFIX)) storage.removeItem(key);
    }
  } catch {
    /* Ignore unavailable session storage. */
  }
}
export const PENDING_REGISTER_OPEN_KEY = "orithos.native-register-open.pending.v1";

export type PendingRegisterOpenAttempt = {
  key: string;
  userId: string;
  outletId: number;
  registerId: number;
  openingFloat: number;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function savePendingRegisterOpen(storage: StorageLike, attempt: PendingRegisterOpenAttempt): void {
  storage.setItem(PENDING_REGISTER_OPEN_KEY, JSON.stringify(attempt));
}

export function readPendingRegisterOpen(
  storage: StorageLike,
  userId: string,
  outletId: number,
): PendingRegisterOpenAttempt | null {
  const raw = storage.getItem(PENDING_REGISTER_OPEN_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingRegisterOpenAttempt> | null;
    if (!value || typeof value.key !== "string" || !value.key.trim()
        || typeof value.userId !== "string" || value.userId !== userId
        || typeof value.outletId !== "number" || !Number.isSafeInteger(value.outletId)
        || value.outletId <= 0 || value.outletId !== outletId
        || typeof value.registerId !== "number" || !Number.isSafeInteger(value.registerId)
        || value.registerId <= 0
        || typeof value.openingFloat !== "number" || !Number.isFinite(value.openingFloat)
        || value.openingFloat < 0) {
      storage.removeItem(PENDING_REGISTER_OPEN_KEY);
      return null;
    }
    return value as PendingRegisterOpenAttempt;
  } catch {
    storage.removeItem(PENDING_REGISTER_OPEN_KEY);
    return null;
  }
}

export function clearPendingRegisterOpen(storage: StorageLike): void {
  storage.removeItem(PENDING_REGISTER_OPEN_KEY);
}

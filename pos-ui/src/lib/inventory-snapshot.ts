import { randomUUID } from "node:crypto";
import type { InventoryRow, InventoryTotals } from "./inventory-report";

type Snapshot = { key: string; expires: number; rows: InventoryRow[]; totals: InventoryTotals };
const snapshots = new Map<string, Snapshot>();
const TTL = 5 * 60_000;

/** Process-local, bounded, short-lived and bound to the session, company and full query. */
export function saveInventorySnapshot(key: string, rows: InventoryRow[], totals: InventoryTotals, now = Date.now()) {
  for (const [id, snapshot] of snapshots) if (snapshot.expires <= now) snapshots.delete(id);
  while (snapshots.size >= 32) snapshots.delete(snapshots.keys().next().value!);
  const id = randomUUID();
  snapshots.set(id, { key, rows, totals, expires: now + TTL });
  return id;
}

export function getInventorySnapshot(id: string, key: string, now = Date.now()) {
  const snapshot = snapshots.get(id);
  if (!snapshot || snapshot.key !== key || snapshot.expires <= now) return null;
  return snapshot;
}

export function findInventorySnapshot(key: string, now = Date.now()) {
  for (const [id, snapshot] of snapshots) {
    if (snapshot.expires <= now) { snapshots.delete(id); continue; }
    if (snapshot.key === key) return { id, snapshot };
  }
  return null;
}

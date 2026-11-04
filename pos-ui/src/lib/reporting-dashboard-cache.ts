type Entry = { body: unknown; freshUntil: number; staleUntil: number };

const entries = new Map<string, Entry>();

/** Drop in-memory reporting dashboard entries, optionally scoped by cache-key host prefix. */
export function clearReportingCache(hostPrefix?: string) {
  if (!hostPrefix) {
    entries.clear();
    return;
  }
  for (const key of [...entries.keys()]) {
    if (key.startsWith(hostPrefix)) entries.delete(key);
  }
}

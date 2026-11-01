export type CategoryIdentity = { id: number; name: string; parent_id: [number, string] | false };

/** Match complete ancestry, so identical leaf names under different parents stay distinct. */
export function groupCategories<T extends CategoryIdentity>(records: T[]) {
  const byId = new Map(records.map((record) => [record.id, record]));
  const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toLocaleLowerCase("en-AU");
  function ancestry(record: T, visited = new Set<number>()): string[] {
    if (visited.has(record.id)) return [`#${record.id}`];
    visited.add(record.id);
    const parent = record.parent_id && byId.get(record.parent_id[0]);
    return [...(parent ? ancestry(parent, visited) : record.parent_id ? [`#${record.parent_id[0]}`] : []), normalize(record.name)];
  }
  const groups = new Map<string, T[]>();
  for (const record of records) {
    const key = JSON.stringify(ancestry(record));
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()];
}

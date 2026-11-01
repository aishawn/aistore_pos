// Keyset pagination avoids alphabetical cutoffs and offset shifts. Count checks
// fail closed if the catalogue changes during the read; the user can retry.
export async function readCompleteRows<T extends { id?: unknown }>(
  count: () => Promise<number | undefined>,
  page: (afterId: number, limit: number) => Promise<T[] | undefined>,
  maxRows = 25_000,
  pageSize = 1000,
): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 5000) {
    throw new Error("Invalid catalogue page size");
  }
  const expected = await count();
  if (!Number.isSafeInteger(expected) || expected! < 0 || expected! > maxRows) {
    throw new Error("Catalogue coverage could not be verified; no plan was generated.");
  }
  const rows: T[] = [];
  let afterId = 0;
  while (true) {
    const batch = await page(afterId, pageSize);
    if (!Array.isArray(batch)) throw new Error("Catalogue read is incomplete; no plan was generated.");
    for (const row of batch) {
      const id = Number(row.id);
      if (!Number.isSafeInteger(id) || id <= afterId) throw new Error("Catalogue pagination is incomplete; no plan was generated.");
      afterId = id;
      rows.push(row);
    }
    if (rows.length > maxRows) throw new Error("Catalogue exceeds the safe query limit; no plan was generated.");
    if (batch.length < pageSize) break;
  }
  if (rows.length !== expected || await count() !== expected) {
    throw new Error("Catalogue changed during the read; retry to generate a complete plan.");
  }
  return rows;
}

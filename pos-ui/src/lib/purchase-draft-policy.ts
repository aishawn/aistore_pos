/**
 * Draft RFQs are an opt-in capability. The environment flag alone is not
 * sufficient because the same deployment serves read-only stores as well as
 * the controlled Demo tenant.
 */
export function isPurchaseDraftEnabled(hostname: string | null | undefined): boolean {
  if (process.env.AI_PURCHASE_DRAFT_ENABLED?.trim().toLowerCase() !== "true") return false;
  const host = hostname?.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return false;
  const allowedHosts = (process.env.AI_PURCHASE_DRAFT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase().replace(/\.$/, ""))
    .filter(Boolean);
  return allowedHosts.includes(host);
}

export function draftSupplierId(lines: readonly { supplierId?: number | null }[]): number | null {
  const supplierId = lines[0]?.supplierId;
  return supplierId != null && lines.every((line) => line.supplierId === supplierId) ? supplierId : null;
}

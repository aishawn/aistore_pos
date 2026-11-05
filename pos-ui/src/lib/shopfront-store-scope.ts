type StoreBinding = { subdomain?: string | null; r2Prefix?: string | null; odooProvisionStatus?: string | null };

/**
 * SKR is the verified Shopfront source of truth. Demo mirrors the same source
 * into its own Odoo company, so reports keep the active company scope while
 * reading source evidence under the SKR store key.
 */
export function verifiedShopfrontSourceStore(binding: StoreBinding | null | undefined): string | null {
  if (!binding || binding.odooProvisionStatus !== "ready") return null;
  if (binding.subdomain === "skr" && binding.r2Prefix === "shopfront/skr/") return "skr";
  if (binding.subdomain === "demo" && binding.r2Prefix === "shopfront/demo/") return "skr";
  return null;
}

/** Source pages are read-only and already protected by Orithos permissions.
 * Keep them available when the separate Odoo service session has expired. */
export function verifiedShopfrontSourceStoreFromHost(host: string | null | undefined): string | null {
  const value = (host || "").split(",")[0].trim().toLowerCase().split(":")[0];
  if (value === "demo.orithos.com.au" || value === "skr.orithos.com.au") return "skr";
  return null;
}

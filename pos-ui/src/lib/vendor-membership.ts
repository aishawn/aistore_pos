import { api } from "@/lib/api";
import { storeOrigin } from "@/lib/tenant-host";

export type AccessibleStore = {
  vendorId: number;
  slug: string;
  name: string;
  url?: string | null;
  role: string;
  defaultOutletId?: number | null;
};

export type AccessibleStoresResponse = {
  stores: AccessibleStore[];
  multiVendorMembershipEnabled: boolean;
  activeSlug?: string | null;
};

export async function fetchAccessibleStores(): Promise<AccessibleStoresResponse> {
  return api.get<AccessibleStoresResponse>("/api/account/stores");
}

export function storeLoginUrl(slug: string): string {
  return `${storeOrigin(slug)}/login`;
}
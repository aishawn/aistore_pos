import { api } from "@/lib/api";

export type StoreCompanyProfile = {
  id: number;
  name: string;
  vat: string;
  street: string;
  city: string;
  zip: string;
  phone: string;
  email: string;
  timezone: string;
  currency: string;
  country: string;
  state: string;
};

type SettingRow = { name: string; value?: string | null };
type AuthMe = { id?: number | string; name?: string; vendorId?: number };

const DEFAULT_TIMEZONE = "Australia/Melbourne";
const DEFAULT_CURRENCY = "AUD";

function settingValue(settings: SettingRow[], key: string) {
  return settings.find((row) => row.name === key)?.value?.trim() || "";
}

export async function loadStoreCompanyProfile(): Promise<StoreCompanyProfile> {
  const [me, settings] = await Promise.all([
    api.get<AuthMe>("/api/auth/me"),
    api.get<SettingRow[]>("/api/settings", { scopeType: "vendor" }).catch(() => [] as SettingRow[]),
  ]);
  const vendorId = Number(me.vendorId ?? me.id ?? 1);
  return {
    id: vendorId,
    name: settingValue(settings, "company.name") || me.name || "Store",
    vat: settingValue(settings, "company.abn") || settingValue(settings, "company.vat"),
    street: settingValue(settings, "company.street"),
    city: settingValue(settings, "company.city"),
    zip: settingValue(settings, "company.zip") || settingValue(settings, "company.postcode"),
    phone: settingValue(settings, "company.phone"),
    email: settingValue(settings, "company.email"),
    timezone: settingValue(settings, "company.timezone") || settingValue(settings, "store.timezone") || DEFAULT_TIMEZONE,
    currency: settingValue(settings, "company.currency") || DEFAULT_CURRENCY,
    country: settingValue(settings, "company.country"),
    state: settingValue(settings, "company.state"),
  };
}

export async function saveStoreCompanyProfile(
  profile: Pick<StoreCompanyProfile, "name" | "vat" | "street" | "city" | "zip" | "phone" | "email">,
): Promise<void> {
  const entries: Array<[string, string]> = [
    ["company.name", profile.name],
    ["company.abn", profile.vat],
    ["company.street", profile.street],
    ["company.city", profile.city],
    ["company.zip", profile.zip],
    ["company.phone", profile.phone],
    ["company.email", profile.email],
  ];
  await Promise.all(entries.map(([name, value]) => api.put("/api/settings", {
    scopeType: "vendor",
    scopeId: null,
    name,
    value,
    datatype: "string",
  })));
}

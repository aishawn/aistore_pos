export type ShopfrontSyncNotificationStatus = "completed" | "partial" | "failed";
export type ShopfrontSyncCoverageRange = { fromDay: string; toDay: string };

const SHOPFRONT_TARGET_HOSTS: Record<string, Record<string, string>> = {
  skr: {
    skr: "skr.orithos.com.au",
    demo: "demo.orithos.com.au",
  },
};

export function shopfrontSyncHostsForTargets(sourceStoreKey: string, targetStoreKeys?: unknown): string[] {
  const configured = SHOPFRONT_TARGET_HOSTS[sourceStoreKey];
  if (!configured) throw new Error("unknown Shopfront source store");
  if (targetStoreKeys === undefined) return Object.values(configured);
  if (!Array.isArray(targetStoreKeys) || targetStoreKeys.length === 0
      || targetStoreKeys.some(target => typeof target !== "string")
      || new Set(targetStoreKeys).size !== targetStoreKeys.length
      || targetStoreKeys.some(target => !(target in configured))) {
    throw new Error("unknown configured target");
  }
  return targetStoreKeys.map(target => configured[target]);
}

type ApplyShopfrontSyncNotificationOptions = {
  status: ShopfrontSyncNotificationStatus;
  hosts: string[];
  at: number;
  coverageRanges: ShopfrontSyncCoverageRange[];
  latestThroughDay: string;
  record: (host: string, at: number, coverageRanges: ShopfrontSyncCoverageRange[], latestThroughDay: string) => Promise<void>;
  clear: (hostPrefix: string) => void;
};

export async function applyShopfrontSyncNotification({ status, hosts, at, coverageRanges, latestThroughDay, record, clear }:
  ApplyShopfrontSyncNotificationOptions) {
  await Promise.all(hosts.map(async host => {
    if (status === "completed") await record(host, at, coverageRanges, latestThroughDay);
    clear(`${host}|`);
  }));
}

export type ShopfrontSyncNotificationStatus = "completed" | "partial" | "failed";
export type ShopfrontSyncCoverageRange = { fromDay: string; toDay: string };

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

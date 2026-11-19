export type ShopfrontSyncNotificationStatus = "completed" | "partial" | "failed";

type ApplyShopfrontSyncNotificationOptions = {
  status: ShopfrontSyncNotificationStatus;
  hosts: string[];
  at: number;
  record: (host: string, at: number) => Promise<void>;
  clear: (hostPrefix: string) => void;
};

export async function applyShopfrontSyncNotification({ status, hosts, at, record, clear }:
  ApplyShopfrontSyncNotificationOptions) {
  await Promise.all(hosts.map(async host => {
    if (status === "completed") await record(host, at);
    clear(`${host}|`);
  }));
}

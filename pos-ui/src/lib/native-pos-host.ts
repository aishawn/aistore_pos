const NATIVE_POS_HOSTS = new Set(["skr.orithos.com.au", "demo.orithos.com.au"]);

export function isNativePosHost(hostname: string): boolean {
  return NATIVE_POS_HOSTS.has(hostname.split(":", 1)[0].trim().toLowerCase());
}

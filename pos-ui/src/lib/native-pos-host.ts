/** Hosts that use the native Orithos register/close UI. Empty while owner-locked shells use the Odoo register. */
const NATIVE_POS_HOSTS = new Set<string>();

export function isNativePosHost(hostname: string): boolean {
  return NATIVE_POS_HOSTS.has(hostname.split(":", 1)[0].trim().toLowerCase());
}

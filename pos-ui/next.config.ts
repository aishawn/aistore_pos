import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";

const liveStatusPages = [
  "/security",
  "/reports/favourites",
  "/settings/company/general",
  "/settings/company/login-after-sale",
  "/settings/company/search",
  "/settings/company/date-time",
  "/settings/data",
  "/settings/loyalty",
  "/settings/push",
  "/settings/receipts",
  "/settings/surcharging",
  "/settings/transferees",
  "/utilities/barcodes",
  "/utilities/customers",
  "/utilities/future-costs",
  "/utilities/future-prices",
  "/utilities/mail-log",
  "/utilities/products",
  "/utilities/trashed-items",
  "/products",
  "/promotion/categories",
  "/promotions",
  "/settings/pricesets",
  "/settings/roles",
  "/settings/users",
  "/utilities/vendor-connections",
  "/platform/stores/:path*",
  "/close",
  "/history/odoo",
  "/register/odoo",
  "/purchases/odoo",
  "/reports/dashboard",
  "/reports/closures/:path*",
  "/reports/daily-sales",
  "/reports/last-month-sales",
  "/reports/last-week-sales",
  "/reports/this-month-sales",
  "/reports/weekly-sales",
  "/stock/replenishment",
  "/stock/price-suggestions",
  "/customers/odoo",
  "/suppliers/odoo",
];

/** Allow phones on the LAN to use `http://<lan-ip>:3000` in `next dev`. */
function lanDevOrigins(): string[] {
  const hosts = new Set<string>(["192.168.1.10", "lvh.me", "demo.lvh.me"]);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (addr.internal) continue;
      const family = String(addr.family);
      if (family === "IPv4" || family === "4") {
        hosts.add(addr.address);
      }
    }
  }
  for (const extra of (process.env.ALLOWED_DEV_ORIGINS ?? "").split(",")) {
    const host = extra.trim();
    if (host) hosts.add(host);
  }
  return [...hosts];
}

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: false,
  allowedDevOrigins: lanDevOrigins(),
  // Browser calls same-origin /api/*; Next.js proxies to the Spring Boot backend.
  async rewrites() {
    return {
      fallback: [
        {
          source: "/api/:path*",
          destination: `${backendUrl}/api/:path*`,
        },
      ],
    };
  },
  async headers() {
    return liveStatusPages.map((source) => ({
      source,
      headers: [
        { key: "Cache-Control", value: "no-store, max-age=0" },
        { key: "CDN-Cache-Control", value: "no-store" },
        { key: "Vercel-CDN-Cache-Control", value: "no-store" },
      ],
    }));
  },
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;

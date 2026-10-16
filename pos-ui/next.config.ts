import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";

/** Allow phones on the LAN to use `http://<lan-ip>:3000` in `next dev`. */
function lanDevOrigins(): string[] {
  const hosts = new Set<string>(["192.168.1.10"]);
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
    return [
      {
        source: "/security",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/utilities/future-costs",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/utilities/future-prices",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },
  turbopack: {
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;

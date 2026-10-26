import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Rule 18: production bundles must not ship browser source maps.
  productionBrowserSourceMaps: false,
  // Docker / self-host uses standalone. Vercel injects VERCEL=1 and uses its own output.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
};

export default nextConfig;

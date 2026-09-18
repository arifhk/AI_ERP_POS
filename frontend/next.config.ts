import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Docker / self-host uses standalone. Vercel injects VERCEL=1 and uses its own output.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
};

export default nextConfig;

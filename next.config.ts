import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The planner is a highly interactive CRUD app; keep everything dynamic.
  reactStrictMode: true,
  // The generated Prisma client is huge — don't let the bundler trace/rebuild it.
  serverExternalPackages: ["@prisma/client"],
  // Brand assets are small PNGs served as-is; skipping the image optimizer
  // removes per-request image processing in dev/start and the sharp warning.
  images: { unoptimized: true },
  // No fingerprint header on every response.
  poweredByHeader: false,
};

export default nextConfig;

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
  // Keep the platform console on a clear, permanent URL while retaining the
  // existing route implementation and backward compatibility.
  async redirects() {
    return [
      { source: "/superadmin", destination: "/super-admin/dashboard", permanent: true },
      { source: "/superadmin/:path*", destination: "/super-admin/:path*", permanent: true },
    ];
  },
  async rewrites() {
    return [
      { source: "/super-admin/login", destination: "/superadmin/login" },
      { source: "/super-admin/dashboard", destination: "/superadmin" },
      { source: "/super-admin/:path*", destination: "/superadmin/:path*" },
    ];
  },
};

export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiBase = process.env.INTERNAL_API_URL || "http://127.0.0.1:8000";
    return [
      { source: "/api/backend/:path*", destination: `${apiBase}/api/:path*` },
    ];
  },
};

export default nextConfig;

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/backend/:path*",
        destination: (process.env.INTERNAL_API_URL || "http://127.0.0.1:8000") + "/api/:path*"
      },
    ];
  },
};

export default nextConfig;

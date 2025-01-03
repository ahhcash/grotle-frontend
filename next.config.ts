import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  async headers() {
    return [
      {
        source: "/api/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          {
            key: "Access-Control-Allow-Methods",
            value: "GET,POST,PUT,DELETE,OPTIONS",
          },
          { key: "Access-Control-Allow-Headers", value: "Content-Type" },
        ],
      },
    ];
  },
  images: {
    domains: ["localhost"], // Add any other domains you need to load images from
  },
  eslint: {
    // This will disable ESLint during builds
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;

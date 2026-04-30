import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone build trims node_modules into a self-contained bundle that runs
  // with `node server.js` — drastically smaller prod image.
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "http",
        hostname: "127.0.0.1",
      },
      {
        protocol: "https",
        hostname: "uploads.mangadex.org",
        pathname: "/covers/**",
      },
      {
        protocol: "https",
        hostname: "nexus.arasaka.fun",
      },
    ],
  },
};

export default nextConfig;
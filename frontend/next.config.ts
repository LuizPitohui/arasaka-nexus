import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isso força o Next.js a verificar mudanças a cada 1 segundo (Poll)
  webpack: (config) => {
    config.watchOptions = {
      poll: 1000,
      aggregateTimeout: 300,
    };
    return config;
  },
};

export default nextConfig;
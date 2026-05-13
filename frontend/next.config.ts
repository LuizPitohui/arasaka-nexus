import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import pkg from "./package.json";

// Compoe a versao bakeada no bundle. Fonte unica pra Footer, /app e qualquer
// outra exibicao. Resolucao:
//   1. env NEXT_PUBLIC_APP_VERSION (deploy pode forcar string custom)
//   2. package.json version + short SHA do HEAD (se .git acessivel)
//   3. so package.json version
function computeAppVersion(): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_VERSION;
  if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  const base = (pkg as { version?: string }).version || "0.0.0";
  try {
    const sha = execSync("git rev-parse --short=7 HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (sha) return `${base}+${sha}`;
  } catch {
    /* sem .git no build context, segue so com a base */
  }
  return base;
}

const APP_VERSION = computeAppVersion();

const nextConfig: NextConfig = {
  // Standalone build trims node_modules into a self-contained bundle that runs
  // with `node server.js` — drastically smaller prod image.
  output: "standalone",
  env: {
    NEXT_PUBLIC_APP_VERSION: APP_VERSION,
  },
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

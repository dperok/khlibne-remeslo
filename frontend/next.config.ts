import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Serve the existing compressed photos directly; Services does not route
  // the Next.js image optimizer endpoint for this frontend.
  images: { unoptimized: true },
  turbopack: { root: fileURLToPath(new URL("..", import.meta.url)) },
  outputFileTracingRoot: fileURLToPath(new URL("..", import.meta.url)),
};

export default nextConfig;

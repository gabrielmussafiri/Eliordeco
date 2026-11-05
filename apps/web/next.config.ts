import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Même origine pour le navigateur : cookies admin sans CORS.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${API_URL}/api/:path*` },
      { source: "/media/:path*", destination: `${API_URL}/media/:path*` },
    ];
  },
  images: {
    // Sur Vercel avec deux services (site + API), l'optimiseur /_next/image n'est pas joignable (404) : les images
    // sont servies telles quelles (photos déjà réduites à l'envoi, mises en cache un an par /media).
    unoptimized: true,
  },
};

export default nextConfig;

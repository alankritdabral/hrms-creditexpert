import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,

  partialPrefetching: true,

  serverExternalPackages: ["firebase-admin"],

  experimental: {
    instantInsights: {
      validationLevel: "manual-warning",
    },
  },

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  allowedDevOrigins: ["192.168.11.60", "192.168.100.7"],
};

export default nextConfig;
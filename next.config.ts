import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Force unique build ID to invalidate Netlify Durable cache
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cjvbvdzfijqhnrrbzuhl.supabase.co",
        pathname: "/storage/v1/object/public/event-images/**",
      },
    ],
  },
};

export default nextConfig;

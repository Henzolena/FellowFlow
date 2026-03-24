import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
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

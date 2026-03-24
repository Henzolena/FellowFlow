import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/register/review", "/register/success"],
      },
    ],
    sitemap: "https://fellowflow.org/sitemap.xml",
  };
}

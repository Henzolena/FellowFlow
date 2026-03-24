import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://fellowflow.org";

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${baseUrl}/register`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];

  // Dynamic event pages
  const supabase = await createClient();
  const { data: events } = await supabase
    .from("events")
    .select("id, updated_at")
    .eq("is_active", true);

  const eventRoutes: MetadataRoute.Sitemap = (events ?? []).map((event) => ({
    url: `${baseUrl}/register/${event.id}`,
    lastModified: new Date(event.updated_at),
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  return [...staticRoutes, ...eventRoutes];
}

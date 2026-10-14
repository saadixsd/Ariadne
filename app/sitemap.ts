import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Only public pages. Workspaces, the board, admin and the API are private (see robots.ts).
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/sign-up`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/sign-in`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

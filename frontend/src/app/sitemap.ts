import type { MetadataRoute } from "next";
import { canIndex, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return canIndex && siteUrl ? [{ url: new URL('/about', siteUrl).href }] : [];
}

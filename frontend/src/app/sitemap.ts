import type { MetadataRoute } from "next";
import { canIndex, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return canIndex && siteUrl
    ? ['/about', '/privacy', '/terms', '/support'].map(path => ({ url: new URL(path, siteUrl).href }))
    : [];
}

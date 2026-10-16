import type { MetadataRoute } from "next";
import { canIndex, siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // Allow crawling on the deployed site so Google can read private pages' noindex.
    rules: { userAgent: '*', ...(canIndex ? { allow: '/', disallow: '/api/' } : { disallow: '/' }) },
    ...(canIndex && siteUrl ? { sitemap: new URL('/sitemap.xml', siteUrl).href } : {}),
  };
}

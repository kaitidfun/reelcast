import type { Metadata } from "next";

export const siteName = "ReelCast";
export const siteDescription = "Create AI-powered product Reels, publish across social platforms, and track views, likes, comments, shares and affiliate link clicks with ReelCast.";

export function getSiteUrl(): URL | undefined {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!configured) return undefined;
  const url = new URL(configured);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('NEXT_PUBLIC_SITE_URL must be an HTTP(S) origin, such as https://your-domain.com');
  }
  return url;
}

export const siteUrl = getSiteUrl();
export const canIndex = process.env.NODE_ENV === 'production' && Boolean(siteUrl);
export const privateMetadata: Metadata = { robots: { index: false, follow: false } };

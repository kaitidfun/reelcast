// Shared platform metadata + icons — used by the Publish page's platform
// picker, the /distribute connections list, its distribution history, and
// the per-reel distribution status page, so all four stay visually in sync.

import { OAUTH_API_BASE_URL } from "@/lib/api";

export const PLATFORM_OPTIONS = [
  { id: "yt", name: "youtube",   label: "YouTube Shorts", shortLabel: "YT Shorts",  color: "text-red-500",    activeBg: "bg-red-500/10 border-red-500/40 ring-red-500/20"      },
  { id: "tt", name: "tiktok",    label: "TikTok",         shortLabel: "TikTok",     color: "text-foreground", activeBg: "bg-foreground/10 border-foreground/30 ring-foreground/20" },
  { id: "fb", name: "facebook",  label: "Facebook",       shortLabel: "Facebook",   color: "text-blue-500",   activeBg: "bg-blue-500/10 border-blue-500/40 ring-blue-500/20"   },
  { id: "ig", name: "instagram", label: "Instagram",      shortLabel: "Instagram",  color: "text-pink-500",   activeBg: "bg-pink-500/10 border-pink-500/40 ring-pink-500/20"   },
] as const;

export type PlatformName = "youtube" | "tiktok" | "facebook" | "instagram";

export const platformLabel = (name: string | null | undefined): string =>
  PLATFORM_OPTIONS.find((p) => p.name === name)?.label ?? (name ? name.charAt(0).toUpperCase() + name.slice(1) : "Unknown");

export const platformColor = (name: string | null | undefined): string =>
  PLATFORM_OPTIONS.find((p) => p.name === name)?.color ?? "text-muted-foreground";

/**
 * Start the OAuth connect flow for a platform. Full navigation, not fetch —
 * the browser needs to actually land on the platform's own consent screen,
 * so this can't go through a normal authenticated XHR. The token rides
 * along as a query param instead (see backend/app/routes/social_routes.py
 * for why).
 *
 * `returnTo` is a same-origin path (e.g. "/create/publish?reelId=...") the
 * backend will send the browser back to once the OAuth round-trip
 * finishes, instead of always landing on /account.
 */
export const connectSocialPlatform = (platform: string, returnTo?: string): void => {
  const token = localStorage.getItem("rf_token");
  if (!token) return;
  const params = new URLSearchParams({ token });
  if (returnTo) params.set("return_to", returnTo);
  window.location.href = `${OAUTH_API_BASE_URL}/social/${platform}/connect?${params.toString()}`;
};

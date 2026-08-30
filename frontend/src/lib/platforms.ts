// Shared platform metadata + icons — used by the Publish page's platform
// picker, the /distribute connections list, its distribution history, and
// the per-reel distribution status page, so all four stay visually in sync.

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

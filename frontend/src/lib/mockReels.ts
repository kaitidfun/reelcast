// Deterministic mock reels generator — used by ContentLibrary product cards
// (mini thumbnail grid) and the ProductReels page (full grid).
// Demo-only: no real data source. Same productId always yields the same set.

export type ReelPlatform = "tiktok" | "instagram" | "youtube" | "facebook";
export type ReelStatus = "Published" | "Scheduled" | "Draft";

export interface MockReel {
  id: string;
  productId: string;
  title: string;
  thumbnail: string; // emoji used as visual placeholder
  platform: ReelPlatform;
  status: ReelStatus;
  durationSec: number;
  views: number;
  likes: number;
  createdAt: string; // ISO
  /** Tailwind gradient classes used as the reel poster background */
  gradient: string;
}

const PLATFORMS: ReelPlatform[] = ["tiktok", "instagram", "youtube", "facebook"];
const STATUSES: ReelStatus[] = ["Published", "Published", "Published", "Scheduled", "Draft"];
const GRADIENTS = [
  "from-orange-500 via-pink-500 to-purple-600",
  "from-cyan-500 via-blue-500 to-indigo-600",
  "from-emerald-500 via-teal-500 to-cyan-600",
  "from-violet-500 via-purple-500 to-fuchsia-600",
  "from-rose-500 via-red-500 to-orange-500",
  "from-lime-400 via-emerald-500 to-teal-600",
];
const POSTER_EMOJIS = ["🎬", "✨", "🔥", "💫", "🎯", "⚡", "🌟", "🎨"];

// Stable string -> int hash so the same productId always yields the same reels.
const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
};

const titleTemplates = [
  "Why everyone is loving this",
  "POV: you found the one",
  "3 reasons to try this today",
  "Honest 30-second review",
  "Don't sleep on this drop",
  "Unboxing the hype",
  "Tutorial in 30 seconds",
  "Before vs after",
];

export const getMockReelsForProduct = (
  productId: string,
  productName: string,
  count: number,
): MockReel[] => {
  const base = hash(productId);
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const seed = base + i * 2654435761;
    const platform = PLATFORMS[seed % PLATFORMS.length];
    const status = STATUSES[(seed >> 3) % STATUSES.length];
    const gradient = GRADIENTS[(seed >> 5) % GRADIENTS.length];
    const emoji = POSTER_EMOJIS[(seed >> 7) % POSTER_EMOJIS.length];
    const title = `${titleTemplates[(seed >> 9) % titleTemplates.length]} — ${productName}`;
    const duration = 15 + ((seed >> 11) % 46); // 15-60s
    const views = 500 + ((seed >> 13) % 250_000);
    const likes = Math.floor(views * (0.02 + ((seed >> 15) % 80) / 1000));
    const createdAt = new Date(now - ((seed >> 17) % 30) * 86_400_000).toISOString();
    return {
      id: `${productId}-reel-${i + 1}`,
      productId,
      title,
      thumbnail: emoji,
      platform,
      status,
      durationSec: duration,
      views,
      likes,
      createdAt,
      gradient,
    };
  });
};

export const platformLabel: Record<ReelPlatform, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
  youtube: "YouTube Shorts",
  facebook: "Facebook",
};

export const platformEmoji: Record<ReelPlatform, string> = {
  tiktok: "🎵",
  instagram: "📸",
  youtube: "🎬",
  facebook: "📘",
};

export const formatCount = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
};

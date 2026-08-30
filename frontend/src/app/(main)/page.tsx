"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Package, Video, Clock, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useReels } from "@/hooks/useReels";
import { ReelCard } from "@/components/ReelCard";
import { getBannerGradient } from "./create/_hooks/useProductLibrary";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

type HomeCampaignProduct = { id: string; name: string; thumbnail: string | null };
type HomeCampaign = {
  id: string;
  name: string;
  description: string;
  reelsCount: number;
  bannerColor: string;
  bannerImage?: string;
  products: HomeCampaignProduct[];
  createdAt: string;
  updatedAt: string;
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

/** Mirrors library/page.tsx's own campaign fetch+mapping so the card here matches it exactly. */
function useHomeCampaigns() {
  const [campaigns, setCampaigns] = useState<HomeCampaign[]>([]);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("rf_token");
        if (!token) return;
        const res = await fetch("http://localhost:8000/api/library", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();

        const mapped: HomeCampaign[] = data.campaigns.map((c: any) => {
          const products = data.products
            .filter((p: any) => p.campaign_id === c.campaign_id)
            .map((p: any) => {
              const primaryImage = p.images?.find((img: any) => img.is_primary)?.image_url || p.images?.[0]?.image_url;
              return {
                id: p.product_id,
                name: p.product_name?.trim() || "Untitled Product",
                thumbnail: primaryImage
                  ? `http://localhost:8000/api/upload/images/${primaryImage}`
                  : p.brand_logo_url
                    ? `http://localhost:8000/api/upload/images/${p.brand_logo_url}`
                    : null,
                reelsGenerated: p.reel_count ?? 0,
              };
            });
          return {
            id: c.campaign_id,
            name: c.name,
            description: c.description || "",
            reelsCount: products.reduce((sum: number, p: any) => sum + (p.reelsGenerated || 0), 0),
            bannerColor: c.banner_color || "Twilight",
            bannerImage: c.banner_image_url || undefined,
            products,
            createdAt: c.created_at || new Date().toISOString(),
            updatedAt: c.updated_at || new Date().toISOString(),
          };
        });

        setCampaigns(mapped);
      } catch (e) {
        console.error("Failed to load campaigns:", e);
      }
    };

    load();
  }, []);

  return campaigns;
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const firstName = user?.displayName?.split(" ")[0] ?? "Creator";
  const [searchQuery, setSearchQuery] = useState("");
  const { reels, loading: reelsLoading, reload: reloadReels } = useReels();
  const campaigns = useHomeCampaigns();
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const visibleReels = (isSearching
    ? reels.filter((reel) =>
        [reel.title, reel.status].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : reels.slice(0, 4));
  const visibleCampaigns = campaigns.filter((campaign) =>
    [campaign.name, campaign.description, ...campaign.products.map((product) => product.name)].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    ),
  );
  const searchResultCount = visibleReels.length + visibleCampaigns.length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Welcome back, {firstName}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's what's happening in your studio today.</p>
        </div>
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search videos, products, campaigns…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search videos, products, and campaigns"
            className="w-full rounded-full border border-border bg-card pl-11 pr-5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
          {isSearching && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </motion.div>

      {isSearching && (
        <p className="-mt-4 text-sm text-muted-foreground">
          {searchResultCount} {searchResultCount === 1 ? "result" : "results"} for “{searchQuery.trim()}”
        </p>
      )}

      {/* Quick Actions */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <Link
          href="/create"
          className="group relative overflow-hidden rounded-2xl border-gradient bg-card p-8 min-h-[160px] flex flex-col items-center justify-center gap-3 transition-all duration-300 hover:shadow-glow-lg hover:scale-[1.01]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow transition-transform duration-300 group-hover:scale-110">
            <Plus className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold text-foreground">Create new video</span>
          <span className="text-xs text-muted-foreground">Generate a Reel with AI</span>
        </Link>

        <Link
          href="/library"
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 min-h-[160px] flex flex-col items-center justify-center gap-3 transition-all duration-300 hover:border-primary/40 hover:shadow-card hover:scale-[1.01]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary transition-transform duration-300 group-hover:scale-110">
            <Plus className="h-7 w-7 text-secondary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold text-foreground">Create new product</span>
          <span className="text-xs text-muted-foreground">Add to your product library</span>
        </Link>
      </motion.div>

      {/* Recent Videos */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Recent Videos</h2>
          {!isSearching && reels.length > 4 && (
            <Link href="/reels" className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
              View all
            </Link>
          )}
        </div>
        {reelsLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : visibleReels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
            {isSearching ? "No videos match your search." : "No reels yet — generate your first one with \"Create new video\" above."}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {visibleReels.map((reel) => (
              <ReelCard key={reel.id} reel={reel} onClick={() => router.push(`/create?reelId=${encodeURIComponent(reel.id)}`)} onChanged={reloadReels} />
            ))}
          </div>
        )}
      </motion.section>

      {/* Campaigns */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Campaigns</h2>
        {campaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No campaigns in your product library yet. <Link href="/library" className="font-medium text-primary hover:text-primary/80">Create one in Library</Link>.
          </div>
        ) : visibleCampaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No campaigns or products match your search.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {visibleCampaigns.map((campaign, i) => {
              const previewProducts = campaign.products.slice(0, 4);
              const overflow = Math.max(0, campaign.products.length - 4);
              return (
                <motion.div
                  key={campaign.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  onClick={() => router.push(`/library?campaign=${encodeURIComponent(campaign.id)}`)}
                  className="group relative rounded-2xl border border-border bg-card overflow-hidden card-shine cursor-pointer transition-all duration-300 hover:border-primary/30 hover:shadow-elevated"
                >
                  {/* Banner */}
                  <div
                    className={`relative h-28 overflow-hidden ${campaign.bannerImage ? "" : `bg-gradient-to-br ${getBannerGradient(campaign.bannerColor)}`}`}
                    style={campaign.bannerImage ? { backgroundImage: `url(${campaign.bannerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
                    {campaign.bannerImage && <div className="absolute inset-0 bg-black/30" />}
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                        {campaign.name}
                      </h3>
                      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                      {campaign.description}
                    </p>

                    {/* Mini product thumbnails grid */}
                    <div className="grid grid-cols-4 gap-1.5 mt-4">
                      {Array.from({ length: 4 }).map((_, idx) => {
                        const product = previewProducts[idx];
                        const showOverflow = idx === 3 && overflow > 0;
                        if (showOverflow) {
                          return (
                            <div key={idx} className="h-12 rounded-lg bg-muted ring-1 ring-border flex items-center justify-center text-xs font-semibold text-muted-foreground">
                              +{overflow + 1}
                            </div>
                          );
                        }
                        if (product) {
                          return (
                            <div key={idx} className="h-12 rounded-lg bg-muted ring-1 ring-border flex items-center justify-center text-xl">
                              {product.thumbnail ? <img src={product.thumbnail} alt={product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="h-10 w-10 text-muted-foreground/30" />}
                            </div>
                          );
                        }
                        return <div key={idx} className="h-12 rounded-lg border border-dashed border-border/60" />;
                      })}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        {campaign.products.length} Products
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5" />
                        {campaign.reelsCount} Reels
                      </span>
                    </div>
                    <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                      <span className="flex items-center gap-1" title={`Created ${formatDateTime(campaign.createdAt)}`}>
                        <Plus className="h-3 w-3" />
                        {formatDate(campaign.createdAt)}
                      </span>
                      <span className="flex items-center gap-1" title={`Updated ${formatDateTime(campaign.updatedAt)}`}>
                        <Clock className="h-3 w-3" />
                        {formatDate(campaign.updatedAt)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.section>

      {/* Footer */}
      <footer className="pt-12 pb-4 text-center">
        <p className="text-xs text-muted-foreground/60">Copyright © ReelCast</p>
      </footer>
    </div>
  );
}

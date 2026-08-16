"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Folder, ChevronRight, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useReels } from "@/hooks/useReels";
import { ReelCard } from "@/components/ReelCard";
import { useProductLibrary } from "./create/_hooks/useProductLibrary";

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const firstName = user?.displayName?.split(" ")[0] ?? "Creator";
  const [searchQuery, setSearchQuery] = useState("");
  const { reels, loading: reelsLoading } = useReels();
  const campaigns = useProductLibrary();
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const visibleReels = (isSearching
    ? reels.filter((reel) =>
        [reel.title, reel.status].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : reels.slice(0, 4));
  const visibleCampaigns = campaigns.filter((campaign) =>
    [
      campaign.name,
      ...campaign.products.flatMap((product) => [product.name, product.highlights]),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
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
              <ReelCard key={reel.id} reel={reel} onClick={() => router.push(`/create?reelId=${encodeURIComponent(reel.id)}`)} />
            ))}
          </div>
        )}
      </motion.section>

      {/* Campaigns */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Campaigns</h2>
        <div className="space-y-3">
          {campaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              No campaigns in your product library yet. <Link href="/library" className="font-medium text-primary hover:text-primary/80">Create one in Library</Link>.
            </div>
          ) : visibleCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              No campaigns or products match your search.
            </div>
          ) : (
            visibleCampaigns.map((campaign) => (
              <button
                key={campaign.id}
                onClick={() => router.push(`/library?campaign=${encodeURIComponent(campaign.id)}`)}
                className="group w-full flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-all duration-200 hover:border-primary/40 hover:shadow-card"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-glow shrink-0">
                  <Folder className="h-5 w-5 text-primary-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-display text-sm font-semibold text-foreground truncate">{campaign.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {campaign.products.length} {campaign.products.length === 1 ? "product" : "products"}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
              </button>
            ))
          )}
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="pt-12 pb-4 text-center">
        <p className="text-xs text-muted-foreground/60">Copyright © ReelCast</p>
      </footer>
    </div>
  );
}

"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useReels } from "@/hooks/useReels";
import { useCampaigns } from "@/hooks/useCampaigns";
import { ReelCard } from "@/components/ReelCard";
import { CampaignCard } from "@/components/CampaignCard";
import { reelClickTarget } from "@/lib/reel-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchClearButton } from "@/components/ui/search-clear-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RECENT_REELS_COLLAPSED_SIZE = 4;
const RECENT_CAMPAIGNS_COLLAPSED_SIZE = 6;

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const firstName = user?.displayName?.split(" ")[0] ?? "Creator";
  const [searchQuery, setSearchQuery] = useState("");
  const [publishFilter, setPublishFilter] = useState("all");
  const [reelsExpanded, setReelsExpanded] = useState(false);
  const [campaignsExpanded, setCampaignsExpanded] = useState(false);
  const { reels, loading: reelsLoading, reload: reloadReels } = useReels();
  const { campaigns } = useCampaigns();
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const publishFilteredReels = reels.filter(
    (reel) =>
      publishFilter === "all" ||
      (publishFilter === "published" ? reel.hasDistribution : !reel.hasDistribution),
  );
  const visibleReels = isSearching
    ? publishFilteredReels.filter((reel) =>
        [reel.title, reel.status].some((value) => value.toLocaleLowerCase().includes(normalizedQuery)),
      )
    : reelsExpanded
      ? publishFilteredReels
      : publishFilteredReels.slice(0, RECENT_REELS_COLLAPSED_SIZE);
  const searchedCampaigns = campaigns.filter((campaign) =>
    [campaign.name, campaign.description, ...campaign.products.map((product) => product.name)].some((value) =>
      value.toLocaleLowerCase().includes(normalizedQuery),
    ),
  );
  const visibleCampaigns = isSearching
    ? searchedCampaigns
    : campaignsExpanded
      ? searchedCampaigns
      : searchedCampaigns.slice(0, RECENT_CAMPAIGNS_COLLAPSED_SIZE);
  const searchResultCount = visibleReels.length + visibleCampaigns.length;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <motion.div {...fadeUp} transition={{ duration: 0.4 }}>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
          Welcome back, {firstName}!
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Here's what's happening in your studio today.</p>
      </motion.div>

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

      {/* Search + filter — sits above Recently Reels, applies to both sections below */}
      <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.15 }} className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search reels, products, campaigns…"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            aria-label="Search reels, products, and campaigns"
            className="h-9 pl-8 pr-9 text-xs"
          />
          {isSearching && <SearchClearButton onClear={() => setSearchQuery("")} />}
        </div>
        <Select value={publishFilter} onValueChange={setPublishFilter}>
          <SelectTrigger aria-label="Filter by publish status" className="h-9 w-[180px] shrink-0 justify-start gap-2 text-xs [&>svg:last-child]:ml-auto">
            <Send className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <SelectValue placeholder="Publish status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Published or not</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="unpublished">Not published</SelectItem>
          </SelectContent>
        </Select>
      </motion.div>

      {isSearching && (
        <p className="-mt-4 text-sm text-muted-foreground">
          {searchResultCount} {searchResultCount === 1 ? "result" : "results"} for “{searchQuery.trim()}”
        </p>
      )}

      {/* Recently Reels */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Recently Reels</h2>
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
              <ReelCard key={reel.id} reel={reel} onClick={() => router.push(reelClickTarget(reel))} onChanged={reloadReels} />
            ))}
          </div>
        )}
        {!isSearching && !reelsExpanded && publishFilteredReels.length > RECENT_REELS_COLLAPSED_SIZE && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setReelsExpanded(true)}>Show all</Button>
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
            {visibleCampaigns.map((campaign, i) => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                index={i}
                onClick={() => router.push(`/library?campaign=${encodeURIComponent(campaign.id)}`)}
              />
            ))}
          </div>
        )}
        {!isSearching && !campaignsExpanded && searchedCampaigns.length > RECENT_CAMPAIGNS_COLLAPSED_SIZE && (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setCampaignsExpanded(true)}>Show all</Button>
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

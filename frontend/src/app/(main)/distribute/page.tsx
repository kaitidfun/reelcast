"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Send, Clock, Trash2, Settings2, LayoutGrid, Clapperboard, Share2, CircleDot, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useReels } from "@/hooks/useReels";
import { useCampaigns } from "@/hooks/useCampaigns";
import { API_BASE_URL } from "@/lib/api";
import { PlatformIcon } from "@/components/PlatformIcon";
import { platformLabel } from "@/lib/platforms";
import { ReelCard } from "@/components/ReelCard";
import { CampaignCard } from "@/components/CampaignCard";

const HISTORY_COLLAPSED_SIZE = 5;
const CONNECTABLE_PLATFORM_COUNT = 4;

const STATUS_BADGE: Record<string, string> = {
  Pending: "bg-warning/10 text-warning ring-1 ring-warning/20",
  Uploading: "bg-info/10 text-info ring-1 ring-info/20",
  Published: "bg-success/10 text-success ring-1 ring-success/20",
  Failed: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
};

const DISTRIBUTION_STATUSES = ["Pending", "Uploading", "Published", "Failed"];
const PAGE_SIZE = 10;

type DistributionView = "platforms" | "reels" | "campaigns";

type SocialAccount = { account_id: string; platform_name: string };
type DistributionItem = {
  distribution_id: string;
  reel_id: string | null;
  account_id: string | null;
  scheduled_time: string | null;
  status: string;
  error_message: string | null;
  reel_prompt: string | null;
  reel_name: string | null;
  platform_name: string | null;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const Distribution = () => {
  const { toast } = useToast();
  const router = useRouter();
  const { reels } = useReels({ limit: 100 });
  const { reels: distributedReels, loading: distributedReelsLoading, reload: reloadDistributedReels } = useReels({ limit: 200, distributedOnly: true });
  const { campaigns, loading: campaignsLoading } = useCampaigns();
  const [distributedCampaignIds, setDistributedCampaignIds] = useState<string[]>([]);

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [distributions, setDistributions] = useState<DistributionItem[]>([]);
  const [matchedReelIds, setMatchedReelIds] = useState<string[]>([]);
  const [matchedCampaignIds, setMatchedCampaignIds] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [filterReelId, setFilterReelId] = useState("all");
  const [filterAccountId, setFilterAccountId] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [page, setPage] = useState(0);
  const [distributionView, setDistributionView] = useState<DistributionView>("platforms");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const loadAll = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const headers = authHeaders();
      if (!headers.Authorization) return;
      const distributionParams = new URLSearchParams({
        skip: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      if (filterReelId !== "all") distributionParams.set("reel_id", filterReelId);
      if (filterAccountId !== "all") distributionParams.set("account_id", filterAccountId);
      if (filterStatus !== "all") distributionParams.set("status_filter", filterStatus);
      if (searchQuery) distributionParams.set("search", searchQuery);
      const [accountsRes, distRes] = await Promise.all([
        fetch(`${API_BASE_URL}/social/accounts`, { headers }),
        fetch(`${API_BASE_URL}/distributions?${distributionParams.toString()}`, { headers }),
      ]);
      if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts ?? []);
      if (distRes.ok) {
        const data = await distRes.json();
        setDistributions(data.distributions ?? []);
        setTotal(data.total ?? 0);
        setMatchedReelIds(data.matched_reel_ids ?? []);
        setMatchedCampaignIds(data.matched_campaign_ids ?? []);
      }
    } catch (e) {
      console.error("Failed to load distribution data:", e);
    } finally {
      if (!background) setLoading(false);
    }
  }, [filterAccountId, filterReelId, filterStatus, page, searchQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(search.trim());
      setPage(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const headers = authHeaders();
    if (!headers.Authorization) return;
    fetch(`${API_BASE_URL}/distributions/recent-campaigns?limit=200`, { headers })
      .then((res) => (res.ok ? res.json() : { campaign_ids: [] }))
      .then((data) => setDistributedCampaignIds(data.campaign_ids ?? []))
      .catch(() => setDistributedCampaignIds([]));
  }, []);

  // Publishing runs in Celery after the page has loaded. Poll only while a
  // distribution is active so the final status appears without a manual reload.
  useEffect(() => {
    if (!distributions.some((distribution) => distribution.status === "Uploading")) return;
    const timer = window.setInterval(() => { void loadAll(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [distributions, loadAll]);

  const handleCancel = async (distributionId: string) => {
    const res = await fetch(`${API_BASE_URL}/distributions/${distributionId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      toast({ title: "Cancelled" });
      loadAll();
    }
  };

  const handlePublishNow = async (distributionId: string) => {
    const res = await fetch(`${API_BASE_URL}/distributions/${distributionId}/publish-now`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      toast({ title: "Publishing…" });
      loadAll();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Could not publish", description: err.detail, variant: "destructive" });
    }
  };

  const filteredDistributedReels = distributedReels.filter((reel) => matchedReelIds.includes(reel.id));
  const filteredDistributedCampaigns = distributedCampaignIds
    .map((id) => campaigns.find((c) => c.id === id))
    .filter((campaign): campaign is NonNullable<typeof campaign> => (
      campaign !== undefined && matchedCampaignIds.includes(campaign.id)
    ));

  const visibleDistributions = historyExpanded ? distributions : distributions.slice(0, HISTORY_COLLAPSED_SIZE);
  const hasActiveFilters = Boolean(
    searchQuery || filterReelId !== "all" || filterAccountId !== "all" || filterStatus !== "all"
  );

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Distribution</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">Publish Reels to YouTube Shorts, TikTok, Facebook, and Instagram</p>
      </div>

      {/* Connection status strip — full connect/disconnect controls live on Settings now */}
      <Link
        href="/account"
        className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-primary/30 sm:px-5"
      >
        <span className="min-w-0 truncate text-sm text-foreground">
          <span className="font-semibold">{accounts.length}/{CONNECTABLE_PLATFORM_COUNT}</span> platforms Connected
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
          <Settings2 className="h-3.5 w-3.5" />
          Manage in Settings
        </span>
      </Link>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-info" />
          <h2 className="font-display text-lg font-semibold text-foreground">
            {distributionView === "platforms" && "Distributed Platforms"}
            {distributionView === "reels" && "Distributed Reels"}
            {distributionView === "campaigns" && "Distributed Campaigns"}
          </h2>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 lg:max-w-4xl">
          <Select value={distributionView} onValueChange={(value) => setDistributionView(value as DistributionView)}>
            <SelectTrigger className="justify-start gap-2 [&>svg:last-child]:ml-auto" aria-label="Filter by distribution type">
              <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="platforms">Distributed Platforms</SelectItem>
              <SelectItem value="reels">Distributed Reels</SelectItem>
              <SelectItem value="campaigns">Distributed Campaigns</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterReelId} onValueChange={(value) => { setFilterReelId(value); setPage(0); }}>
            <SelectTrigger className="justify-start gap-2 [&>svg:last-child]:ml-auto" aria-label="Filter by reel">
              <Clapperboard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <SelectValue placeholder="All Reels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Reels</SelectItem>
              {reels.map((reel) => <SelectItem key={reel.id} value={reel.id}>{reel.title.slice(0, 40)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterAccountId} onValueChange={(value) => { setFilterAccountId(value); setPage(0); }}>
            <SelectTrigger className="justify-start gap-2 [&>svg:last-child]:ml-auto" aria-label="Filter by platform">
              <Share2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <SelectValue placeholder="All Platforms" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Platforms</SelectItem>
              {accounts.map((account) => <SelectItem key={account.account_id} value={account.account_id} className="capitalize">{account.platform_name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={(value) => { setFilterStatus(value); setPage(0); }}>
            <SelectTrigger className="justify-start gap-2 [&>svg:last-child]:ml-auto" aria-label="Filter by status">
              <CircleDot className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {DISTRIBUTION_STATUSES.map((status) => <SelectItem key={status} value={status}>{status}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="relative min-w-[220px]">
        <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search reels, platforms, or statuses…"
          aria-label="Search distributions"
          className="h-10 border-border bg-card pl-10"
        />
      </div>

      {/* Distributed Platforms */}
      {distributionView === "platforms" && (
        <motion.div className="min-w-0" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">Loading…</div>
        ) : distributions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">
            {hasActiveFilters
              ? "No distributions match your search and filters."
              : "No distributions yet. Publish a completed Reel to a connected account from the Create page."}
          </div>
        ) : (
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="divide-y divide-border">
              {visibleDistributions.map((d, i) => (
                <motion.div
                  key={d.distribution_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  onClick={() => d.reel_id && router.push(`/distribute/${d.reel_id}`)}
                  className={`flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4 ${d.reel_id ? "cursor-pointer hover:bg-muted/20" : ""} transition-colors`}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                      d.status === "Published" ? "bg-success/10 ring-success/20" : "bg-info/10 ring-info/20"
                    }`}>
                      <Send className={`h-4 w-4 ${d.status === "Published" ? "text-success" : "text-info"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{d.reel_name || d.reel_prompt || "(reel)"}</p>
                      <p className="flex items-center gap-1 break-words text-xs text-muted-foreground capitalize">
                        <PlatformIcon platform={d.platform_name ?? ""} className="h-3 w-3 shrink-0" />
                        {platformLabel(d.platform_name)}
                        {d.error_message ? ` — ${d.error_message}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end sm:gap-3" onClick={(e) => e.stopPropagation()}>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[d.status] ?? "bg-muted text-muted-foreground ring-1 ring-border"}`}>
                      {d.status}
                    </span>
                    {d.scheduled_time && (
                      <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(d.scheduled_time).toLocaleString()}
                      </span>
                    )}
                    {(d.status === "Pending" || d.status === "Failed") && (
                      <Button variant="outline" size="sm" onClick={() => handlePublishNow(d.distribution_id)} className="flex-1 sm:flex-none">
                        Publish now
                      </Button>
                    )}
                    {d.status !== "Uploading" && d.status !== "Published" && (
                      <Button variant="ghost" size="icon" onClick={() => handleCancel(d.distribution_id)} title="Cancel">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {!historyExpanded && distributions.length > HISTORY_COLLAPSED_SIZE && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setHistoryExpanded(true)}>Show all</Button>
          </div>
        )}

        {historyExpanded && total > PAGE_SIZE && (
          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="tabular-nums">Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        )}
        </motion.div>
      )}

      {/* Distributed Reels */}
      {distributionView === "reels" && (
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="min-w-0">
          {loading || distributedReelsLoading ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">Loading…</div>
          ) : filteredDistributedReels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              {hasActiveFilters ? "No distributed reels match your search and filters." : "No reels have been distributed yet."}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {filteredDistributedReels.map((reel) => (
                <ReelCard key={reel.id} reel={reel} onClick={() => router.push(`/distribute/${reel.id}`)} onChanged={reloadDistributedReels} />
              ))}
            </div>
          )}
        </motion.section>
      )}

      {/* Distributed Campaigns */}
      {distributionView === "campaigns" && (
        <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="min-w-0">
          {loading || campaignsLoading ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">Loading…</div>
          ) : filteredDistributedCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
              {hasActiveFilters ? "No distributed campaigns match your search and filters." : "No campaigns have been distributed yet."}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filteredDistributedCampaigns.map((campaign, i) => (
                <CampaignCard
                  key={campaign.id}
                  campaign={campaign}
                  index={i}
                  onClick={() => router.push(`/distribute/campaign/${campaign.id}`)}
                />
              ))}
            </div>
          )}
        </motion.section>
      )}
    </div>
  );
};

export default Distribution;

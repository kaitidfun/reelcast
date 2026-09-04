"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Send, Clock, Trash2, Search, Settings2, List, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";
import { useReels } from "@/hooks/useReels";
import { useCampaigns } from "@/hooks/useCampaigns";
import { API_BASE_URL } from "@/lib/api";
import { PlatformIcon } from "@/components/PlatformIcon";
import { platformLabel, PLATFORM_OPTIONS } from "@/lib/platforms";
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
const PLATFORM_BADGE: Record<string, string> = {
  Pending: "bg-warning/15 text-warning ring-warning/30",
  Uploading: "bg-info/15 text-info ring-info/30",
  Published: "bg-success/15 text-success ring-success/30",
  Failed: "bg-destructive/15 text-destructive ring-destructive/30",
};

const STATUS_CHIPS = ["all", "Pending", "Uploading", "Published", "Failed"] as const;
const PAGE_SIZE = 10;

type SocialAccount = { account_id: string; platform_name: string };
type PlatformDistribution = {
  distribution_id: string;
  account_id: string | null;
  platform_name: string | null;
  status: string;
  scheduled_time: string | null;
  created_at: string | null;
  error_message: string | null;
  post_url: string | null;
};
type ReelDistributionGroup = {
  reel_id: string;
  reel_name: string | null;
  reel_prompt: string | null;
  last_activity_at: string | null;
  platforms: PlatformDistribution[];
};
// One platform's row in the flat list — a group's platform entry plus the
// reel context it belongs to, so each row still reads like a standalone item.
type FlatRow = PlatformDistribution & {
  reel_id: string;
  reel_name: string | null;
  reel_prompt: string | null;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const Distribution = () => {
  const { toast } = useToast();
  const router = useRouter();
  const { reels: recentDistributedReels, reload: reloadRecentReels } = useReels({ limit: 4, distributedOnly: true });
  const { campaigns } = useCampaigns();
  const [recentCampaignIds, setRecentCampaignIds] = useState<string[]>([]);

  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [groups, setGroups] = useState<ReelDistributionGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filterAccountId, setFilterAccountId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<(typeof STATUS_CHIPS)[number]>("all");
  const [page, setPage] = useState(0);

  // Debounce search typing before it drives a fetch.
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setPage(0);
  }, [filterAccountId, filterStatus, debouncedSearch]);

  const loadAll = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    try {
      const headers = authHeaders();
      if (!headers.Authorization) return;
      const groupParams = new URLSearchParams({
        skip: String(page * PAGE_SIZE),
        limit: String(PAGE_SIZE),
      });
      if (debouncedSearch) groupParams.set("search", debouncedSearch);
      if (filterAccountId !== "all") groupParams.set("account_id", filterAccountId);
      if (filterStatus !== "all") groupParams.set("status_filter", filterStatus);
      const [accountsRes, groupsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/social/accounts`, { headers }),
        fetch(`${API_BASE_URL}/distributions/by-reel?${groupParams.toString()}`, { headers }),
      ]);
      if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts ?? []);
      if (groupsRes.ok) {
        const data = await groupsRes.json();
        setGroups(data.reels ?? []);
        setTotal(data.total ?? 0);
      }
    } catch (e) {
      console.error("Failed to load distribution data:", e);
    } finally {
      if (!background) setLoading(false);
    }
  }, [filterAccountId, filterStatus, debouncedSearch, page]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const headers = authHeaders();
    if (!headers.Authorization) return;
    fetch(`${API_BASE_URL}/distributions/recent-campaigns?limit=6`, { headers })
      .then((res) => (res.ok ? res.json() : { campaign_ids: [] }))
      .then((data) => setRecentCampaignIds(data.campaign_ids ?? []))
      .catch(() => setRecentCampaignIds([]));
  }, []);

  // Flat rows: each group's platforms expanded to standalone rows, newest activity first.
  const flatRows = useMemo<FlatRow[]>(() => {
    return groups
      .flatMap((group) =>
        group.platforms.map((p) => ({
          ...p,
          reel_id: group.reel_id,
          reel_name: group.reel_name,
          reel_prompt: group.reel_prompt,
        })),
      )
      .sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime());
  }, [groups]);

  // Publishing runs in Celery after the page has loaded. Poll only while a
  // distribution is active so the final status appears without a manual reload.
  useEffect(() => {
    const anyUploading = groups.some((group) => group.platforms.some((p) => p.status === "Uploading"));
    if (!anyUploading) return;
    const timer = window.setInterval(() => { void loadAll(true); }, 5000);
    return () => window.clearInterval(timer);
  }, [groups, loadAll]);

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

  const recentCampaigns = recentCampaignIds
    .map((id) => campaigns.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const visibleFlatRows = historyExpanded ? flatRows : flatRows.slice(0, HISTORY_COLLAPSED_SIZE);
  const visibleGroups = historyExpanded ? groups : groups.slice(0, HISTORY_COLLAPSED_SIZE);
  const isEmpty = viewMode === "flat" ? flatRows.length === 0 : groups.length === 0;
  const rowCount = viewMode === "flat" ? flatRows.length : groups.length;
  const filtersActive = Boolean(search) || filterStatus !== "all" || filterAccountId !== "all";

  return (
    <div className="min-w-0 space-y-6 sm:space-y-8">
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-foreground sm:text-3xl">Distribution</h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">Publish Reels to YouTube Shorts, TikTok, Facebook, and Instagram</p>
      </div>

      {/* Connection status strip — full connect/disconnect controls live on Settings now */}
      <Link
        href="/account"
        className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-primary/30 sm:px-5"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="min-w-0 truncate text-sm text-foreground">
            <span className="font-semibold">{accounts.length}/{CONNECTABLE_PLATFORM_COUNT}</span> platforms connected
          </span>
          <div className="flex items-center gap-1.5">
            {PLATFORM_OPTIONS.map((p) => {
              const connected = accounts.some((a) => a.platform_name === p.name);
              return (
                <span
                  key={p.id}
                  title={`${p.label}${connected ? " — connected" : " — not connected"}`}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                    connected ? `${p.activeBg} ${p.color}` : "bg-muted text-muted-foreground/40"
                  }`}
                >
                  <PlatformIcon platform={p.name} className="h-3.5 w-3.5" />
                </span>
              );
            })}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary">
          <Settings2 className="h-3.5 w-3.5" />
          Manage in Settings
        </span>
      </Link>

      {/* Distributions */}
      <motion.div className="min-w-0" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-info" />
            <h2 className="font-display text-lg font-semibold text-foreground">Distributions</h2>
          </div>
          <ToggleGroup
            type="single"
            value={viewMode}
            onValueChange={(v) => v && setViewMode(v as "flat" | "grouped")}
            className="bg-card border border-border rounded-lg p-0.5 h-9"
          >
            <ToggleGroupItem value="flat" aria-label="Flat list" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
              <List className="!h-3.5 !w-3.5" /> List
            </ToggleGroupItem>
            <ToggleGroupItem value="grouped" aria-label="Grouped by reel" className="h-8 gap-1.5 rounded-md px-2.5 text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
              <Layers className="!h-3.5 !w-3.5" /> By reel
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5">
            {STATUS_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setFilterStatus(chip)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterStatus === chip
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {chip === "all" ? "All" : chip}
              </button>
            ))}
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-56">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reels…"
                className="h-9 pl-8 text-xs"
              />
            </div>
            <Select value={filterAccountId} onValueChange={setFilterAccountId}>
              <SelectTrigger aria-label="Filter by platform" className="h-9 w-[150px] shrink-0 text-xs">
                <SelectValue placeholder="All platforms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All platforms</SelectItem>
                {accounts.map((account) => <SelectItem key={account.account_id} value={account.account_id} className="capitalize">{account.platform_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">Loading…</div>
        ) : isEmpty ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground sm:p-12 sm:text-base">
            {filtersActive
              ? "No distributions match your filters."
              : "No distributions yet. Publish a completed Reel to a connected account from the Create page."}
          </div>
        ) : viewMode === "flat" ? (
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="divide-y divide-border">
              {visibleFlatRows.map((d, i) => (
                <motion.div
                  key={d.distribution_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  onClick={() => router.push(`/distribute/${d.reel_id}`)}
                  className="flex cursor-pointer flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4"
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
        ) : (
          <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-card">
            <div className="divide-y divide-border">
              {visibleGroups.map((group, i) => (
                <motion.div
                  key={group.reel_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  onClick={() => router.push(`/distribute/${group.reel_id}`)}
                  className="flex cursor-pointer flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-muted/20 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6 sm:py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{group.reel_name || group.reel_prompt || "(reel)"}</p>
                    {group.last_activity_at && (
                      <p className="text-xs text-muted-foreground">{new Date(group.last_activity_at).toLocaleString()}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {group.platforms.map((p) => (
                      <span
                        key={p.distribution_id}
                        title={`${p.platform_name ?? "Unknown"} — ${p.status}${p.error_message ? `: ${p.error_message}` : ""}`}
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ring-1 ${PLATFORM_BADGE[p.status] ?? "bg-muted text-muted-foreground ring-border"}`}
                      >
                        <PlatformIcon platform={p.platform_name ?? ""} className="h-3.5 w-3.5" />
                      </span>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {!historyExpanded && rowCount > HISTORY_COLLAPSED_SIZE && (
          <div className="mt-4 flex justify-center">
            <Button variant="outline" size="sm" onClick={() => setHistoryExpanded(true)}>Show all</Button>
          </div>
        )}

        {historyExpanded && total > PAGE_SIZE && (
          <div className="mt-4 flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span className="tabular-nums">Showing reel {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</span>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((current) => current + 1)}>Next</Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Recently Distributed Reels */}
      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Recently Distributed Reels</h2>
        {recentDistributedReels.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No reels have been distributed yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {recentDistributedReels.map((reel) => (
              <ReelCard key={reel.id} reel={reel} onClick={() => router.push(`/distribute/${reel.id}`)} onChanged={reloadRecentReels} />
            ))}
          </div>
        )}
      </motion.section>

      {/* Recently Distributed Campaigns */}
      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Recently Distributed Campaigns</h2>
        {recentCampaigns.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground">
            No campaigns have been distributed yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {recentCampaigns.map((campaign, i) => (
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
    </div>
  );
};

export default Distribution;

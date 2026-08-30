"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, CheckCircle2, Eye, Link2, Loader2, MousePointerClick, Music2, Package, RefreshCw, Settings2, ShoppingBag, ShoppingCart, Unplug } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import StatCard from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { OAUTH_API_BASE_URL, disconnectEcommerceAccount, EcommerceAccount, fetchEcommerceAccounts, fetchTrackingAnalysis, fetchTrackingDashboard, fetchTrackingFilterOptions, fetchTrackingReadiness, syncTrackingData, TrackingAnalysis, TrackingDashboard, TrackingFilterOptions } from "@/lib/api";

const number = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const SHOP_PLATFORMS = [
  { key: "tiktok_shop", label: "TikTok Shop", icon: Music2, iconClassName: "bg-foreground/10 text-foreground" },
  { key: "shopee", label: "Shopee", icon: ShoppingBag, iconClassName: "bg-destructive/10 text-destructive" },
  { key: "lazada", label: "Lazada", icon: Package, iconClassName: "bg-info/10 text-info" },
] as const;
const ECOMMERCE_PLATFORM_KEYS = new Set(["tiktok_shop", "shopee", "lazada"]);

function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>;
}

function PerformanceList({ title, items }: { title: string; items: TrackingDashboard["products"] }) {
  return (
    <section className="min-h-[220px] rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <h2 className="font-display text-base font-semibold text-foreground">{title}</h2>
      {items.length === 0 ? <EmptyState message="No tracked performance yet." /> : (
        <div className="mt-4 space-y-3">
          {items.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 border-b border-border/60 pb-3 last:border-0 last:pb-0">
              <p className="min-w-0 truncate text-sm font-medium text-foreground" title={item.name}>{item.name || "Untitled Reel"}</p>
              <div className="shrink-0 text-right text-xs text-muted-foreground"><p>{number.format(item.views)} views</p><p>{item.orders} orders</p></div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function Tracking() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dashboard, setDashboard] = useState<TrackingDashboard | null>(null);
  const [accounts, setAccounts] = useState<EcommerceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [shopOAuthReady, setShopOAuthReady] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedStartDate, setAppliedStartDate] = useState("");
  const [appliedEndDate, setAppliedEndDate] = useState("");
  const [ecommercePlatform, setEcommercePlatform] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [productId, setProductId] = useState("");
  const [appliedEcommercePlatform, setAppliedEcommercePlatform] = useState("");
  const [appliedSocialPlatform, setAppliedSocialPlatform] = useState("");
  const [appliedCampaignId, setAppliedCampaignId] = useState("");
  const [appliedProductId, setAppliedProductId] = useState("");
  const [filterOptions, setFilterOptions] = useState<TrackingFilterOptions>({ platforms: [], campaigns: [], products: [] });
  const [analysisLevel, setAnalysisLevel] = useState<TrackingAnalysis["level"]>("product");
  const [analysisMetric, setAnalysisMetric] = useState<TrackingAnalysis["metric"]>("views");
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [selectedAnalysisItem, setSelectedAnalysisItem] = useState<TrackingAnalysis["rows"][number] | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [shopToDisconnect, setShopToDisconnect] = useState<EcommerceAccount | null>(null);
  const [disconnectingShop, setDisconnectingShop] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextAccounts, readiness, options] = await Promise.all([
        fetchTrackingDashboard({ start: appliedStartDate, end: appliedEndDate, platform: appliedEcommercePlatform || appliedSocialPlatform, campaign_id: appliedCampaignId, product_id: appliedProductId }),
        fetchEcommerceAccounts(), fetchTrackingReadiness(), fetchTrackingFilterOptions(),
      ]);
      setDashboard(nextDashboard);
      setAccounts(nextAccounts);
      setShopOAuthReady(readiness.oauth);
      setFilterOptions(options);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tracking data");
    } finally {
      setLoading(false);
    }
  }, [appliedCampaignId, appliedEcommercePlatform, appliedEndDate, appliedProductId, appliedSocialPlatform, appliedStartDate]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const connectError = searchParams.get("error");
    if (connected) {
      void load();
      router.replace("/tracking");
    } else if (connectError) {
      setError(connectError);
      router.replace("/tracking");
    }
  }, [load, router, searchParams]);

  const sync = async () => {
    setSyncing(true);
    try { await syncTrackingData(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Synchronization failed"); }
    finally { setSyncing(false); }
  };

  const connectShop = (platform: string) => {
    const token = localStorage.getItem("rf_token");
    if (!token) return;
    window.location.href = `${OAUTH_API_BASE_URL}/tracking/ecommerce/${platform}/connect?token=${encodeURIComponent(token)}`;
  };

  const disconnectShop = async () => {
    if (!shopToDisconnect) return;
    setDisconnectingShop(true);
    try {
      await disconnectEcommerceAccount(shopToDisconnect.ecommerce_account_id);
      setShopToDisconnect(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disconnect shop");
    } finally {
      setDisconnectingShop(false);
    }
  };

  const applyDateRange = () => {
    if (startDate && endDate && startDate > endDate) {
      setError("Start date must be before end date");
      return;
    }
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedEcommercePlatform(ecommercePlatform);
    setAppliedSocialPlatform(socialPlatform);
    setAppliedCampaignId(campaignId);
    setAppliedProductId(productId);
    setAnalysis(null);
    setSelectedAnalysisItem(null);
  };

  const clearDateRange = () => {
    setStartDate("");
    setEndDate("");
    setAppliedStartDate("");
    setAppliedEndDate("");
    setEcommercePlatform("");
    setSocialPlatform("");
    setCampaignId("");
    setProductId("");
    setAppliedEcommercePlatform("");
    setAppliedSocialPlatform("");
    setAppliedCampaignId("");
    setAppliedProductId("");
    setAnalysis(null);
    setSelectedAnalysisItem(null);
  };

  const analyze = async () => {
    setAnalyzing(true);
    setError(null);
    try {
      const result = await fetchTrackingAnalysis({
        level: analysisLevel, metric: analysisMetric, start: appliedStartDate, end: appliedEndDate,
        platform: appliedEcommercePlatform || appliedSocialPlatform, campaign_id: appliedCampaignId, product_id: appliedProductId,
      });
      setAnalysis(result);
      setSelectedAnalysisItem(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to analyze tracking data");
    } finally {
      setAnalyzing(false);
    }
  };

  const totals = dashboard?.totals;
  const chartData = dashboard?.trend ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">Data Tracking</h1><p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">Consolidated performance from your connected shops and published Reels.</p></div>
        <button type="button" onClick={sync} disabled={syncing || loading} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now
        </button>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <section>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="font-display text-lg font-semibold text-foreground">Performance overview</h2><p className="text-sm text-muted-foreground">Follow the journey from attention to affiliate revenue.</p></div><p className="text-sm text-muted-foreground">{loading ? "–" : number.format(totals?.reels ?? 0)} Distributed Reels</p></div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
          <StatCard compact icon={Eye} label="Total Views" value={loading ? "-" : number.format(totals?.views ?? 0)} delay={0.05} />
          <StatCard compact icon={CheckCircle2} label="Engagement" value={loading ? "-" : number.format(totals?.engagement ?? 0)} delay={0.1} />
          <StatCard compact icon={MousePointerClick} label="Affiliate Clicks" value={loading ? "-" : number.format(totals?.clicks ?? 0)} delay={0.15} />
          <StatCard compact icon={BarChart3} label="Click-through Rate" value={loading ? "-" : `${totals?.click_through_rate ?? 0}%`} delay={0.2} />
          <StatCard compact icon={ShoppingCart} label="Affiliate Orders" value={loading ? "-" : number.format(totals?.orders ?? 0)} delay={0.25} />
          <StatCard compact icon={ShoppingBag} label="Tracked Revenue" value={loading ? "-" : currency.format(totals?.revenue ?? 0)} delay={0.3} />
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between"><div><h2 className="font-display text-lg font-semibold text-foreground">Performance period</h2><p className="text-xs text-muted-foreground">Filter every dashboard metric by recorded date, platform, campaign, or product.</p></div></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">From<input aria-label="Start date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">To<input aria-label="End date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground" /></label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">E-commerce platform<select aria-label="E-commerce platform" value={ecommercePlatform} onChange={(event) => { setEcommercePlatform(event.target.value); if (event.target.value) setSocialPlatform(""); }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"><option value="">All e-commerce</option>{filterOptions.platforms.filter((item) => ECOMMERCE_PLATFORM_KEYS.has(item)).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Social media platform<select aria-label="Social media platform" value={socialPlatform} onChange={(event) => { setSocialPlatform(event.target.value); if (event.target.value) setEcommercePlatform(""); }} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"><option value="">All social media</option>{filterOptions.platforms.filter((item) => !ECOMMERCE_PLATFORM_KEYS.has(item)).map((item) => <option key={item} value={item}>{item.replaceAll("_", " ")}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Campaign<select aria-label="Campaign" value={campaignId} onChange={(event) => setCampaignId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"><option value="">All campaigns</option>{filterOptions.campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Product<select aria-label="Product" value={productId} onChange={(event) => setProductId(event.target.value)} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground"><option value="">All products</option>{filterOptions.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        </div>
        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{(appliedStartDate || appliedEndDate || appliedEcommercePlatform || appliedSocialPlatform || appliedCampaignId || appliedProductId) && <button type="button" onClick={clearDateRange} disabled={loading} className="min-h-10 rounded-lg border border-border px-4 text-sm font-medium text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60">Clear</button>}<button type="button" onClick={applyDateRange} disabled={loading} className="min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">Apply filters</button></div>
      </section>

      {!loading && dashboard && !dashboard.has_data && <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-6"><EmptyState message="No tracking data matches these filters. Data will appear after a successful automatic synchronization." /></section>}

      <section className="grid gap-5 xl:grid-cols-5">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 xl:col-span-3">
          <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-info/10"><BarChart3 className="h-4 w-4 text-info" /></div><div><h2 className="font-display text-lg font-semibold text-foreground">Performance over time</h2><p className="text-xs text-muted-foreground">Views, clicks, and orders across the selected period.</p></div></div>
          {chartData.length === 0 ? <EmptyState message="Metrics will appear here after connected platforms synchronize." /> : <div className="mt-5 h-64 sm:h-72"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}><defs><linearGradient id="trackingViews" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} /><XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(value) => number.format(value)} /><Tooltip formatter={(value: number) => [value.toLocaleString(), undefined]} /><Area type="monotone" dataKey="views" name="Views" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#trackingViews)" /><Area type="monotone" dataKey="clicks" name="Clicks" stroke="hsl(var(--info))" strokeWidth={2} fill="transparent" /><Area type="monotone" dataKey="orders" name="Orders" stroke="hsl(var(--success))" strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div>}
        </motion.div>
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6 xl:col-span-2"><h2 className="font-display text-lg font-semibold text-foreground">Performance by platform</h2><p className="mt-1 text-xs text-muted-foreground">Compare attention across connected channels.</p>{dashboard?.platforms.length ? <div className="mt-5 h-64 sm:h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.platforms}><XAxis dataKey="platform" tick={{ fontSize: 12 }} /><YAxis tickFormatter={(value) => number.format(value)} /><Tooltip /><Bar dataKey="views" name="Views" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState message="No platform data yet." />}</div>
      </section>

      <section>
        <div className="mb-4"><h2 className="font-display text-lg font-semibold text-foreground">Top performers</h2><p className="text-sm text-muted-foreground">The leading products, campaigns, and Reels in the selected scope.</p></div>
        <div className="grid gap-4 md:grid-cols-3"><PerformanceList title="Top Products" items={dashboard?.products ?? []} /><PerformanceList title="Top Campaigns" items={dashboard?.campaigns ?? []} /><PerformanceList title="Top Reels" items={dashboard?.reels ?? []} /></div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><h2 className="font-display text-lg font-semibold text-foreground">Analyze performance</h2><p className="text-xs text-muted-foreground">Compare a selected scope using the dashboard filters above.</p></div>
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Level<select value={analysisLevel} onChange={(event) => setAnalysisLevel(event.target.value as TrackingAnalysis["level"])} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground sm:min-w-32"><option value="product">Product</option><option value="campaign">Campaign</option><option value="reel">Reel</option><option value="platform">Platform</option></select></label>
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">Metric<select value={analysisMetric} onChange={(event) => setAnalysisMetric(event.target.value as TrackingAnalysis["metric"])} className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground sm:min-w-36"><option value="views">Views</option><option value="clicks">Affiliate clicks</option><option value="orders">Orders</option><option value="engagement">Engagement</option><option value="revenue">Revenue</option><option value="ctr">Click-through rate</option></select></label>
            <button type="button" onClick={analyze} disabled={analyzing || loading} className="col-span-2 min-h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1">{analyzing ? "Analyzing..." : "Analyze Performance"}</button>
          </div>
        </div>
        {analysis && <div className="mt-5 grid gap-5 lg:grid-cols-2">
          <div>{analysis.rows.length === 0 ? <EmptyState message="No synchronized tracking data matches this analysis." /> : <div className="space-y-2">{analysis.rows.map((item, index) => <button key={item.id} type="button" onClick={() => setSelectedAnalysisItem(item)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted"><span className="min-w-0"><span className="mr-2 text-xs text-muted-foreground">#{index + 1}</span><span className="truncate text-sm font-medium text-foreground">{item.name}</span></span><span className="shrink-0 text-sm font-semibold text-primary">{analysis.metric === "revenue" ? currency.format(item.value) : analysis.metric === "ctr" ? `${item.value}%` : number.format(item.value)}</span></button>)}</div>}</div>
          <div className="rounded-xl bg-muted/30 p-4">{selectedAnalysisItem ? <div className="space-y-2"><h3 className="font-display text-base font-semibold text-foreground">{selectedAnalysisItem.name}</h3><div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground"><p>Views <span className="float-right text-foreground">{number.format(selectedAnalysisItem.views)}</span></p><p>Clicks <span className="float-right text-foreground">{number.format(selectedAnalysisItem.clicks)}</span></p><p>Orders <span className="float-right text-foreground">{number.format(selectedAnalysisItem.orders)}</span></p><p>Engagement <span className="float-right text-foreground">{number.format(selectedAnalysisItem.engagement)}</span></p><p>CTR <span className="float-right text-foreground">{selectedAnalysisItem.click_through_rate ?? 0}%</span></p><p>Revenue <span className="float-right text-foreground">{currency.format(selectedAnalysisItem.revenue)}</span></p></div></div> : <EmptyState message="Select a ranked item to view its detailed performance." />}</div>
          {analysis.trend.length > 0 && <div className="h-56 lg:col-span-2"><ResponsiveContainer width="100%" height="100%"><BarChart data={analysis.trend}><XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis tickFormatter={(value) => number.format(value)} /><Tooltip /><Bar dataKey="value" name={analysis.metric} fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}
        </div>}
      </section>

      <section className="min-w-0 overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="flex items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10"><ShoppingBag className="h-4 w-4 text-primary" /></div><div className="min-w-0"><h2 className="font-display text-base font-semibold text-foreground">E-commerce connections</h2><p className="text-xs text-muted-foreground">Connect stores to synchronize affiliate orders and clicks.</p></div></div>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">{SHOP_PLATFORMS.map((platform) => {
          const account = accounts.find((item) => item.platform_name === platform.key);
          const configured = shopOAuthReady[platform.key] ?? false;
          const PlatformIcon = platform.icon;
          const connectionStatus = account?.sync_error || (account ? (account.last_synced_at ? `Last sync ${new Date(account.last_synced_at).toLocaleString()}` : "Connected - awaiting first sync") : (configured ? "Not connected" : "Needs setup"));
          return <div key={platform.key} className="min-w-0 rounded-xl border border-border bg-muted/30 p-3"><div className="flex min-w-0 items-center gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${platform.iconClassName}`}><PlatformIcon className="h-5 w-5" aria-hidden="true" /></div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground" title={account?.shop_name || platform.label}>{account?.shop_name || platform.label}</p><p className={`truncate text-xs ${account?.sync_error ? "text-destructive" : "text-muted-foreground"}`} title={connectionStatus}>{connectionStatus}</p></div>{account && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}{account ? <Button variant="outline" size="icon" onClick={() => setShopToDisconnect(account)} title={`Disconnect ${account.shop_name || platform.label}`} aria-label={`Disconnect ${account.shop_name || platform.label}`} className="h-9 w-9 shrink-0"><Unplug className="h-4 w-4" /></Button> : <Button size="icon" disabled={!configured} title={configured ? `Connect ${platform.label}` : "Configure this shop OAuth adapter in backend/.env.local first"} aria-label={configured ? `Connect ${platform.label}` : `${platform.label} needs setup`} onClick={() => connectShop(platform.key)} className="gradient-primary h-9 w-9 shrink-0 text-primary-foreground">{configured ? <Link2 className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}</Button>}</div></div>;
        })}</div>
      </section>

      <AlertDialog
        open={Boolean(shopToDisconnect)}
        onOpenChange={(open) => { if (!open && !disconnectingShop) setShopToDisconnect(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {shopToDisconnect?.shop_name || shopToDisconnect?.platform_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop synchronization for this store. You can reconnect it later to resume tracking.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnectingShop}>Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void disconnectShop()} disabled={disconnectingShop}>
              {disconnectingShop ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Disconnect
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!loading && dashboard && <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><MousePointerClick className="h-3 w-3" />{dashboard.last_synced_at ? `Last synchronized ${new Date(dashboard.last_synced_at).toLocaleString()}` : "No successful synchronization yet"} · Updated {new Date(dashboard.generated_at).toLocaleString()}</p>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart3, CheckCircle2, Eye, Loader2, MousePointerClick, RefreshCw, ShoppingBag, ShoppingCart, Trash2, Video } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import StatCard from "@/components/StatCard";
import { API_BASE_URL, disconnectEcommerceAccount, EcommerceAccount, fetchEcommerceAccounts, fetchTrackingDashboard, fetchTrackingReadiness, syncTrackingData, TrackingDashboard } from "@/lib/api";

const number = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const SHOP_PLATFORMS = [
  { key: "tiktok_shop", label: "TikTok Shop" },
  { key: "shopee", label: "Shopee" },
  { key: "lazada", label: "Lazada" },
] as const;

function EmptyState({ message }: { message: string }) {
  return <p className="py-8 text-center text-sm text-muted-foreground">{message}</p>;
}

function PerformanceList({ title, items }: { title: string; items: TrackingDashboard["products"] }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextAccounts, readiness] = await Promise.all([fetchTrackingDashboard(), fetchEcommerceAccounts(), fetchTrackingReadiness()]);
      setDashboard(nextDashboard);
      setAccounts(nextAccounts);
      setShopOAuthReady(readiness.oauth);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tracking data");
    } finally {
      setLoading(false);
    }
  }, []);

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
    window.location.href = `${API_BASE_URL}/tracking/ecommerce/${platform}/connect?token=${encodeURIComponent(token)}`;
  };

  const disconnectShop = async (accountId: string) => {
    try {
      await disconnectEcommerceAccount(accountId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to disconnect shop");
    }
  };

  const totals = dashboard?.totals;
  const chartData = dashboard?.trend ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h1 className="font-display text-2xl font-bold text-foreground">Data Tracking</h1><p className="mt-1 text-sm text-muted-foreground">Consolidated performance from your connected shops and published Reels.</p></div>
        <button type="button" onClick={sync} disabled={syncing || loading} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
          {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync now
        </button>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 sm:gap-6">
        <StatCard icon={Video} label="Total Reels" value={loading ? "-" : String(totals?.reels ?? 0)} delay={0.05} />
        <StatCard icon={Eye} label="Total Views" value={loading ? "-" : number.format(totals?.views ?? 0)} delay={0.1} />
        <StatCard icon={ShoppingCart} label="Affiliate Orders" value={loading ? "-" : number.format(totals?.orders ?? 0)} delay={0.15} />
        <StatCard icon={ShoppingBag} label="Tracked Revenue" value={loading ? "-" : currency.format(totals?.revenue ?? 0)} delay={0.2} />
      </div>

      <section className="rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><ShoppingBag className="h-4 w-4 text-primary" /></div><div><h2 className="font-display text-base font-semibold text-foreground">E-commerce connections</h2><p className="text-xs text-muted-foreground">Connect a store securely to synchronize affiliate orders and clicks.</p></div></div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">{SHOP_PLATFORMS.map((platform) => { const account = accounts.find((item) => item.platform_name === platform.key); const configured = shopOAuthReady[platform.key] ?? false; return <div key={platform.key} className="rounded-xl border border-border bg-muted/30 p-4"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-foreground">{account?.shop_name || platform.label}</p><p className="mt-1 text-xs text-muted-foreground">{account ? (account.last_synced_at ? `Last sync ${new Date(account.last_synced_at).toLocaleString()}` : "Connected - awaiting first sync") : (configured ? "Not connected" : "Needs setup")}</p></div>{account && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}</div>{account?.sync_error && <p className="mt-2 text-xs text-destructive">{account.sync_error}</p>}<div className="mt-4">{account ? <button type="button" onClick={() => disconnectShop(account.ecommerce_account_id)} className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"><Trash2 className="h-3.5 w-3.5" />Disconnect</button> : <button type="button" disabled={!configured} title={configured ? undefined : "Configure this shop OAuth adapter in backend/.env.local first"} onClick={() => connectShop(platform.key)} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{configured ? "Connect" : "Needs setup"}</button>}</div></div>; })}</div>
      </section>

      <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="flex items-center gap-3"><div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10"><BarChart3 className="h-4 w-4 text-info" /></div><h2 className="font-display text-lg font-semibold text-foreground">Performance over time</h2></div>
        {chartData.length === 0 ? <EmptyState message="Metrics will appear here after connected platforms synchronize." /> : <div className="mt-6 h-72 sm:h-80"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}><defs><linearGradient id="trackingViews" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient></defs><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} /><XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(value) => number.format(value)} /><Tooltip formatter={(value: number) => [value.toLocaleString(), undefined]} /><Area type="monotone" dataKey="views" name="Views" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#trackingViews)" /><Area type="monotone" dataKey="clicks" name="Clicks" stroke="hsl(var(--info))" strokeWidth={2} fill="transparent" /><Area type="monotone" dataKey="orders" name="Orders" stroke="hsl(var(--success))" strokeWidth={2} fill="transparent" /></AreaChart></ResponsiveContainer></div>}
      </motion.section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-card"><h2 className="font-display text-base font-semibold text-foreground">Performance by platform</h2>{dashboard?.platforms.length ? <div className="mt-4 h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.platforms}><XAxis dataKey="platform" tick={{ fontSize: 12 }} /><YAxis tickFormatter={(value) => number.format(value)} /><Tooltip /><Bar dataKey="views" name="Views" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <EmptyState message="No platform data yet." />}</div>
        <PerformanceList title="Top Products" items={dashboard?.products ?? []} />
        <PerformanceList title="Top Campaigns" items={dashboard?.campaigns ?? []} />
        <PerformanceList title="Top Reels" items={dashboard?.reels ?? []} />
      </section>

      {!loading && dashboard && <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><MousePointerClick className="h-3 w-3" />Updated {new Date(dashboard.generated_at).toLocaleString()}</p>}
    </div>
  );
}

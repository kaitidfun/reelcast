"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart3, Eye, Loader2, MousePointerClick, RefreshCw, ShoppingBag, ShoppingCart, Video } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import StatCard from "@/components/StatCard";
import { connectEcommerceAccount, EcommerceAccount, fetchEcommerceAccounts, fetchTrackingDashboard, syncTrackingData, TrackingDashboard } from "@/lib/api";

const number = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const currency = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });

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
  const [dashboard, setDashboard] = useState<TrackingDashboard | null>(null);
  const [accounts, setAccounts] = useState<EcommerceAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionForm, setConnectionForm] = useState({ platform_name: "tiktok_shop" as "tiktok_shop" | "shopee" | "lazada", external_shop_id: "", shop_name: "", access_token: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextDashboard, nextAccounts] = await Promise.all([fetchTrackingDashboard(), fetchEcommerceAccounts()]);
      setDashboard(nextDashboard);
      setAccounts(nextAccounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load tracking data");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    setSyncing(true);
    try { await syncTrackingData(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : "Synchronization failed"); }
    finally { setSyncing(false); }
  };

  const connect = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setConnecting(true);
    setError(null);
    try {
      await connectEcommerceAccount(connectionForm);
      setConnectionForm({ platform_name: "tiktok_shop", external_shop_id: "", shop_name: "", access_token: "" });
      setShowConnect(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to connect shop");
    } finally {
      setConnecting(false);
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
        <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-3"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10"><ShoppingBag className="h-4 w-4 text-primary" /></div><div><h2 className="font-display text-base font-semibold text-foreground">E-commerce connections</h2><p className="text-xs text-muted-foreground">TikTok Shop, Shopee and Lazada accounts linked to this member.</p></div></div><button type="button" onClick={() => setShowConnect((value) => !value)} className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted">{showConnect ? "Cancel" : "Connect shop"}</button></div>
        {showConnect && <form onSubmit={connect} className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-border bg-muted/20 p-4 md:grid-cols-2"><label className="text-xs font-medium text-foreground">Platform<select value={connectionForm.platform_name} onChange={(event) => setConnectionForm((form) => ({ ...form, platform_name: event.target.value as typeof form.platform_name }))} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"><option value="tiktok_shop">TikTok Shop</option><option value="shopee">Shopee</option><option value="lazada">Lazada</option></select></label><label className="text-xs font-medium text-foreground">Shop ID<input required value={connectionForm.external_shop_id} onChange={(event) => setConnectionForm((form) => ({ ...form, external_shop_id: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-foreground">Shop name <span className="font-normal text-muted-foreground">(optional)</span><input value={connectionForm.shop_name} onChange={(event) => setConnectionForm((form) => ({ ...form, shop_name: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label><label className="text-xs font-medium text-foreground">OAuth access token<input required type="password" autoComplete="off" value={connectionForm.access_token} onChange={(event) => setConnectionForm((form) => ({ ...form, access_token: event.target.value }))} className="mt-1 block w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label><div className="md:col-span-2 flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Paste the token returned by your platform OAuth integration. It is encrypted before storage.</p><button disabled={connecting} className="rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground disabled:opacity-60">{connecting ? "Connecting..." : "Save connection"}</button></div></form>}
        {loading ? <EmptyState message="Loading connections..." /> : accounts.length === 0 ? <EmptyState message="No e-commerce shop connected yet. Complete a shop OAuth connection to start syncing orders and affiliate clicks." /> : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">{accounts.map((account) => <div key={account.ecommerce_account_id} className="rounded-xl border border-border bg-muted/30 p-4"><p className="text-sm font-semibold capitalize text-foreground">{account.shop_name || account.platform_name.replace("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{account.last_synced_at ? `Last sync ${new Date(account.last_synced_at).toLocaleString()}` : "Awaiting first sync"}</p>{account.sync_error && <p className="mt-2 text-xs text-destructive">{account.sync_error}</p>}</div>)}</div>
        )}
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

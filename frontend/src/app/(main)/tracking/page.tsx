"use client";

import { useEffect, useState } from "react";
import { BarChart3, Download, RefreshCw, Eye, Heart, MousePointerClick, Video, Link2, SlidersHorizontal, ChevronDown, Settings2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_OPTIONS } from "@/lib/platforms";
import { createTrackingLink, downloadTrackingExport, fetchTrackingAnalysis, fetchTrackingComparison, fetchTrackingDashboard, fetchTrackingFilterOptions, syncTrackingData, type TrackingAnalysis, type TrackingComparison, type TrackingDashboard, type TrackingFilterOptions, type TrackingFilters, type TrackingPeriods } from "@/lib/api";

const display = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString();
const inputClass = "h-10 min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50";
const primaryButtonClass = "gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300";
const panelClass = "min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6";
const emptyOptions: TrackingFilterOptions = { platforms: [], campaigns: [], products: [], reels: [], distributions: [] };

export default function Tracking() {
  const [filters, setFilters] = useState<TrackingFilters>({});
  const [applied, setApplied] = useState<TrackingFilters>({});
  const [options, setOptions] = useState(emptyOptions);
  const [dashboard, setDashboard] = useState<TrackingDashboard | null>(null);
  const [level, setLevel] = useState<TrackingAnalysis["level"]>("reel");
  const [metric, setMetric] = useState<TrackingAnalysis["metric"]>("views");
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [selectedItem, setSelectedItem] = useState<TrackingAnalysis["rows"][number] | null>(null);
  const [periods, setPeriods] = useState<TrackingPeriods>({ a_start: "", a_end: "", b_start: "", b_end: "" });
  const [comparedPeriods, setComparedPeriods] = useState<TrackingPeriods | null>(null);
  const [comparison, setComparison] = useState<TrackingComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const [link, setLink] = useState("");
  const [distributionId, setDistributionId] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setAnalysis(null); setSelectedItem(null); setComparison(null); setComparedPeriods(null);
    Promise.all([fetchTrackingDashboard(applied), fetchTrackingFilterOptions()]).then(([data, values]) => {
      if (active) { setDashboard(data); setOptions(values); }
    }).catch((err: Error) => { if (active) { setDashboard(null); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, revision]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to complete request"); }
    finally { setBusy(false); }
  }
  const exportButtons = (extra: Partial<TrackingPeriods> & { level?: string; metric?: string } = {}) =>
    <div className="flex gap-2">{(["csv", "xlsx"] as const).map(format => <Button key={format} variant="outline" disabled={busy || loading || !dashboard?.has_data} onClick={() => void run(async () => downloadTrackingExport(format, { ...applied, ...extra }))}><Download className="mr-2 h-4 w-4" />{format.toUpperCase()}</Button>)}</div>;

  return <div aria-busy={loading} className="min-w-0 space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Data Tracking</h1><p className="mt-1 text-muted-foreground">Social performance and affiliate link visits</p></div><Button className={`${primaryButtonClass} w-full sm:w-auto`} disabled={busy || loading} onClick={() => void run(async () => { const result = await syncTrackingData(); setRevision(value => value + 1); const failures = result.accounts.filter(account => !account.success); if (failures.length) throw new Error(`${failures.length} account(s) failed to synchronize. See account status below.`); })}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Sync Data</Button></div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    <section aria-label="Tracking filters" className="space-y-3"><div className="flex items-center gap-2 text-sm font-medium text-foreground"><SlidersHorizontal className="h-4 w-4 text-muted-foreground" />Filter performance</div><div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {(["start", "end"] as const).map(key => <label key={key} className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">{key === "start" ? "Start date" : "End date"}<Input type="date" className={inputClass} value={filters[key] || ""} onChange={event => setFilters({ ...filters, [key]: event.target.value })} /></label>)}
      <label className="grid min-w-0 gap-1.5 text-xs font-medium text-muted-foreground">Platform<select className={inputClass} value={filters.platform || ""} onChange={event => setFilters({ ...filters, platform: event.target.value })}><option value="">All platforms</option>{options.platforms.map(platform => <option key={platform}>{platform}</option>)}</select></label>
      {(["campaign", "product", "reel"] as const).map(scope => <label key={scope} className="grid min-w-0 gap-1.5 text-xs font-medium capitalize text-muted-foreground">{scope}<select className={inputClass} value={filters[`${scope}_id`] || ""} onChange={event => setFilters({ ...filters, [`${scope}_id`]: event.target.value })}><option value="">All {scope}s</option>{options[`${scope}s`].map(item => <option key={item.id} value={item.id}>{item.name || "Untitled"}</option>)}</select></label>)}
      <Button variant="outline" className="h-10 bg-card" disabled={busy || loading} onClick={() => { if (filters.start && filters.end && filters.start > filters.end) { setError("Start date must be before end date"); return; } setApplied({ ...filters }); }}>Apply filters</Button>
    </div><details className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground"><summary className="flex cursor-pointer list-none items-center gap-2 font-medium">How these metrics are counted<ChevronDown className="h-3.5 w-3.5" /></summary><p className="mt-2 max-w-4xl leading-relaxed">Social figures are the latest lifetime observation in the selected dates. Clicks are visits during those dates (Asia/Bangkok). Repeat visits count; recognized bots, previews and HEAD requests do not. These figures do not measure purchases or unique visitors.</p></details></section>

    {loading && !dashboard ? <p role="status">Loading tracking data…</p> : dashboard && <>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{([
        { label: 'Views', value: dashboard.totals.views, icon: Eye, color: 'bg-primary/10 text-primary', gradient: 'from-orange-500 via-pink-500 to-purple-600' },
        { label: 'Engagement', value: dashboard.totals.engagement, icon: Heart, color: 'bg-pink-500/10 text-pink-500', gradient: 'from-rose-500 via-pink-500 to-fuchsia-600' },
        { label: 'Affiliate link clicks', value: dashboard.totals.clicks, icon: MousePointerClick, color: 'bg-info/10 text-info', gradient: 'from-cyan-500 via-blue-500 to-indigo-600' },
        { label: 'Tracked Reels', value: dashboard.totals.reels, icon: Video, color: 'bg-violet-500/10 text-violet-500', gradient: 'from-violet-500 via-purple-500 to-fuchsia-600' },
      ]).map(({ label, value, icon: Icon, color, gradient }) => <section key={label} className="group relative overflow-hidden rounded-2xl border border-border bg-card card-shine transition-all duration-300 hover:border-primary/30 hover:shadow-elevated"><div className={`h-1 bg-gradient-to-r ${gradient}`} /><div className="p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{display(value)}</p></div></section>)}</div>
      {!!dashboard.totals.partial_metrics.length && <p className="text-xs text-muted-foreground">Some social metrics are unavailable for part of this scope. Totals include only available values.</p>}
      {!dashboard.has_data && <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/50" /><h2 className="mt-4 font-display text-xl font-semibold text-foreground">Start tracking your content</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">No tracking data matches these filters. Publish a Reel and synchronize its connected social account, or create a tracking link for a distribution.</p></div>}
      <div className="grid gap-5 lg:grid-cols-2">
      <section className={panelClass}><h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold text-foreground"><BarChart3 className="h-5 w-5" />Performance by platform</h2>{dashboard.platforms.length > 0 && <div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.platforms}><XAxis dataKey="name" /><YAxis /><Tooltip /><Bar dataKey="views" name="Lifetime views" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>}</section>
      <section className={panelClass}><h2 className="font-display text-lg font-semibold text-foreground">Affiliate link clicks by day</h2><p className="mt-1 text-xs text-muted-foreground">Recorded visits · Asia/Bangkok · Does not represent unique visitors</p>{dashboard.click_trend.length ? <div className="mt-4 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={dashboard.click_trend}><XAxis dataKey="date" /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="clicks" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="py-6 text-sm text-muted-foreground">No recorded clicks in this period.</p>}</section>
      </div>
      <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold text-foreground">Content ranking</h2><div className="flex flex-wrap gap-2"><select aria-label="Ranking level" className={inputClass} value={level} onChange={event => { setLevel(event.target.value as typeof level); setAnalysis(null); setSelectedItem(null); }}>{["reel", "product", "campaign", "platform"].map(value => <option key={value}>{value}</option>)}</select><select aria-label="Ranking metric" className={inputClass} value={metric} onChange={event => { setMetric(event.target.value as typeof metric); setAnalysis(null); setSelectedItem(null); }}>{["views", "engagement", "clicks"].map(value => <option key={value}>{value}</option>)}</select><Button className={primaryButtonClass} disabled={busy} onClick={() => void run(async () => setAnalysis(await fetchTrackingAnalysis({ ...applied, level, metric })))}>Analyze</Button>{analysis && exportButtons({ level: analysis.level, metric: analysis.metric })}</div></div>{analysis && <div className="mt-4 space-y-2">{!analysis.rows.length && <p>No matching content.</p>}{analysis.rows.map((item, index) => <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="flex w-full justify-between gap-3 border-b border-border py-2 text-left text-sm hover:bg-muted"><span>#{index + 1} {item.name || "Untitled"}</span><span>{display(item.value)}</span></button>)}</div>}{selectedItem && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm"><h3 className="mb-2 font-semibold">{selectedItem.name || "Untitled"}</h3><div className="grid gap-2 sm:grid-cols-3">{(["views", "likes", "comments", "shares", "engagement", "clicks"] as const).map(key => <p key={key} className="capitalize">{key}: {display(selectedItem[key])}</p>)}</div>{!!selectedItem.partial_metrics.length && <p className="mt-2 text-xs text-muted-foreground">Some counters are unavailable in this scope.</p>}</div>}</section>
      <section className={panelClass}><h2 className="font-display text-lg font-semibold text-foreground">Compare periods · Affiliate link clicks</h2><p className="mt-1 text-xs text-muted-foreground">Use the same platform, campaign, product and Reel filters. Social daily activity is unavailable from lifetime observations.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{(Object.keys(periods) as Array<keyof TrackingPeriods>).map(key => <label key={key} className="grid gap-1 text-xs uppercase text-muted-foreground">{key.replace("_", " ")}<Input type="date" className={inputClass} value={periods[key]} onChange={event => setPeriods({ ...periods, [key]: event.target.value })} /></label>)}</div><div className="mt-3 flex flex-wrap gap-3"><Button className={primaryButtonClass} disabled={busy || Object.values(periods).some(value => !value)} onClick={() => void run(async () => { setComparison(null); const result = await fetchTrackingComparison({ ...applied, ...periods }); setComparison(result); setComparedPeriods({ ...periods }); })}>Compare</Button>{comparison && comparedPeriods && exportButtons(comparedPeriods)}</div>{comparison && <div className="mt-4 space-y-2 text-sm"><p>A ({comparison.a.start} – {comparison.a.end}): {display(comparison.a.clicks)}{!comparison.a.complete && " · Partial coverage"}</p><p>B ({comparison.b.start} – {comparison.b.end}): {display(comparison.b.clicks)}{!comparison.b.complete && " · Partial coverage"}</p><p>Change: {display(comparison.difference)} · {comparison.percentage_change == null ? "Percentage unavailable" : `${comparison.percentage_change}%`}</p>{!comparison.equal_duration && <p className="text-muted-foreground">Periods have different durations.</p>}<p className="text-xs text-muted-foreground">{comparison.limitation}</p></div>}</section>
      <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-display text-lg font-semibold text-foreground">Tracking details</h2>{exportButtons()}</div><div className="mt-4 overflow-hidden rounded-xl border border-border"><Table><TableHeader className="bg-muted/40"><TableRow>{['Reel / platform', 'Views', 'Likes', 'Comments', 'Shares', 'Link clicks', 'Observation', 'Link'].map(title => <TableHead key={title} className="whitespace-nowrap text-xs">{title}</TableHead>)}</TableRow></TableHeader><TableBody>{dashboard.details.map(row => <TableRow key={row.distribution_id}><TableCell className="max-w-60 truncate p-2">{row.reel_name} · {row.platform}</TableCell>{([row.views, row.likes, row.comments, row.shares, row.clicks]).map((value, i) => <TableCell key={i} className="p-2">{display(value)}</TableCell>)}<TableCell className="whitespace-nowrap p-2">{row.observed_at ? new Date(row.observed_at).toLocaleString() : 'Unavailable'}</TableCell><TableCell className="p-2"><Button variant="outline" disabled={busy} onClick={() => void run(async () => setLink((await createTrackingLink(row.distribution_id)).url))}>Get link</Button></TableCell></TableRow>)}</TableBody></Table></div><p className="mt-3 text-xs text-muted-foreground">Use links only in locations the platform allows viewers to open. Instagram and TikTok captions may not provide clickable links. A shared bio link alone cannot identify the originating Reel.</p></section>
    <section className={panelClass}><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Link2 className="h-5 w-5" /></span><h2 className="font-display text-lg font-semibold text-foreground">Create affiliate tracking link</h2></div><p className="mt-1 text-xs text-muted-foreground">New publications automatically use a ReelCast link. For existing distributions, create a link here and place it in a supported clickable location.</p><div className="mt-3 flex flex-wrap gap-2"><select aria-label="Distribution for tracking link" className={`${inputClass} max-w-full`} value={distributionId} onChange={event => { setDistributionId(event.target.value); setLink(""); }}><option value="">Select distribution</option>{options.distributions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><Button className={primaryButtonClass} disabled={busy || !distributionId} onClick={() => void run(async () => { setLink((await createTrackingLink(distributionId)).url); setRevision(value => value + 1); })}>Create link</Button></div>{link && <label className="mt-3 grid gap-1 text-xs">Tracking link<Input readOnly value={link} onFocus={event => event.target.select()} className={inputClass} /></label>}</section>
      <div className="space-y-2">
        <Link
          href="/account"
          className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card transition-colors hover:border-primary/30 sm:px-5"
        >
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="min-w-0 truncate text-sm text-foreground">
              <span className="font-semibold">
                {PLATFORM_OPTIONS.filter((platform) => dashboard.accounts.some((account) => account.platform === platform.name)).length}/{PLATFORM_OPTIONS.length}
              </span>{" "}Platforms Connected
            </span>
            <div className="flex items-center gap-1.5">
              {PLATFORM_OPTIONS.map((platform) => {
                const accounts = dashboard.accounts.filter((account) => account.platform === platform.name);
                const connected = accounts.length > 0;
                const status = accounts.map((account) => account.error || (
                  account.last_synced_at
                    ? `Last success ${new Date(account.last_synced_at).toLocaleString()}`
                    : "Awaiting first successful sync"
                )).join("; ");
                return (
                  <span
                    key={platform.id}
                    title={`${platform.label} — ${connected ? `connected · ${status}` : "not connected"}`}
                    aria-label={`${platform.label} — ${connected ? `connected · ${status}` : "not connected"}`}
                    className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                      connected ? `${platform.activeBg} ${platform.color}` : "bg-muted text-muted-foreground/40"
                    }`}
                  >
                    <PlatformIcon platform={platform.name} className="h-3.5 w-3.5" />
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
        {dashboard.accounts.filter((account) => account.error).map((account) => (
          <p key={account.id} role="alert" className="px-1 text-xs text-destructive">{account.platform}: {account.error}</p>
        ))}
        <p className="px-1 text-xs text-muted-foreground">Report updated {new Date(dashboard.generated_at).toLocaleString()}</p>
      </div>
    </>}
  </div>;
}

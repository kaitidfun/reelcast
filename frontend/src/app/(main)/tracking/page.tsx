"use client";

import { useEffect, useRef, useState } from "react";
import { BarChart3, SearchCheck, Download, RefreshCw, Eye, Heart, MousePointerClick, Video, SlidersHorizontal, ChevronDown, Settings2, Trophy, TableProperties, ArrowLeftRight, ChevronLeft, ChevronRight, Globe2, Megaphone, Package, Info, RotateCcw, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_OPTIONS, connectSocialPlatform, platformLabel } from "@/lib/platforms";
import { downloadTrackingExport, fetchTrackingAnalysis, fetchTrackingComparison, fetchTrackingDashboard, fetchTrackingFilterOptions, syncTrackingData, type TrackingAnalysis, type TrackingComparison, type TrackingDashboard, type TrackingFilterOptions, type TrackingFilters, type TrackingPeriods } from "@/lib/api";

const display = (value: number | null | undefined) => value == null ? "Unavailable" : value.toLocaleString();
const inputClass = "h-10 min-w-0 rounded-md border border-border bg-card px-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50";
const primaryButtonClass = "gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300";
const panelClass = "min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6";
const DETAILS_PAGE_SIZE = 25;
const emptyOptions: TrackingFilterOptions = { platforms: [], campaigns: [], products: [], reels: [], distributions: [] };

const CHART_PLATFORM_COLORS: Record<string, string> = {
  youtube: "#ef4444", facebook: "#38bdf8", instagram: "#ec4899", tiktok: "#ffffff",
};
const chartNumber = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const chartAxisTick = { fill: "hsl(var(--muted-foreground))", fontSize: 11 };
const chartDate = (value: string) => new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const nextDate = (value?: string) => {
  if (!value) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};

function PlatformLegend({ values }: { values?: Record<string, number | null> }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-5 gap-y-2 border-t border-border/60 pt-4">
      {PLATFORM_OPTIONS.map(platform => (
        <div key={platform.name} className="flex min-w-0 items-center gap-2 text-xs">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/15" style={{ backgroundColor: CHART_PLATFORM_COLORS[platform.name] }} />
          <span className="truncate text-muted-foreground">{platform.label}</span>
          {values && <span className="ml-auto font-medium tabular-nums text-foreground">{display(values[platform.name])}</span>}
        </div>
      ))}
    </div>
  );
}

function TrackingChartTooltip({ active, payload, label, mode }: TooltipProps<number, string> & { mode: "views" | "clicks" }) {
  if (!active || !payload?.length) return null;
  const items = payload.filter(item => typeof item.value === "number");
  return (
    <div className="min-w-44 rounded-xl border border-border bg-card p-3 text-xs shadow-elevated">
      <p className="mb-2 font-semibold text-foreground">{payload[0]?.payload?.label || String(label)}</p>
      {items.map(item => (
        <div key={String(item.dataKey)} className="flex items-center justify-between gap-5 py-1">
          <span className="flex items-center gap-2 text-muted-foreground">
            <span className="h-2 w-2 rounded-full border border-black/15" style={{ backgroundColor: CHART_PLATFORM_COLORS[payload[0]?.payload?.id] }} />
            {item.name}
          </span>
          <span className="font-semibold tabular-nums text-foreground">{display(Number(item.value))}</span>
        </div>
      ))}
      {mode === "clicks" && <p className="mt-2 flex justify-between gap-5 border-t border-border pt-2 text-foreground"><span>Total clicks</span><strong className="tabular-nums">{display(items.reduce((sum, item) => sum + Number(item.value), 0))}</strong></p>}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, description }: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-w-0 items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="font-display text-lg font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

type DropdownOption = { id: string; name: string; icon?: LucideIcon; platform?: string };

function DropdownLabel({ icon: Icon, label, platform }: { icon: LucideIcon; label: string; platform?: string }) {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden="true" className="flex shrink-0 items-center">
        {platform
          ? <PlatformIcon platform={platform} className={`h-4 w-4 ${PLATFORM_OPTIONS.find(item => item.name === platform)?.color || "text-muted-foreground"}`} />
          : <Icon className="h-4 w-4 text-muted-foreground" />}
      </span>
      <span className="truncate">{label}</span>
    </span>
  );
}

function ScopeSelect({ label, value, onChange, options, placeholder, icon: Icon, showLabel = true, allowAll = true, className = "" }: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder: string;
  icon: LucideIcon;
  showLabel?: boolean;
  allowAll?: boolean;
  className?: string;
}) {
  return (
    <div className={`grid min-w-0 gap-2 ${className}`}>
      {showLabel && <p className="text-xs font-medium text-muted-foreground">{label}</p>}
      <Select value={value || "__all__"} onValueChange={selected => onChange(selected === "__all__" ? "" : selected)}>
        <SelectTrigger aria-label={label} className="h-10 w-full bg-card [&>span]:min-w-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allowAll && <SelectItem value="__all__" textValue={placeholder}><DropdownLabel icon={Icon} label={placeholder} /></SelectItem>}
          {options.map(option => (
            <SelectItem key={option.id} value={option.id} textValue={option.name || "Untitled"}>
              <DropdownLabel icon={option.icon || Icon} label={option.name || "Untitled"} platform={option.platform} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default function Tracking() {
  const [filters, setFilters] = useState<TrackingFilters>({});
  const [applied, setApplied] = useState<TrackingFilters>({});
  const [options, setOptions] = useState(emptyOptions);
  const [dashboard, setDashboard] = useState<TrackingDashboard | null>(null);
  const [detailsPage, setDetailsPage] = useState(1);
  const detailsScrollRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<TrackingAnalysis["level"]>("reel");
  const [metric, setMetric] = useState<TrackingAnalysis["metric"]>("views");
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [selectedItem, setSelectedItem] = useState<TrackingAnalysis["rows"][number] | null>(null);
  const [comparisonDates, setComparisonDates] = useState({ start: "", end: "" });
  const [appliedPeriods, setAppliedPeriods] = useState<TrackingPeriods | null>(null);
  const [comparison, setComparison] = useState<TrackingComparison | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  const invalidPeriodOrder = Boolean(filters.start && filters.end && comparisonDates.start && comparisonDates.end
    && filters.start < filters.end && comparisonDates.start < comparisonDates.end
    && filters.end >= comparisonDates.start);

  function changeScope(scope: "platform" | "campaign_id" | "product_id" | "reel_id", value: string | undefined) {
    setFilters(previous => ({
      ...previous, [scope]: value,
      ...(scope === "platform" ? { campaign_id: undefined, product_id: undefined, reel_id: undefined } : {}),
      ...(scope === "campaign_id" ? { product_id: undefined, reel_id: undefined } : {}),
      ...(scope === "product_id" ? { reel_id: undefined } : {}),
    }));
  }

  function scopeOptions(scope: "campaign" | "product" | "reel") {
    const matching = options.distributions.filter(distribution =>
      (!filters.platform || distribution.platform === filters.platform)
      && (scope === "campaign" || !filters.campaign_id || distribution.campaign_id === filters.campaign_id)
      && (scope !== "reel" || !filters.product_id || distribution.product_id === filters.product_id));
    const ids = new Set(matching.map(distribution => distribution[`${scope}_id`]));
    return options[`${scope}s`].filter(option => ids.has(option.id));
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setAnalysis(null); setSelectedItem(null); setComparison(null);
    Promise.all([
      fetchTrackingDashboard(applied),
      fetchTrackingFilterOptions(),
      appliedPeriods ? fetchTrackingComparison({ ...applied, ...appliedPeriods }) : Promise.resolve(null),
    ]).then(([data, values, compared]) => {
      if (active) { setDashboard(data); setOptions(values); setComparison(compared); setDetailsPage(1);
        const viewport = detailsScrollRef.current?.firstElementChild;
        if (viewport instanceof HTMLElement) viewport.scrollTop = 0;
      }
    }).catch((err: Error) => { if (active) { setDashboard(null); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, appliedPeriods, revision]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to complete request"); }
    finally { setBusy(false); }
  }
  function applyFilters() {
    if (filters.start && filters.end && filters.start >= filters.end) {
      setError("Start date must be before end date");
      return;
    }
    if (!filters.start || !filters.end || !comparisonDates.start || !comparisonDates.end) {
      setError("Select start and end dates for both periods");
      return;
    }
    if (comparisonDates.start >= comparisonDates.end) {
      setError("Period B start date must be before end date");
      return;
    }
    if (invalidPeriodOrder) return;
    setAppliedPeriods({
      a_start: filters.start, a_end: filters.end,
      b_start: comparisonDates.start, b_end: comparisonDates.end,
    });
    setApplied({ ...filters });
  }

  function resetComparison() {
    setFilters({});
    setComparisonDates({ start: "", end: "" });
    setAppliedPeriods(null);
    setComparison(null);
    setAnalysis(null);
    setSelectedItem(null);
    setError("");
    setDetailsPage(1);
    setApplied({});
  }

  function resetRanking() {
    setLevel("reel");
    setMetric("views");
    setAnalysis(null);
    setSelectedItem(null);
  }

  const platformChartData = PLATFORM_OPTIONS.map(platform => {
    const row = dashboard?.platforms.find(item => item.id === platform.name);
    return { id: platform.name, label: platform.shortLabel, views: row?.views ?? null };
  });
  const platformViewValues = Object.fromEntries(platformChartData.map(row => [row.id, row.views]));
  const platformClickValues = Object.fromEntries(PLATFORM_OPTIONS.map(platform => [
    platform.name,
    (dashboard?.click_trend ?? []).reduce((total, day) => total + (day[platform.name as "youtube" | "facebook" | "instagram" | "tiktok"] ?? 0), 0),
  ]));
  const platformClickData = PLATFORM_OPTIONS.map(platform => ({
    id: platform.name, label: platform.label, clicks: platformClickValues[platform.name],
  }));
  const clickDates = (dashboard?.click_trend ?? []).map(day => day.date).sort();
  const clickStart = applied.start || clickDates[0];
  const clickEnd = applied.end || clickDates[clickDates.length - 1];
  const clickDateLabel = clickStart && clickEnd
    ? clickStart === clickEnd ? chartDate(clickStart) : `${chartDate(clickStart)} – ${chartDate(clickEnd)}`
    : "All dates";

  const detailCount = dashboard?.details.length || 0;
  const detailPageCount = Math.max(1, Math.ceil(detailCount / DETAILS_PAGE_SIZE));
  const currentDetailsPage = Math.min(detailsPage, detailPageCount);
  const detailOffset = (currentDetailsPage - 1) * DETAILS_PAGE_SIZE;
  const visibleDetails = dashboard?.details.slice(detailOffset, detailOffset + DETAILS_PAGE_SIZE) || [];

  function changeDetailsPage(page: number) {
    setDetailsPage(Math.max(1, Math.min(page, detailPageCount)));
    const viewport = detailsScrollRef.current?.firstElementChild;
    if (viewport instanceof HTMLElement) viewport.scrollTop = 0;
  }

  const exportButtons = (extra: Partial<TrackingPeriods> & { level?: string; metric?: string } = {}, hasData = Boolean(dashboard?.has_data)) =>
    <div className="flex gap-2">{(["csv", "xlsx"] as const).map(format => <Button key={format} variant="outline" disabled={busy || loading || !hasData} onClick={() => void run(async () => downloadTrackingExport(format, { ...applied, ...extra }))}><Download className="mr-2 h-4 w-4" />{format.toUpperCase()}</Button>)}</div>;

  return <div aria-busy={loading} className="min-w-0 space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Data Tracking</h1><p className="mt-1 text-muted-foreground">Social performance and affiliate link visits</p></div><Button className={`${primaryButtonClass} w-full sm:w-auto`} disabled={busy || loading} onClick={() => void run(async () => { const result = await syncTrackingData(); setRevision(value => value + 1); const failures = result.accounts.filter(account => !account.success); if (failures.length) throw new Error(`${failures.length} account(s) failed to synchronize. See account status below.`); })}><RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />Sync Data</Button></div>
    {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {dashboard && (
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
          <div key={account.id} role="alert" className="flex flex-wrap items-center gap-2 px-1 text-xs text-destructive">
            <p>{account.error?.startsWith(`${account.platform}:`) ? account.error : `${account.platform}: ${account.error}`}</p>
            {account.error?.includes("reconnect this platform") && (
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => connectSocialPlatform(account.platform, "/tracking")}>
                Reconnect {platformLabel(account.platform)}
              </Button>
            )}
          </div>
        ))}
        <p className="px-1 text-xs text-muted-foreground">Report updated {new Date(dashboard.generated_at).toLocaleString()}</p>
      </div>
    )}


    {dashboard && (
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">{([
        { label: 'Views', value: dashboard.totals.views, icon: Eye, color: 'bg-primary/10 text-primary', gradient: 'from-orange-500 via-pink-500 to-purple-600' },
        { label: 'Engagement', value: dashboard.totals.engagement, icon: Heart, color: 'bg-pink-500/10 text-pink-500', gradient: 'from-rose-500 via-pink-500 to-fuchsia-600' },
        { label: 'Affiliate link clicks', value: dashboard.totals.clicks, icon: MousePointerClick, color: 'bg-info/10 text-info', gradient: 'from-cyan-500 via-blue-500 to-indigo-600' },
        { label: 'Tracked Reels', value: dashboard.totals.reels, icon: Video, color: 'bg-violet-500/10 text-violet-500', gradient: 'from-violet-500 via-purple-500 to-fuchsia-600' },
      ]).map(({ label, value, icon: Icon, color, gradient }) => <section key={label} className="group relative overflow-hidden rounded-2xl border border-border bg-card card-shine transition-all duration-300 hover:border-primary/30 hover:shadow-elevated"><div className={`h-1 bg-gradient-to-r ${gradient}`} /><div className="p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{display(value)}</p></div></section>)}</div>
    )}
    {loading && !dashboard ? <p role="status">Loading tracking data…</p> : dashboard && <>

      {!!dashboard.totals.partial_metrics.length && <p className="text-xs text-muted-foreground">Some social metrics are unavailable for part of this scope. Totals include only available values.</p>}
      {!dashboard.has_data && <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/50" /><h2 className="mt-4 font-display text-xl font-semibold text-foreground">Start tracking your content</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">No tracking data matches these filters. Distribute a Reel to create its affiliate tracking link automatically, then synchronize its connected social account.</p></div>}
      <div className="grid gap-5 lg:grid-cols-2">
      <section className={panelClass}>
        <SectionTitle icon={BarChart3} title="Performance by platform" description="Compare the latest observed lifetime views across platforms." />
        <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Lifetime views</p>
        {platformChartData.some(row => row.views !== null) ? (
          <div className="mt-2 h-64" role="img" aria-label="Lifetime views by platform. Exact values are listed below.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformChartData} layout="vertical" margin={{ top: 12, right: 80, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.6} />
                <XAxis type="number" tick={chartAxisTick} tickFormatter={value => chartNumber.format(value)} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={92} tick={chartAxisTick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<TrackingChartTooltip mode="views" />} />
                <Bar dataKey="views" name="Lifetime views" barSize={20} radius={[0, 5, 5, 0]}>
                  {platformChartData.map(row => <Cell key={row.id} fill={CHART_PLATFORM_COLORS[row.id]} stroke={row.id === "tiktok" ? "#94a3b8" : "none"} strokeWidth={1} />)}
                  <LabelList dataKey="views" position="right" offset={8} fill="hsl(var(--foreground))" fontSize={12} fontWeight={600} formatter={(value: number | null) => value == null ? "" : display(value)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="mt-3 flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No social view metrics available.</div>}
        <PlatformLegend values={platformViewValues} />
      </section>
      <section className={panelClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <SectionTitle icon={MousePointerClick} title="Affiliate link clicks by platform" description="Recorded visits · Asia/Bangkok · Does not represent unique visitors" />
          <span className="ml-auto rounded-lg border border-border bg-muted/30 px-3 py-1.5 text-xs tabular-nums text-muted-foreground" aria-label="Click reporting dates">{clickDateLabel}</span>
        </div>
        <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total clicks by source platform</p>
        {dashboard.click_trend.length ? (
          <div className="mt-2 h-64" role="img" aria-label="Affiliate link clicks by source platform.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformClickData} margin={{ top: 24, right: 12, bottom: 0, left: -16 }} accessibilityLayer>
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.6} />
                <XAxis dataKey="label" tick={chartAxisTick} interval={0} axisLine={false} tickLine={false} tickMargin={10} />
                <YAxis tick={chartAxisTick} tickFormatter={value => chartNumber.format(value)} allowDecimals={false} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<TrackingChartTooltip mode="clicks" />} />
                <Bar dataKey="clicks" name="Clicks" maxBarSize={36} radius={[3, 3, 0, 0]}>
                  {platformClickData.map(platform => <Cell key={platform.id} fill={CHART_PLATFORM_COLORS[platform.id]} stroke={platform.id === "tiktok" ? "#94a3b8" : "none"} />)}
                  <LabelList dataKey="clicks" position="top" offset={8} fill="hsl(var(--foreground))" fontSize={12} fontWeight={600} formatter={(value: number) => value > 0 ? display(value) : ""} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="mt-3 flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No recorded clicks in this period.</div>}
        <PlatformLegend values={platformClickValues} />
      </section>
      </div>
      <section aria-label="Compare periods" className={`${panelClass} space-y-5`}>
      <SectionTitle icon={SlidersHorizontal} title="Compare periods" description="Choose two periods and a content scope to compare affiliate link clicks." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ScopeSelect icon={Globe2} label="Platform" value={filters.platform} onChange={value => changeScope("platform", value)}
          placeholder="All platforms" options={options.platforms.map(platform => ({ id: platform, name: platformLabel(platform), platform }))} />
        {(["campaign", "product", "reel"] as const).map(scope => (
          <ScopeSelect key={scope} icon={scope === "campaign" ? Megaphone : scope === "product" ? Package : Video} label={scope.charAt(0).toUpperCase() + scope.slice(1)}
            value={filters[`${scope}_id`]} onChange={value => changeScope(`${scope}_id`, value)}
            placeholder={`All ${scope}s`} options={scopeOptions(scope)} />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <fieldset className="min-w-0 space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <legend className="sr-only">Period A · Baseline</legend>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">A</span>
            <h3 className="text-sm font-semibold text-foreground">Baseline period</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["start", "end"] as const).map(key => (
              <label key={key} className="grid min-w-0 gap-2 text-xs font-medium text-muted-foreground">
                {key === "start" ? "Start date" : "End date"}
                <Input type="date" className={`${inputClass} dark:[color-scheme:dark]`} value={filters[key] || ""} min={key === "end" ? nextDate(filters.start) : undefined} onChange={event => setFilters({ ...filters, [key]: event.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 space-y-4 rounded-xl border border-border bg-muted/30 p-4">
          <legend className="sr-only">Period B · Comparison</legend>
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-xs font-semibold text-primary">B</span>
            <h3 className="text-sm font-semibold text-foreground">Comparison period</h3>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(["start", "end"] as const).map(key => (
              <label key={key} className="grid min-w-0 gap-2 text-xs font-medium text-muted-foreground">
                {key === "start" ? "Period B start date" : "Period B end date"}
                <Input type="date" className={`${inputClass} dark:[color-scheme:dark]`} value={comparisonDates[key]} min={key === "end" ? nextDate(comparisonDates.start) : nextDate(filters.end)} onChange={event => setComparisonDates({ ...comparisonDates, [key]: event.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">The same filters apply to both periods. Period A also filters the dashboard and ranking.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {appliedPeriods && <Button variant="outline" className="gap-2" disabled={busy || loading} onClick={resetComparison}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reset</Button>}
          <Button className={`${primaryButtonClass} w-full sm:w-auto`} disabled={busy || loading || invalidPeriodOrder} onClick={applyFilters}><ArrowLeftRight className="h-4 w-4" aria-hidden="true" />Compare periods</Button>
        </div>
      </div>
      {invalidPeriodOrder && <p role="alert" className="text-sm text-destructive">Period B must start after Period A ends.</p>}
      <details className="group rounded-xl border border-info/25 bg-info/5 p-4 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-info focus-visible:ring-offset-2 focus-visible:ring-offset-card [&::-webkit-details-marker]:hidden">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-info/10 text-info"><Info className="h-5 w-5" aria-hidden="true" /></span>
          <span>How these metrics are counted</span>
          <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-info transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <p className="mt-3 max-w-4xl leading-relaxed text-foreground/80 sm:ml-12">Social figures are the latest lifetime observation in the selected dates. Clicks are visits during those dates (Asia/Bangkok). Repeat visits count; recognized bots, previews and HEAD requests do not. These figures do not measure purchases or unique visitors. Period comparison supports affiliate link clicks; social daily activity is unavailable from lifetime observations.</p>
      </details>
    </section>

    {comparison && appliedPeriods && (
      <section className={panelClass} aria-label="Period comparison results">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={ArrowLeftRight} title="Period comparison · Affiliate link clicks" description="Review changes in link clicks between the two selected periods." />
          {exportButtons(appliedPeriods, Boolean(comparison.coverage_start))}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          <p>A ({comparison.a.start} – {comparison.a.end}): {display(comparison.a.clicks)}{!comparison.a.complete && " · Partial coverage"}</p>
          <p>B ({comparison.b.start} – {comparison.b.end}): {display(comparison.b.clicks)}{!comparison.b.complete && " · Partial coverage"}</p>
          <p>Change: {display(comparison.difference)} · {comparison.percentage_change == null ? "Percentage unavailable" : `${comparison.percentage_change}%`}</p>
          {!comparison.equal_duration && <p className="text-muted-foreground">Periods have different durations.</p>}
          <p className="text-xs text-muted-foreground">{comparison.limitation}</p>
        </div>
      </section>
    )}


      <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle icon={Trophy} title="Content ranking" description="Rank Reels, products, campaigns or platforms by a selected metric." /><div className="flex flex-wrap gap-2"><ScopeSelect icon={Video} label="Ranking level" showLabel={false} allowAll={false} className="w-40" placeholder="Level" value={level}
                onChange={value => { setLevel(value as TrackingAnalysis["level"]); setAnalysis(null); setSelectedItem(null); }}
                options={[
                  { id: "reel", name: "Reel", icon: Video }, { id: "product", name: "Product", icon: Package },
                  { id: "campaign", name: "Campaign", icon: Megaphone }, { id: "platform", name: "Platform", icon: Globe2 },
                ]} />
              <ScopeSelect icon={BarChart3} label="Ranking metric" showLabel={false} allowAll={false} className="w-44" placeholder="Metric" value={metric}
                onChange={value => { setMetric(value as TrackingAnalysis["metric"]); setAnalysis(null); setSelectedItem(null); }}
                options={[
                  { id: "views", name: "Views", icon: Eye }, { id: "engagement", name: "Engagement", icon: Heart },
                  { id: "clicks", name: "Affiliate clicks", icon: MousePointerClick },
                ]} />{(analysis || level !== "reel" || metric !== "views") && <Button variant="outline" className="gap-2" disabled={busy || loading} onClick={resetRanking}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reset</Button>}<Button className={primaryButtonClass} disabled={busy} onClick={() => void run(async () => setAnalysis(await fetchTrackingAnalysis({ ...applied, level, metric })))}><SearchCheck className="h-4 w-4" aria-hidden="true" />Analyze</Button>{analysis && exportButtons({ level: analysis.level, metric: analysis.metric })}</div></div>{analysis && <div className="mt-4 space-y-2">{!analysis.rows.length && <p>No matching content.</p>}{analysis.rows.map((item, index) => <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="flex w-full justify-between gap-3 border-b border-border py-2 text-left text-sm hover:bg-muted"><span>#{index + 1} {item.name || "Untitled"}</span><span>{display(item.value)}</span></button>)}</div>}{selectedItem && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm"><h3 className="mb-2 font-semibold">{selectedItem.name || "Untitled"}</h3><div className="grid gap-2 sm:grid-cols-3">{(["views", "likes", "comments", "shares", "engagement", "clicks"] as const).map(key => <p key={key} className="capitalize">{key}: {display(selectedItem[key])}</p>)}</div>{!!selectedItem.partial_metrics.length && <p className="mt-2 text-xs text-muted-foreground">Some counters are unavailable in this scope.</p>}</div>}</section>
    <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={TableProperties} title="Tracking details" description="Review social metrics and affiliate link clicks for each Reel." />
          {exportButtons()}
        </div>
        <div ref={detailsScrollRef} role="region" aria-label="Tracking details table" tabIndex={0}
          className="mt-4 overflow-hidden rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div]:max-h-[480px] [&>div]:overscroll-contain">
          <Table className="min-w-[850px]">
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                {['Reel / platform', 'Views', 'Likes', 'Comments', 'Shares', 'Link clicks', 'Observation'].map(title => (
                  <TableHead key={title} className="whitespace-nowrap text-xs">{title}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDetails.length ? visibleDetails.map(row => (
                <TableRow key={row.distribution_id}>
                  <TableCell className="max-w-60 truncate p-2" title={`${row.reel_name} · ${row.platform}`}>{row.reel_name} · {row.platform}</TableCell>
                  {[row.views, row.likes, row.comments, row.shares, row.clicks].map((value, index) => (
                    <TableCell key={index} className="p-2">{display(value)}</TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap p-2">{row.observed_at ? new Date(row.observed_at).toLocaleString() : 'Unavailable'}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={7} className="h-28 text-center text-muted-foreground">No tracking details match the selected filters.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p role="status" className="text-xs text-muted-foreground">
            Showing {detailCount ? detailOffset + 1 : 0}–{Math.min(detailOffset + DETAILS_PAGE_SIZE, detailCount)} of {detailCount} · 25 rows per page
          </p>
          <nav aria-label="Tracking details pagination" className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={loading || currentDetailsPage === 1}
              onClick={() => changeDetailsPage(currentDetailsPage - 1)} aria-label="Previous tracking details page">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" /> Previous
            </Button>
            <span className="whitespace-nowrap px-2 text-xs text-muted-foreground">Page {currentDetailsPage} of {detailPageCount}</span>
            <Button variant="outline" size="sm" disabled={loading || currentDetailsPage === detailPageCount}
              onClick={() => changeDetailsPage(currentDetailsPage + 1)} aria-label="Next tracking details page">
              Next <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </nav>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Use links only in locations the platform allows viewers to open. Instagram and TikTok captions may not provide clickable links. A shared bio link alone cannot identify the originating Reel.</p>
      </section>


    </>}
  </div>;
}

"use client";

import { LoadingState } from "@/components/LoadingState";
import { useTrackingSync } from "@/hooks/useTrackingSync";
import { usePendingAction } from "@/hooks/usePendingAction";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Loader2, BarChart3, SearchCheck, Download, RefreshCw, Eye, Heart, MessageCircle, Share2, MousePointerClick, Video, SlidersHorizontal, Settings2, Trophy, TableProperties, ArrowLeftRight, ChevronLeft, ChevronRight, Globe2, Megaphone, Package, Info, RotateCcw, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_OPTIONS, connectSocialPlatform, platformLabel } from "@/lib/platforms";
import { downloadTrackingExport, fetchTrackingAnalysis, fetchTrackingComparison, fetchTrackingDashboard, fetchTrackingFilterOptions, type TrackingAnalysis, type TrackingComparison, type TrackingDashboard, type TrackingFilterOptions, type TrackingFilters, type TrackingPeriods } from "@/lib/api";

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

function TopPlatform({ values }: { values: Record<string, number | null> }) {
  const available = PLATFORM_OPTIONS.filter(platform => values[platform.name] != null);
  const highest = available.length ? Math.max(...available.map(platform => values[platform.name]!)) : null;
  const leaders = available.filter(platform => values[platform.name] === highest);
  return (
    <div className="ml-auto flex max-w-40 flex-col items-end gap-1.5 text-right" aria-label="Top platform">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Top platform</span>
      <div className="flex flex-wrap justify-end gap-1.5">
        {leaders.length ? leaders.map(platform => (
          <span key={platform.name} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-medium text-foreground">
            <PlatformIcon platform={platform.name} className={`h-3.5 w-3.5 shrink-0 ${platform.color}`} />
            <span>{platform.label} · {display(highest)}</span>
          </span>
        )) : <span className="text-xs text-muted-foreground">Unavailable</span>}
      </div>
    </div>
  );
}

function TrackingChartTooltip({ active, payload, label, mode }: TooltipProps<number, string> & { mode: "views" | "social" | "clicks" }) {
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

function SocialPlatformChart({ platforms, metric, label, icon }: {
  platforms: TrackingDashboard["platforms"];
  metric: "likes" | "comments" | "shares";
  label: string;
  icon: LucideIcon;
}) {
  const data = PLATFORM_OPTIONS.map(platform => ({
    id: platform.name,
    label: platform.shortLabel,
    value: platforms.find(row => row.id === platform.name)?.[metric] ?? null,
  }));
  const values = Object.fromEntries(data.map(row => [row.id, row.value]));
  return (
    <section className={panelClass}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <SectionTitle icon={icon} title={`${label} by platform`} description={`Compare the latest observed lifetime ${metric} across platforms.`} />
        <TopPlatform values={values} />
      </div>
      <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Lifetime {metric}</p>
      {data.some(row => row.value !== null) ? (
        <div className="mt-2 h-64" role="img" aria-label={`Lifetime ${metric} by platform. Exact values are listed below.`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 12, right: 60, bottom: 0, left: 0 }} accessibilityLayer>
              <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.6} />
              <XAxis type="number" tick={chartAxisTick} tickFormatter={value => chartNumber.format(value)} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis type="category" dataKey="label" width={92} tick={chartAxisTick} axisLine={false} tickLine={false} />
              <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<TrackingChartTooltip mode="social" />} />
              <Bar dataKey="value" name={`Lifetime ${metric}`} barSize={20} radius={[0, 5, 5, 0]}>
                {data.map(row => <Cell key={row.id} fill={CHART_PLATFORM_COLORS[row.id]} stroke={row.id === "tiktok" ? "#94a3b8" : "none"} strokeWidth={1} />)}
                <LabelList dataKey="value" position="right" offset={8} fill="hsl(var(--foreground))" fontSize={12} fontWeight={600} formatter={(value: number | null) => value == null ? "" : display(value)} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : <div className="mt-3 flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No {metric} metrics available.</div>}
      <PlatformLegend values={values} />
    </section>
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

function MetricGrowth({ a, b, label }: { a: number; b: number; label: string }) {
  const growth = b - a;
  const rate = a === 0 ? null : Math.round(growth / a * 10000) / 100;
  const signed = (value: number) => `${value > 0 ? "+" : ""}${display(value)}`;
  const color = growth === 0 ? "text-foreground" : growth > 0 ? "text-success" : "text-destructive";
  return <div className="space-y-2 border-t border-border/60 pt-3">
    <dl className="space-y-2 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><dt className="text-muted-foreground">Growth</dt><dd aria-label={`${label} growth`} className={`font-semibold tabular-nums ${color}`}>{signed(growth)}{label === "Click" ? " clicks" : ""}</dd></div>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><dt className="text-muted-foreground">Growth Rate</dt><dd aria-label={`${label} growth rate`} className={`font-semibold tabular-nums ${color}`}>{rate == null ? "—" : `${signed(rate)}%`}</dd></div>
    </dl>
    {rate == null && <p className="text-[10px] text-muted-foreground">Growth Rate undefined: Period A is 0.</p>}
  </div>;
}

function ComparisonOverview({ comparison, scope, actions }: {
  comparison: TrackingComparison;
  scope: string[];
  actions: ReactNode;
}) {
  const dateLabel = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  const complete = comparison.a.complete && comparison.b.complete;
  const maxClicks = Math.max(comparison.a.clicks, comparison.b.clicks, 1);
  const socialMetrics = [
    { key: "views", label: "Views", icon: Eye },
    { key: "likes", label: "Likes", icon: Heart },
    { key: "comments", label: "Comments", icon: MessageCircle },
    { key: "shares", label: "Shares", icon: Share2 },
    { key: "engagement", label: "Engagement", icon: BarChart3 },
  ] as const;
  return <section className={`${panelClass} space-y-6`} aria-label="Period comparison results">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <SectionTitle icon={ArrowLeftRight} title="Period comparison · Overview" description="Two periods, one scope. Review link activity and social observations side by side." />
      {actions}
    </div>
    <div className="flex flex-wrap items-center gap-2" aria-label="Applied comparison scope">
      {scope.map((label, index) => <span key={`${index}-${label}`} className="rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground/80">{label}</span>)}
      <span className="text-xs text-muted-foreground sm:ml-auto">Asia/Bangkok</span>
    </div>
    <div className="grid gap-3 md:grid-cols-2">
      {(["a", "b"] as const).map(period => {
        const values = comparison[period];
        const days = Math.round((Date.parse(values.end) - Date.parse(values.start)) / 86400000) + 1;
        return <div key={period} className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/20 p-4">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${period === "a" ? "bg-muted text-foreground" : "bg-primary/15 text-primary"}`}>{period.toUpperCase()}</span>
          <div className="min-w-0 flex-1"><p className="text-xs font-medium text-muted-foreground">{period === "a" ? "Baseline period" : "Comparison period"} · {days} days</p><p className="mt-1 text-sm font-semibold">{dateLabel(values.start)} – {dateLabel(values.end)}</p></div>
          <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${values.complete ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>{values.complete ? "Full coverage" : "Partial coverage"}</span>
        </div>;
      })}
    </div>
    {!comparison.equal_duration && <p className="flex items-center gap-2 rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning"><Info className="h-4 w-4 shrink-0" aria-hidden="true" />Periods have different durations. Totals reflect different numbers of days.</p>}
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="flex items-center gap-2 text-sm font-semibold"><MousePointerClick className="h-4 w-4 text-primary" aria-hidden="true" />Affiliate link clicks</h3><span className="text-[11px] text-muted-foreground">Activity within each period</span></div>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        {(["a", "b"] as const).map(period => <div key={period}><p className="text-xs text-muted-foreground">Period {period.toUpperCase()}</p><p className="mt-2 text-3xl font-semibold tabular-nums" aria-label={`Period ${period.toUpperCase()} link clicks`}>{display(comparison[period].clicks)}</p><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true"><div className={`h-full rounded-full ${period === "a" ? "bg-muted-foreground" : "bg-primary"}`} style={{ width: `${comparison[period].clicks / maxClicks * 100}%` }} /></div></div>)}
        <div className="sm:border-l sm:border-primary/15 sm:pl-5"><MetricGrowth a={comparison.a.clicks} b={comparison.b.clicks} label="Click" /></div>
      </div>
      {!complete && <p className="mt-4 border-t border-primary/15 pt-3 text-xs leading-relaxed text-muted-foreground">Growth uses the recorded clicks shown above. One or both periods have partial coverage or are still in progress.</p>}
    </div>
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">Social performance</h3><span className="text-[11px] text-muted-foreground">Latest lifetime observation in each period</span></div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">These are cumulative counters observed during each period, not activity earned within that period. Unavailable counters are counted as 0 in this overview. Growth compares these observed totals.</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {socialMetrics.map(({ key, label, icon: Icon }) => <div key={key} className="min-w-0 rounded-xl border border-border bg-muted/20 p-4" aria-label={`${label} observations`}>
          <h4 className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><Icon className="h-4 w-4" aria-hidden="true" />{label}</h4>
          <dl className="mt-4 space-y-3">{(["a", "b"] as const).map(period => <div key={period} className="flex items-baseline justify-between gap-2"><dt className="text-xs text-muted-foreground">{period.toUpperCase()}</dt><dd className="text-lg font-semibold tabular-nums">{display(comparison[period].social?.[key] ?? 0)}</dd></div>)}</dl>
          <div className="mt-4"><MetricGrowth a={comparison.a.social?.[key] ?? 0} b={comparison.b.social?.[key] ?? 0} label={label} /></div>
        </div>)}
      </div>
    </div>
    <div className="flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /><p>{comparison.limitation}</p></div>
  </section>;
}

function PeriodComparison({ options }: { options: TrackingFilterOptions }) {
  const [filters, setFilters] = useState<TrackingFilters>({});
  const [applied, setApplied] = useState<TrackingFilters>({});
  const [comparisonDates, setComparisonDates] = useState({ start: "", end: "" });
  const [appliedPeriods, setAppliedPeriods] = useState<TrackingPeriods | null>(null);
  const [comparison, setComparison] = useState<TrackingComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const { pending, run: runPendingAction } = usePendingAction();
  const busy = pending !== null;
  const [error, setError] = useState("");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const hasFutureDate = [filters.start, filters.end, comparisonDates.start, comparisonDates.end]
    .some(value => value && value > today);
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
    if (!appliedPeriods) return;
    let active = true;
    setLoading(true); setError(""); setComparison(null);
    fetchTrackingComparison({ ...applied, ...appliedPeriods })
      .then(result => { if (active) setComparison(result); })
      .catch((err: Error) => { if (active) setError(err.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [applied, appliedPeriods]);

  function run(action: () => Promise<void>, label = "Preparing export…") {
    return runPendingAction(label, async () => {
      setError("");
      try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to complete request"); }
    });
  }
  function applyFilters() {
    if (hasFutureDate) {
      setError("Dates cannot be later than today (Asia/Bangkok)");
      return;
    }
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
    setError("");
    setApplied({});
  }

  const exportButtons = (periods: TrackingPeriods, hasData: boolean) =>
    <div className="flex gap-2">{(["csv", "xlsx"] as const).map(format => <Button key={format} variant="outline" disabled={busy || loading || !hasData} onClick={() => void run(async () => downloadTrackingExport(format, { ...applied, ...periods }), `Exporting ${format.toUpperCase()}…`)}>{pending === `Exporting ${format.toUpperCase()}…` ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{pending === `Exporting ${format.toUpperCase()}…` ? "Exporting…" : format.toUpperCase()}</Button>)}</div>;

  return <div aria-busy={loading || busy} className="space-y-5">
      <section aria-label="Compare periods" className={`${panelClass} space-y-5`}>
      <SectionTitle icon={SlidersHorizontal} title="Compare periods" description="Choose two periods and a content scope to review performance side by side." />
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
                <Input type="date" max={today} className={`${inputClass} [color-scheme:dark]`} value={filters[key] || ""} min={key === "end" ? nextDate(filters.start) : undefined} onChange={event => setFilters({ ...filters, [key]: event.target.value })} />
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
                <Input type="date" max={today} className={`${inputClass} [color-scheme:dark]`} value={comparisonDates[key]} min={key === "end" ? nextDate(comparisonDates.start) : nextDate(filters.end)} onChange={event => setComparisonDates({ ...comparisonDates, [key]: event.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl text-xs leading-relaxed text-muted-foreground">These filters apply only to this comparison. Dashboard, ranking and tracking details keep their current state.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {appliedPeriods && <Button variant="outline" className="gap-2" disabled={busy || loading} onClick={resetComparison}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reset</Button>}
          <Button className={`${primaryButtonClass} w-full sm:w-auto`} disabled={busy || loading || invalidPeriodOrder || hasFutureDate} onClick={applyFilters}><ArrowLeftRight className="h-4 w-4" aria-hidden="true" />Compare periods</Button>
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {pending && <span role="status" className="sr-only">{pending}</span>}
      {loading && <LoadingState label="Comparing periods…" />}
      {invalidPeriodOrder && <p role="alert" className="text-sm text-destructive">Period B must start after Period A ends.</p>}
      {hasFutureDate && <p role="alert" className="text-sm text-destructive">Dates cannot be later than today (Asia/Bangkok).</p>}
      <aside aria-label="About these metrics" className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>Social metrics are lifetime snapshots. Clicks count repeat visits (Asia/Bangkok), excluding recognized bots and previews. Unavailable = 0; growth compares B with A.</p>
      </aside>
    </section>

    {comparison && appliedPeriods && (
      <ComparisonOverview comparison={comparison} actions={exportButtons(appliedPeriods, Boolean(comparison.coverage_start))}
        scope={[
          applied.platform ? platformLabel(applied.platform) : "All platforms",
          ...(["campaign", "product", "reel"] as const).flatMap(scope => {
            const id = applied[`${scope}_id`];
            return id ? [options[`${scope}s`].find(option => option.id === id)?.name || `Selected ${scope}`] : [];
          }),
        ]} />
    )}


  </div>;
}

function TrackingEntrance({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const reduceMotion = useReducedMotion();
  return <motion.div
    initial={reduceMotion ? false : { opacity: 0, y: 8 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduceMotion ? 0 : 0.22, delay: reduceMotion ? 0 : delay, ease: "easeOut" }}
    className={`min-w-0 ${className}`}
  >{children}</motion.div>;
}

export default function Tracking() {
  const [options, setOptions] = useState(emptyOptions);
  const [dashboard, setDashboard] = useState<TrackingDashboard | null>(null);
  const [detailsPage, setDetailsPage] = useState(1);
  const detailsScrollRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState<TrackingAnalysis["level"]>("reel");
  const [metric, setMetric] = useState<TrackingAnalysis["metric"]>("views");
  const [analysis, setAnalysis] = useState<TrackingAnalysis | null>(null);
  const [selectedItem, setSelectedItem] = useState<TrackingAnalysis["rows"][number] | null>(null);
  const [loading, setLoading] = useState(true);
  const { pending, run: runPendingAction } = usePendingAction();
  const busy = pending !== null;
  const [revision, setRevision] = useState(0);
  const syncCompleted = useCallback(() => setRevision(value => value + 1), []);
  const sync = useTrackingSync(syncCompleted);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setAnalysis(null); setSelectedItem(null);
    Promise.all([
      fetchTrackingDashboard({}),
      fetchTrackingFilterOptions(),
    ]).then(([data, values]) => {
      if (active) { setDashboard(data); setOptions(values); setDetailsPage(1);
        const viewport = detailsScrollRef.current?.firstElementChild;
        if (viewport instanceof HTMLElement) viewport.scrollTop = 0;
      }
    }).catch((err: Error) => { if (active) { setDashboard(null); setError(err.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [revision]);

  function run(action: () => Promise<void>, label = "Preparing export…") {
    return runPendingAction(label, async () => {
      setError("");
      try { await action(); } catch (err) { setError(err instanceof Error ? err.message : "Unable to complete request"); }
    });
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
    id: platform.name, label: platform.shortLabel, clicks: platformClickValues[platform.name],
  }));

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

  const exportButtons = (extra: Partial<TrackingPeriods> & { level?: string; metric?: string } = {}, hasData = Boolean(dashboard?.has_data)) => (
    <div className="flex gap-2">{(["csv", "xlsx"] as const).map(format => {
      const label = `Exporting ${extra.level ? "ranking" : "details"} ${format.toUpperCase()}…`;
      const exporting = pending === label;
      return <Button key={format} variant="outline" disabled={busy || loading || !hasData}
        onClick={() => void run(async () => downloadTrackingExport(format, { ...extra }), label)}>
        {exporting ? <Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
        {exporting ? "Exporting…" : format.toUpperCase()}
      </Button>;
    })}</div>
  );

  return <div aria-busy={loading || busy} className="min-w-0 space-y-6">
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Data Tracking</h1><p className="mt-1 text-muted-foreground">Social performance and affiliate link visits</p></div><Button className={`${primaryButtonClass} w-full sm:w-auto`} disabled={busy || loading || sync.busy} onClick={() => void sync.start()}><RefreshCw className={`mr-2 h-4 w-4 ${sync.busy ? "animate-spin" : ""}`} />{sync.busy ? "Syncing…" : "Sync Data"}</Button></div>
    {sync.error && <p role="alert" className="text-sm text-destructive">{sync.error}</p>}
    {pending && <span role="status" className="sr-only">{pending}</span>}
    {loading && dashboard && <LoadingState label="Refreshing tracking data…" />}
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
      <TrackingEntrance delay={0} className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{([
        { label: 'Views', value: dashboard.totals.views, icon: Eye, color: 'bg-primary/10 text-primary', gradient: 'from-orange-500 via-pink-500 to-purple-600' },
        { label: 'Likes', value: dashboard.totals.likes, icon: Heart, color: 'bg-pink-500/10 text-pink-500', gradient: 'from-rose-500 via-pink-500 to-fuchsia-600' },
        { label: 'Comments', value: dashboard.totals.comments, icon: MessageCircle, color: 'bg-amber-500/10 text-amber-500', gradient: 'from-amber-500 via-orange-500 to-rose-500' },
        { label: 'Shares', value: dashboard.totals.shares, icon: Share2, color: 'bg-emerald-500/10 text-emerald-500', gradient: 'from-emerald-500 via-teal-500 to-cyan-600' },
        { label: 'Affiliate link clicks', value: dashboard.totals.clicks, icon: MousePointerClick, color: 'bg-info/10 text-info', gradient: 'from-cyan-500 via-blue-500 to-indigo-600' },
        { label: 'Tracked Reels', value: dashboard.totals.reels, icon: Video, color: 'bg-violet-500/10 text-violet-500', gradient: 'from-violet-500 via-purple-500 to-fuchsia-600' },
      ]).map(({ label, value, icon: Icon, color, gradient }) => <section key={label} className="group relative overflow-hidden rounded-2xl border border-border bg-card card-shine transition-all duration-300 hover:border-primary/30 hover:shadow-elevated"><div className={`h-1 bg-gradient-to-r ${gradient}`} /><div className="p-5"><div className="flex items-center justify-between gap-3"><p className="text-sm text-muted-foreground">{label}</p><span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${color}`}><Icon className="h-4 w-4" /></span></div><p className="mt-3 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{display(value)}</p></div></section>)}</TrackingEntrance>
    )}
    {loading && !dashboard ? <p role="status">Loading tracking data…</p> : dashboard && <>

      {!!dashboard.totals.partial_metrics.length && <p className="text-xs text-muted-foreground">Some social metrics are unavailable for part of this scope. Totals include only available values.</p>}
      {!dashboard.has_data && <div className="rounded-2xl border border-dashed border-border bg-card px-6 py-12 text-center"><BarChart3 className="mx-auto h-10 w-10 text-muted-foreground/50" /><h2 className="mt-4 font-display text-xl font-semibold text-foreground">Start tracking your content</h2><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">No tracking data matches these filters. Distribute a Reel to create its affiliate tracking link automatically, then synchronize its connected social account.</p></div>}
      <TrackingEntrance delay={0.02} className="grid gap-5 lg:grid-cols-2">
      <section className={panelClass}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <SectionTitle icon={BarChart3} title="View by platform" description="Compare the latest observed lifetime views across platforms." />
          <TopPlatform values={platformViewValues} />
        </div>
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <SectionTitle icon={MousePointerClick} title="Affiliate link clicks by platform" description="Recorded visits · Asia/Bangkok · Does not represent unique visitors" />
          <TopPlatform values={platformClickValues} />
        </div>
        <p className="mt-5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Total clicks by source platform</p>
        {dashboard.click_trend.length ? (
          <div className="mt-2 h-64" role="img" aria-label="Affiliate link clicks by source platform.">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={platformClickData} layout="vertical" margin={{ top: 12, right: 80, bottom: 0, left: 0 }} accessibilityLayer>
                <CartesianGrid horizontal={false} stroke="hsl(var(--border))" strokeDasharray="3 3" strokeOpacity={0.6} />
                <XAxis type="number" tick={chartAxisTick} tickFormatter={value => chartNumber.format(value)} axisLine={false} tickLine={false} allowDecimals={false} />
                <YAxis type="category" dataKey="label" width={92} tick={chartAxisTick} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} content={<TrackingChartTooltip mode="clicks" />} />
                <Bar dataKey="clicks" name="Clicks" barSize={20} radius={[0, 5, 5, 0]}>
                  {platformClickData.map(platform => <Cell key={platform.id} fill={CHART_PLATFORM_COLORS[platform.id]} stroke={platform.id === "tiktok" ? "#94a3b8" : "none"} />)}
                  <LabelList dataKey="clicks" position="right" offset={8} fill="hsl(var(--foreground))" fontSize={12} fontWeight={600} formatter={(value: number) => display(value)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <div className="mt-3 flex h-64 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">No recorded clicks in this period.</div>}
        <PlatformLegend values={platformClickValues} />
      </section>
      <div className="grid min-w-0 gap-5 lg:col-span-2 xl:grid-cols-3">
        <SocialPlatformChart platforms={dashboard.platforms} metric="likes" label="Likes" icon={Heart} />
        <SocialPlatformChart platforms={dashboard.platforms} metric="comments" label="Comments" icon={MessageCircle} />
        <SocialPlatformChart platforms={dashboard.platforms} metric="shares" label="Shares" icon={Share2} />
      </div>
      </TrackingEntrance>
      <TrackingEntrance delay={0.04}>
      <section className={panelClass}><div className="flex flex-wrap items-center justify-between gap-3"><SectionTitle icon={Trophy} title="Content ranking" description="Rank Reels, products, campaigns or platforms by a selected metric." /><div className="flex flex-wrap gap-2"><ScopeSelect icon={Video} label="Ranking level" showLabel={false} allowAll={false} className="w-40" placeholder="Level" value={level}
                onChange={value => { setLevel(value as TrackingAnalysis["level"]); setAnalysis(null); setSelectedItem(null); }}
                options={[
                  { id: "reel", name: "Reel", icon: Video }, { id: "product", name: "Product", icon: Package },
                  { id: "campaign", name: "Campaign", icon: Megaphone }, { id: "platform", name: "Platform", icon: Globe2 },
                ]} />
              <ScopeSelect icon={BarChart3} label="Ranking metric" showLabel={false} allowAll={false} className="w-56" placeholder="Metric" value={metric}
                onChange={value => { setMetric(value as TrackingAnalysis["metric"]); setAnalysis(null); setSelectedItem(null); }}
                options={[
                  { id: "views", name: "Views", icon: Eye }, { id: "likes", name: "Likes", icon: Heart },
                  { id: "comments", name: "Comments", icon: MessageCircle }, { id: "shares", name: "Shares", icon: Share2 },
                  { id: "clicks", name: "Affiliate link clicks", icon: MousePointerClick },
                ]} />{(analysis || level !== "reel" || metric !== "views") && <Button variant="outline" className="gap-2" disabled={busy || loading} onClick={resetRanking}><RotateCcw className="h-4 w-4" aria-hidden="true" />Reset</Button>}<Button className={primaryButtonClass} disabled={busy} onClick={() => void run(async () => setAnalysis(await fetchTrackingAnalysis({ level, metric })), "Analyzing…")}>{pending === "Analyzing…" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <SearchCheck className="h-4 w-4" aria-hidden="true" />}{pending === "Analyzing…" ? "Analyzing…" : "Analyze"}</Button>{analysis && exportButtons({ level: analysis.level, metric: analysis.metric })}</div></div>{analysis && <div className="mt-4 space-y-2">{!analysis.rows.length && <p>No matching content.</p>}{analysis.rows.map((item, index) => <button key={item.id} type="button" onClick={() => setSelectedItem(item)} className="flex w-full flex-wrap items-start justify-between gap-3 border-b border-border py-2 text-left text-sm hover:bg-muted"><span className="min-w-0 flex-1">#{index + 1} {item.name || "Untitled"}</span>
                  <span className="shrink-0 tabular-nums">{display(item.value)}</span>
                  <span className="w-full text-xs text-muted-foreground sm:w-56 sm:text-right" title="Latest social observation in this group">
                    Observed At: {item.observed_at ? new Date(item.observed_at).toLocaleString() : 'Unavailable'}
                  </span></button>)}</div>}{selectedItem && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4 text-sm"><h3 className="mb-2 font-semibold">{selectedItem.name || "Untitled"}</h3><div className="grid gap-2 sm:grid-cols-3">{(["views", "likes", "comments", "shares", "engagement", "clicks"] as const).map(key => <p key={key} className="capitalize">{key}: {display(selectedItem[key])}</p>)}</div>{!!selectedItem.partial_metrics.length && <p className="mt-2 text-xs text-muted-foreground">Some counters are unavailable in this scope.</p>}</div>}</section>

      </TrackingEntrance>

      <TrackingEntrance delay={0.06}><PeriodComparison options={options} /></TrackingEntrance>

    <TrackingEntrance delay={0.06}>
    <section className={panelClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={TableProperties} title="Tracking details" description="Review social metrics and affiliate link clicks for each Reel." />
          {exportButtons()}
        </div>
        <div ref={detailsScrollRef} role="region" aria-label="Tracking details table" tabIndex={0}
          className="mt-4 overflow-hidden rounded-xl border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&>div]:max-h-[480px] [&>div]:overscroll-contain">
          <Table className="min-w-[1050px]">
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow>
                {['Reel', 'Platform', 'Distribute Date', 'Views', 'Likes', 'Comments', 'Shares', 'Link clicks', 'Observation'].map(title => (
                  <TableHead key={title} className="whitespace-nowrap text-xs">{title}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleDetails.length ? visibleDetails.map(row => (
                <TableRow key={row.distribution_id}>
                  <TableCell className="max-w-60 truncate p-2" title={row.reel_name}>{row.reel_name}</TableCell>
                  <TableCell className="whitespace-nowrap p-2">{platformLabel(row.platform)}</TableCell>
                  <TableCell className="whitespace-nowrap p-2">{row.distribute_date ? new Date(row.distribute_date).toLocaleString() : 'Unavailable'}</TableCell>
                  {[row.views, row.likes, row.comments, row.shares, row.clicks].map((value, index) => (
                    <TableCell key={index} className="p-2">{display(value)}</TableCell>
                  ))}
                  <TableCell className="whitespace-nowrap p-2">{row.observed_at ? new Date(row.observed_at).toLocaleString() : 'Unavailable'}</TableCell>
                </TableRow>
              )) : (
                <TableRow><TableCell colSpan={9} className="h-28 text-center text-muted-foreground">No tracking details match the selected filters.</TableCell></TableRow>
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
        <div className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <p>Use links only in locations the platform allows viewers to open. Instagram and TikTok captions may not provide clickable links. A shared bio link alone cannot identify the originating Reel.</p>
        </div>
      </section>
    </TrackingEntrance>

    </>}
  </div>;
}

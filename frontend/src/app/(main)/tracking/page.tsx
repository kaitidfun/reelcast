"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Video, Eye, BarChart3, ShoppingCart, DollarSign, MousePointerClick, ToggleLeft, ToggleRight } from "lucide-react";
import StatCard from "@/components/StatCard";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

const socialData = [
  { date: "Mar 3", views: 4200, clicks: 1800, conversions: 320 },
  { date: "Mar 4", views: 5100, clicks: 2100, conversions: 410 },
  { date: "Mar 5", views: 4800, clicks: 1950, conversions: 380 },
  { date: "Mar 6", views: 6200, clicks: 2800, conversions: 520 },
  { date: "Mar 7", views: 7100, clicks: 3200, conversions: 610 },
  { date: "Mar 8", views: 6800, clicks: 2900, conversions: 580 },
  { date: "Today", views: 7500, clicks: 3400, conversions: 670 },
];

const ecommerceData = [
  { id: "tiktok-shop", platform: "TikTok Shop", icon: "🛒", orders: 245, ctr: 4.2, revenue: 128500 },
  { id: "shopee", platform: "Shopee", icon: "🧡", orders: 189, ctr: 3.8, revenue: 95200 },
  { id: "lazada", platform: "Lazada", icon: "🛍️", orders: 134, ctr: 3.1, revenue: 72800 },
];

type EcommercePlatform = (typeof ecommerceData)[number];

const platformEngagement = [
  { date: "Mar 3", youtube: 2800, tiktok: 3500, facebook: 1900, instagram: 2100 },
  { date: "Mar 4", youtube: 3200, tiktok: 4100, facebook: 2200, instagram: 2400 },
  { date: "Mar 5", youtube: 2900, tiktok: 3800, facebook: 2000, instagram: 2300 },
  { date: "Mar 6", youtube: 4100, tiktok: 5200, facebook: 2800, instagram: 3100 },
  { date: "Mar 7", youtube: 4500, tiktok: 5800, facebook: 3100, instagram: 3400 },
  { date: "Mar 8", youtube: 4200, tiktok: 5500, facebook: 2900, instagram: 3200 },
  { date: "Today", youtube: 4800, tiktok: 6200, facebook: 3300, instagram: 3600 },
];

const socialMetrics = [
  { key: "views", label: "Views", color: "hsl(var(--primary))" },
  { key: "clicks", label: "Clicks", color: "hsl(var(--info))" },
  { key: "conversions", label: "Conversions", color: "hsl(var(--success))" },
] as const;

const Tracking = () => {
  const [activeMetrics, setActiveMetrics] = useState<string[]>(["views", "clicks", "conversions"]);
  const [chartTab, setChartTab] = useState<"social" | "ecommerce" | "platform">("social");
  const [ecommercePlatforms, setEcommercePlatforms] = useState<Array<EcommercePlatform & { active: boolean }>>(
    ecommerceData.map((platform) => ({ ...platform, active: platform.id === "tiktok-shop" })),
  );
  const activeEcommerceData = ecommercePlatforms.filter((platform) => platform.active);

  const toggleEcommercePlatform = (id: string) => {
    setEcommercePlatforms((platforms) => platforms.map((platform) => (
      platform.id === id ? { ...platform, active: !platform.active } : platform
    )));
  };

  return (
    <div className="space-y-8">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 sm:gap-6">
        <StatCard icon={Video} label="Total Reels" value="128" change="+12%" positive delay={0.05} />
        <StatCard icon={Eye} label="Total Views" value="1.2M" change="+24%" positive delay={0.1} />
        <StatCard icon={ShoppingCart} label="Orders (Affiliate)" value="568" change="+18%" positive delay={0.15} />
        <StatCard icon={DollarSign} label="Revenue" value="฿296.5K" change="+15%" positive delay={0.2} />
      </div>

      {/* E-commerce platforms are configured where their metrics are viewed. */}
      <motion.section initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <div className="mb-3">
          <h2 className="font-display text-lg font-semibold text-foreground">E-Commerce Platforms</h2>
          <p className="mt-1 text-sm text-muted-foreground">Choose the stores to include in your tracking dashboard.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {ecommercePlatforms.map((platform) => (
            <div key={platform.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
              <div className="flex items-center gap-3">
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-base ${platform.active ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted ring-1 ring-border"}`}>{platform.icon}</div>
                <div>
                  <p className="text-sm font-medium text-foreground">{platform.platform}</p>
                  <p className="text-xs text-muted-foreground">{platform.active ? "Included in tracking" : "Not included"}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleEcommercePlatform(platform.id)}
                className="rounded-md transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                aria-label={`${platform.active ? "Remove" : "Add"} ${platform.platform} from tracking`}
              >
                {platform.active ? <ToggleRight className="h-7 w-7 text-primary" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
              </button>
            </div>
          ))}
        </div>
      </motion.section>

      {/* E-commerce Tracking Summary */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {activeEcommerceData.map((shop, i) => (
            <motion.div key={shop.platform} initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-5 shadow-card card-shine hover:border-primary/20 transition-all"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{shop.platform}</p>
              <p className="mt-2 text-2xl font-bold text-foreground">฿{shop.revenue.toLocaleString()}</p>
              <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{shop.orders} orders</span>
                <span className="flex items-center gap-1"><MousePointerClick className="h-3 w-3" />CTR {shop.ctr}%</span>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Charts Section */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
        className="rounded-2xl border border-border bg-card p-6 shadow-card"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10">
              <BarChart3 className="h-4 w-4 text-info" />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground">Data Tracking</h2>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-muted p-1">
            {([
              { key: "social", label: "Social Media" },
              { key: "ecommerce", label: "E-Commerce" },
              { key: "platform", label: "Per Platform" },
            ] as const).map((tab) => (
              <button key={tab.key} onClick={() => setChartTab(tab.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  chartTab === tab.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >{tab.label}</button>
            ))}
          </div>
        </div>

        {/* Metric toggles for social tab */}
        {chartTab === "social" && (
          <div className="mt-4 flex items-center gap-2">
            {socialMetrics.map((m) => (
              <button key={m.key} onClick={() => setActiveMetrics(prev => prev.includes(m.key) ? prev.filter(k => k !== m.key) : [...prev, m.key])}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                  activeMetrics.includes(m.key) ? "ring-1 ring-border bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: m.color, opacity: activeMetrics.includes(m.key) ? 1 : 0.3 }} />
                {m.label}
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 h-72 sm:h-80">
          <ResponsiveContainer width="100%" height="100%">
            {chartTab === "social" ? (
              <AreaChart data={socialData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradClicks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--info))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--info))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradConv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", padding: "12px 16px" }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  formatter={(value: number) => [value.toLocaleString(), undefined]} />
                {activeMetrics.includes("views") && <Area type="monotone" dataKey="views" name="Views" stroke="hsl(var(--primary))" strokeWidth={2.5} fill="url(#gradViews)" dot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--card))" }} />}
                {activeMetrics.includes("clicks") && <Area type="monotone" dataKey="clicks" name="Clicks" stroke="hsl(var(--info))" strokeWidth={2.5} fill="url(#gradClicks)" dot={{ r: 4, fill: "hsl(var(--info))", strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--card))" }} />}
                {activeMetrics.includes("conversions") && <Area type="monotone" dataKey="conversions" name="Conversions" stroke="hsl(var(--success))" strokeWidth={2.5} fill="url(#gradConv)" dot={{ r: 4, fill: "hsl(var(--success))", strokeWidth: 0 }} activeDot={{ r: 6, strokeWidth: 2, stroke: "hsl(var(--card))" }} />}
              </AreaChart>
            ) : chartTab === "ecommerce" ? (
              <BarChart data={activeEcommerceData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="platform" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", padding: "12px 16px" }}
                  formatter={(value: number) => [value.toLocaleString(), undefined]} />
                <Bar dataKey="orders" name="Orders" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            ) : (
              <AreaChart data={platformEngagement} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(1)}K` : v} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "12px", padding: "12px 16px" }}
                  formatter={(value: number) => [value.toLocaleString(), undefined]} />
                <Area type="monotone" dataKey="youtube" name="YouTube" stroke="hsl(0, 70%, 50%)" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="tiktok" name="TikTok" stroke="hsl(var(--foreground))" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="facebook" name="Facebook" stroke="hsl(var(--info))" strokeWidth={2} fill="transparent" />
                <Area type="monotone" dataKey="instagram" name="Instagram" stroke="hsl(var(--accent))" strokeWidth={2} fill="transparent" />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      </motion.div>

    </div>
  );
};

export default Tracking;




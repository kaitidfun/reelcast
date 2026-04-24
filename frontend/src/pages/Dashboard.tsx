import { useState } from "react";
import { motion } from "framer-motion";
import { Video, Eye, Link2, TrendingUp, Play, Clock, BarChart3, ArrowRight, Sparkles, Zap, ShoppingCart, DollarSign, MousePointerClick } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/StatCard";
import { useNavigate } from "react-router-dom";
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
  { platform: "TikTok Shop", orders: 245, ctr: 4.2, revenue: 128500 },
  { platform: "Shopee", orders: 189, ctr: 3.8, revenue: 95200 },
  { platform: "Lazada", orders: 134, ctr: 3.1, revenue: 72800 },
];

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

const recentReels = [
  { id: 1, title: "Summer Collection Showcase", platform: "YouTube Shorts", status: "Published", views: "12.4K", date: "2 hours ago", emoji: "🏖️" },
  { id: 2, title: "New Arrival — Minimal Watch", platform: "TikTok", status: "Processing", views: "—", date: "5 hours ago", emoji: "⌚" },
  { id: 3, title: "Skincare Routine Bundle", platform: "Facebook", status: "Published", views: "8.2K", date: "1 day ago", emoji: "🧴" },
  { id: 4, title: "Tech Gadget Review", platform: "Instagram", status: "Draft", views: "—", date: "2 days ago", emoji: "📱" },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const [activeMetrics, setActiveMetrics] = useState<string[]>(["views", "clicks", "conversions"]);
  const [chartTab, setChartTab] = useState<"social" | "ecommerce" | "platform">("social");

  return (
    <div className="space-y-8">
      {/* Welcome Banner */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8"
      >
        <div className="absolute inset-0 gradient-glow opacity-60" />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-primary/5 blur-3xl" />
        <div className="relative z-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md gradient-primary">
                  <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">ReelCast Studio</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Hello, Welcome Back 👋</h1>
              <p className="mt-2 text-muted-foreground max-w-lg">Overview of your content, sales, and engagement across all platforms</p>
            </div>
            <Button onClick={() => navigate("/create")} className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto">
              <Sparkles className="h-4 w-4" />Create New Reel
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 sm:gap-6">
        <StatCard icon={Video} label="Total Reels" value="128" change="+12%" positive delay={0.05} />
        <StatCard icon={Eye} label="Total Views" value="1.2M" change="+24%" positive delay={0.1} />
        <StatCard icon={ShoppingCart} label="Orders (Affiliate)" value="568" change="+18%" positive delay={0.15} />
        <StatCard icon={DollarSign} label="Revenue" value="฿296.5K" change="+15%" positive delay={0.2} />
      </div>

      {/* E-commerce Tracking Summary */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {ecommerceData.map((shop, i) => (
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
              <BarChart data={ecommerceData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
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

      {/* Recent Reels */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
        className="rounded-2xl border border-border bg-card shadow-card overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Play className="h-4 w-4 text-primary" />
            </div>
            <h2 className="font-display text-lg font-semibold text-foreground">Recent Reels</h2>
          </div>
          <button className="flex items-center gap-1 text-sm font-medium text-primary hover:text-primary/80 transition-colors">
            View All<ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="divide-y divide-border">
          {recentReels.map((reel, i) => (
            <motion.div key={reel.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.45 + i * 0.05 }}
              className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4 transition-all duration-200 hover:bg-muted/40 cursor-pointer group"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted text-lg ring-1 ring-border group-hover:ring-primary/20">{reel.emoji}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">{reel.title}</p>
                <p className="text-xs text-muted-foreground">{reel.platform}</p>
              </div>
              <span className={`hidden sm:inline-block rounded-full px-3 py-1 text-xs font-medium ${
                reel.status === "Published" ? "bg-success/10 text-success ring-1 ring-success/20"
                : reel.status === "Processing" ? "bg-warning/10 text-warning ring-1 ring-warning/20"
                : "bg-muted text-muted-foreground ring-1 ring-border"
              }`}>{reel.status}</span>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" />{reel.views}</div>
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="h-3.5 w-3.5" />{reel.date}</div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;

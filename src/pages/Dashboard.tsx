import { motion } from "framer-motion";
import { Video, Eye, Link2, TrendingUp, Play, Clock, BarChart3, ArrowRight, Sparkles, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import StatCard from "@/components/StatCard";
import { useNavigate } from "react-router-dom";

const recentReels = [
  { id: 1, title: "Summer Collection Showcase", platform: "Instagram", status: "Published", views: "12.4K", date: "2 hours ago", emoji: "🏖️" },
  { id: 2, title: "New Arrival — Minimal Watch", platform: "Facebook", status: "Processing", views: "—", date: "5 hours ago", emoji: "⌚" },
  { id: 3, title: "Skincare Routine Bundle", platform: "Instagram", status: "Published", views: "8.2K", date: "1 day ago", emoji: "🧴" },
  { id: 4, title: "Tech Gadget Review", platform: "TikTok", status: "Draft", views: "—", date: "2 days ago", emoji: "📱" },
];

const Dashboard = () => {
  const navigate = useNavigate();

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
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-accent/5 blur-3xl" />
        <div className="relative z-10">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md gradient-primary">
                  <Zap className="h-3.5 w-3.5 text-primary-foreground" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-widest text-primary">ReelForge Studio</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
                สวัสดี, ยินดีต้อนรับกลับ 👋
              </h1>
              <p className="mt-2 text-muted-foreground max-w-lg">
                ภาพรวมคอนเทนต์และประสิทธิภาพของคุณวันนี้ เริ่มสร้าง Reel ใหม่ได้เลย
              </p>
            </div>
            <Button 
              onClick={() => navigate("/create")}
              className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto"
            >
              <Sparkles className="h-4 w-4" />
              Create New Reel
            </Button>
          </div>
        </div>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 sm:gap-6">
        <StatCard icon={Video} label="Total Reels" value="128" change="+12%" positive delay={0.05} />
        <StatCard icon={Eye} label="Total Views" value="1.2M" change="+24%" positive delay={0.1} />
        <StatCard icon={Link2} label="Link Clicks" value="45.8K" change="+8%" positive delay={0.15} />
        <StatCard icon={TrendingUp} label="Conversion Rate" value="3.2%" change="-0.4%" positive={false} delay={0.2} />
      </div>

      {/* Recent Reels */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
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
            View All
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="divide-y divide-border">
          {recentReels.map((reel, i) => (
            <motion.div
              key={reel.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.05 }}
              className="flex items-center gap-3 px-4 py-3.5 sm:gap-4 sm:px-6 sm:py-4 transition-all duration-200 hover:bg-muted/40 cursor-pointer group"
            >
              <div className="flex h-11 w-11 sm:h-12 sm:w-12 shrink-0 items-center justify-center rounded-xl bg-muted text-lg sm:text-xl ring-1 ring-border transition-all group-hover:ring-primary/20 group-hover:bg-primary/5">
                {reel.emoji}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">{reel.title}</p>
                <div className="flex items-center gap-2 sm:hidden mt-1">
                  <span className="text-xs text-muted-foreground">{reel.platform}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      reel.status === "Published"
                        ? "bg-success/10 text-success"
                        : reel.status === "Processing"
                        ? "bg-warning/10 text-warning"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {reel.status}
                  </span>
                </div>
                <p className="hidden sm:block text-xs text-muted-foreground">{reel.platform}</p>
              </div>
              <span
                className={`hidden sm:inline-block rounded-full px-3 py-1 text-xs font-medium ${
                  reel.status === "Published"
                    ? "bg-success/10 text-success ring-1 ring-success/20"
                    : reel.status === "Processing"
                    ? "bg-warning/10 text-warning ring-1 ring-warning/20"
                    : "bg-muted text-muted-foreground ring-1 ring-border"
                }`}
              >
                {reel.status}
              </span>
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Eye className="h-3.5 w-3.5" />
                {reel.views}
              </div>
              <div className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {reel.date}
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Performance Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-2xl border border-border bg-card p-6 shadow-card"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10">
            <BarChart3 className="h-4 w-4 text-info" />
          </div>
          <h2 className="font-display text-lg font-semibold text-foreground">Performance Overview</h2>
        </div>
        <div className="mt-6 flex h-52 items-center justify-center rounded-xl bg-muted/30 border border-border/50 dot-pattern">
          <div className="text-center">
            <BarChart3 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">กราฟแสดงผลประสิทธิภาพจะแสดงเมื่อเชื่อมต่อ Backend</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;

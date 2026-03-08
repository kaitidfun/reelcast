import { motion } from "framer-motion";
import { Video, Eye, Link2, TrendingUp, Play, Clock, BarChart3 } from "lucide-react";
import StatCard from "@/components/StatCard";

const recentReels = [
  { id: 1, title: "Summer Collection Showcase", platform: "Instagram", status: "Published", views: "12.4K", date: "2 hours ago" },
  { id: 2, title: "New Arrival — Minimal Watch", platform: "Facebook", status: "Processing", views: "—", date: "5 hours ago" },
  { id: 3, title: "Skincare Routine Bundle", platform: "Instagram", status: "Published", views: "8.2K", date: "1 day ago" },
  { id: 4, title: "Tech Gadget Review", platform: "TikTok", status: "Draft", views: "—", date: "2 days ago" },
];

const Dashboard = () => {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Dashboard</h1>
        <p className="mt-1 text-muted-foreground">ภาพรวมคอนเทนต์และประสิทธิภาพของคุณ</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Video} label="Total Reels" value="128" change="+12%" positive />
        <StatCard icon={Eye} label="Total Views" value="1.2M" change="+24%" positive />
        <StatCard icon={Link2} label="Link Clicks" value="45.8K" change="+8%" positive />
        <StatCard icon={TrendingUp} label="Conversion Rate" value="3.2%" change="-0.4%" positive={false} />
      </div>

      {/* Recent Reels */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="rounded-xl border border-border bg-card shadow-card"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="font-display text-lg font-semibold text-foreground">Recent Reels</h2>
          <button className="text-sm font-medium text-primary hover:underline">View All</button>
        </div>
        <div className="divide-y divide-border">
          {recentReels.map((reel) => (
            <div key={reel.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Play className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">{reel.title}</p>
                <p className="text-xs text-muted-foreground">{reel.platform}</p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  reel.status === "Published"
                    ? "bg-success/10 text-success"
                    : reel.status === "Processing"
                    ? "bg-warning/10 text-warning"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {reel.status}
              </span>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Eye className="h-3 w-3" />
                {reel.views}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {reel.date}
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Performance Chart Placeholder */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="rounded-xl border border-border bg-card p-6 shadow-card"
      >
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-primary" />
          <h2 className="font-display text-lg font-semibold text-foreground">Performance Overview</h2>
        </div>
        <div className="mt-6 flex h-48 items-center justify-center rounded-lg bg-muted/50">
          <p className="text-sm text-muted-foreground">กราฟแสดงผลประสิทธิภาพจะแสดงเมื่อเชื่อมต่อ Backend</p>
        </div>
      </motion.div>
    </div>
  );
};

export default Dashboard;

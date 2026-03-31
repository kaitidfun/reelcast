import { motion } from "framer-motion";
import { Send, CheckCircle2, Clock, Settings, ToggleLeft, ToggleRight, ArrowRight, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface Platform {
  id: string;
  name: string;
  icon: string;
  connected: boolean;
  reelsPosted: number;
  status: "connected" | "disconnected";
}

const initialPlatforms: Platform[] = [
  { id: "yt", name: "YouTube Shorts", icon: "🎬", connected: true, reelsPosted: 28, status: "connected" },
  { id: "tt", name: "TikTok", icon: "🎵", connected: true, reelsPosted: 15, status: "connected" },
  { id: "fb", name: "Facebook", icon: "📘", connected: true, reelsPosted: 22, status: "connected" },
  { id: "ig", name: "Instagram", icon: "📸", connected: false, reelsPosted: 0, status: "disconnected" },
];

const scheduledPosts = [
  { id: 1, title: "Summer Collection Promo", platforms: ["YouTube Shorts", "Facebook"], scheduledAt: "Mar 9, 2026 — 18:00", status: "scheduled" },
  { id: 2, title: "Watch Unboxing Reel", platforms: ["YouTube Shorts", "TikTok", "Instagram"], scheduledAt: "Mar 10, 2026 — 12:00", status: "scheduled" },
  { id: 3, title: "Skincare Bundle", platforms: ["TikTok", "Facebook"], scheduledAt: "Mar 8, 2026 — 09:00", status: "posted" },
  { id: 4, title: "Tech Gadget Review", platforms: ["YouTube Shorts", "TikTok", "Facebook", "Instagram"], scheduledAt: "Mar 11, 2026 — 15:00", status: "scheduled" },
];

const Distribution = () => {
  const [platforms, setPlatforms] = useState(initialPlatforms);

  const togglePlatform = (id: string) => {
    setPlatforms((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, connected: !p.connected, status: p.connected ? "disconnected" : "connected" } : p
      )
    );
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Distribution</h1>
        <p className="mt-1 text-muted-foreground">เผยแพร่ Reel อัตโนมัติไปยัง YouTube Shorts, TikTok, Facebook และ Instagram</p>
      </div>

      {/* Platform Connections */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Wifi className="h-4 w-4 text-primary" />
          <h2 className="font-display text-lg font-semibold text-foreground">Connected Platforms</h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {platforms.map((platform, i) => (
            <motion.div
              key={platform.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`group rounded-2xl border p-5 transition-all duration-300 card-shine ${
                platform.connected
                  ? "border-primary/30 bg-card shadow-glow hover:shadow-glow-lg"
                  : "border-border bg-card hover:border-muted-foreground/20"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl transition-all ${
                    platform.connected ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted ring-1 ring-border"
                  }`}>
                    {platform.icon}
                  </div>
                  <div>
                    <h3 className="font-display text-sm font-semibold text-foreground">{platform.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {platform.connected ? (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-success" />
                          {platform.reelsPosted} Reels posted
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <WifiOff className="h-3 w-3" />
                          Not connected
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => togglePlatform(platform.id)}
                  className="text-muted-foreground transition-transform hover:scale-110"
                >
                  {platform.connected ? (
                    <ToggleRight className="h-7 w-7 text-primary" />
                  ) : (
                    <ToggleLeft className="h-7 w-7" />
                  )}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Scheduled Posts */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-info" />
            <h2 className="font-display text-lg font-semibold text-foreground">Scheduled Posts</h2>
          </div>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Auto-Schedule</span>
          </Button>
        </div>
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="divide-y divide-border">
            {scheduledPosts.map((post, i) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.05 }}
                className="flex flex-col gap-2 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4 transition-all duration-200 hover:bg-muted/30 cursor-pointer group"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                    post.status === "posted" ? "bg-success/10 ring-1 ring-success/20" : "bg-info/10 ring-1 ring-info/20"
                  }`}>
                    <Send className={`h-4 w-4 ${post.status === "posted" ? "text-success" : "text-info"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">{post.title}</p>
                    <p className="text-xs text-muted-foreground">{post.platforms.join(", ")}</p>
                  </div>
                  <span
                    className={`sm:hidden shrink-0 rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                      post.status === "posted"
                        ? "bg-success/10 text-success ring-success/20"
                        : "bg-info/10 text-info ring-info/20"
                    }`}
                  >
                    {post.status === "posted" ? "Posted" : "Scheduled"}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:ml-auto sm:gap-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {post.scheduledAt}
                  </div>
                  <span
                    className={`hidden sm:inline-block rounded-full px-3 py-1 text-xs font-medium ring-1 ${
                      post.status === "posted"
                        ? "bg-success/10 text-success ring-success/20"
                        : "bg-info/10 text-info ring-info/20"
                    }`}
                  >
                    {post.status === "posted" ? "Posted" : "Scheduled"}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block" />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Distribution;

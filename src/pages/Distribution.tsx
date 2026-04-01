import { motion } from "framer-motion";
import { Send, Clock, Settings, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const scheduledPosts = [
  { id: 1, title: "Summer Collection Promo", platforms: ["YouTube Shorts", "Facebook"], scheduledAt: "Mar 9, 2026 — 18:00", status: "scheduled" },
  { id: 2, title: "Watch Unboxing Reel", platforms: ["YouTube Shorts", "TikTok", "Instagram"], scheduledAt: "Mar 10, 2026 — 12:00", status: "scheduled" },
  { id: 3, title: "Skincare Bundle", platforms: ["TikTok", "Facebook"], scheduledAt: "Mar 8, 2026 — 09:00", status: "posted" },
  { id: 4, title: "Tech Gadget Review", platforms: ["YouTube Shorts", "TikTok", "Facebook", "Instagram"], scheduledAt: "Mar 11, 2026 — 15:00", status: "scheduled" },
];

const Distribution = () => {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Distribution</h1>
        <p className="mt-1 text-muted-foreground">Automatically distribute Reels to YouTube Shorts, TikTok, Facebook, and Instagram</p>
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
"use client";

import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Search, Plus, Play, Folder, ChevronRight } from "lucide-react";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { useAuth } from "@/contexts/AuthContext";

const recentVideos = [
  { title: "Summer Drop", tag: "Fashion" },
  { title: "Watch Reveal", tag: "Lifestyle" },
  { title: "Skin Routine", tag: "Beauty" },
  { title: "Tech Review", tag: "Gadgets" },
];

const campaigns = [
  { name: "Summer Sale 2026", meta: "12 reels · 3 platforms" },
  { name: "New Arrivals Q2", meta: "8 reels · 2 platforms" },
  { name: "Affiliate Boost", meta: "5 reels · 4 platforms" },
];

const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};

export default function Home() {
  const router = useRouter();
  const { user } = useAuth();
  const firstName = user?.displayName?.split(" ")[0] ?? "Creator";

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.4 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            Welcome back, {firstName}!
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Here's what's happening in your studio today.</p>
        </div>
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search videos, products, campaigns…"
            className="w-full rounded-full border border-border bg-card pl-11 pr-5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
          />
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        {...fadeUp}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <button
          onClick={() => router.push("/create")}
          className="group relative overflow-hidden rounded-2xl border-gradient bg-card p-8 min-h-[160px] flex flex-col items-center justify-center gap-3 transition-all duration-300 hover:shadow-glow-lg hover:scale-[1.01]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow transition-transform duration-300 group-hover:scale-110">
            <Plus className="h-7 w-7 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold text-foreground">Create new video</span>
          <span className="text-xs text-muted-foreground">Generate a Reel with AI</span>
        </button>

        <button
          onClick={() => router.push("/library")}
          className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 min-h-[160px] flex flex-col items-center justify-center gap-3 transition-all duration-300 hover:border-primary/40 hover:shadow-card hover:scale-[1.01]"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary transition-transform duration-300 group-hover:scale-110">
            <Plus className="h-7 w-7 text-secondary-foreground" />
          </div>
          <span className="font-display text-lg font-semibold text-foreground">Create new product</span>
          <span className="text-xs text-muted-foreground">Add to your product library</span>
        </button>
      </motion.div>

      {/* Recent Videos */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.2 }} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Recent Videos</h2>
          <button className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            View all
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {recentVideos.map((v) => (
            <div
              key={v.title}
              className="group cursor-pointer overflow-hidden rounded-2xl border border-border bg-card transition-all duration-300 hover:scale-[1.02] hover:ring-2 hover:ring-primary/40"
            >
              <AspectRatio ratio={9 / 16}>
                <div className="relative h-full w-full bg-gradient-to-br from-muted to-card flex items-center justify-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-card/60 backdrop-blur transition-transform duration-300 group-hover:scale-110">
                    <Play className="h-5 w-5 text-foreground fill-foreground" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/90 to-transparent p-3">
                    <p className="text-xs font-semibold text-foreground truncate">{v.title}</p>
                    <p className="text-[10px] text-muted-foreground">{v.tag}</p>
                  </div>
                </div>
              </AspectRatio>
            </div>
          ))}
        </div>
      </motion.section>

      {/* Campaigns */}
      <motion.section {...fadeUp} transition={{ duration: 0.4, delay: 0.3 }} className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-foreground">Campaigns</h2>
        <div className="space-y-3">
          {campaigns.map((c) => (
            <button
              key={c.name}
              className="group w-full flex items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left transition-all duration-200 hover:border-primary/40 hover:shadow-card"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-glow shrink-0">
                <Folder className="h-5 w-5 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-display text-sm font-semibold text-foreground truncate">{c.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{c.meta}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
            </button>
          ))}
        </div>
      </motion.section>

      {/* Footer */}
      <footer className="pt-12 pb-4 text-center">
        <p className="text-xs text-muted-foreground/60">Copyright © ReelCast</p>
      </footer>
    </div>
  );
}
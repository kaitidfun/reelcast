import { motion } from "framer-motion";
import { Video, Eye, Clock, MoreVertical, Search, Filter, Grid, List } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";

const mockReels = [
  { id: 1, title: "Summer Collection Promo", status: "Published", platform: "Instagram", views: "12.4K", date: "Mar 6, 2026", thumbnail: "🏖️" },
  { id: 2, title: "Minimal Watch Unboxing", status: "Published", platform: "Facebook", views: "8.2K", date: "Mar 5, 2026", thumbnail: "⌚" },
  { id: 3, title: "Skincare Bundle Review", status: "Draft", platform: "—", views: "—", date: "Mar 4, 2026", thumbnail: "🧴" },
  { id: 4, title: "Tech Gadget Showcase", status: "Processing", platform: "TikTok", views: "—", date: "Mar 3, 2026", thumbnail: "📱" },
  { id: 5, title: "Fashion Lookbook SS26", status: "Published", platform: "Instagram", views: "24.1K", date: "Mar 2, 2026", thumbnail: "👗" },
  { id: 6, title: "Home Decor Ideas", status: "Published", platform: "Facebook", views: "5.7K", date: "Mar 1, 2026", thumbnail: "🏠" },
];

const ContentLibrary = () => {
  const [view, setView] = useState<"grid" | "list">("grid");

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Content Library</h1>
          <p className="mt-1 text-muted-foreground">จัดการ Reel ทั้งหมดของคุณ</p>
        </div>
        <Button className="gradient-primary gap-2 text-primary-foreground shadow-glow">
          <Video className="h-4 w-4" />
          Create New
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ค้นหา Reel..." className="bg-card pl-10" />
        </div>
        <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
        <div className="flex rounded-lg border border-border">
          <button onClick={() => setView("grid")} className={`p-2 ${view === "grid" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
            <Grid className="h-4 w-4" />
          </button>
          <button onClick={() => setView("list")} className={`p-2 ${view === "list" ? "bg-muted text-foreground" : "text-muted-foreground"}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {mockReels.map((reel, i) => (
            <motion.div
              key={reel.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group rounded-xl border border-border bg-card shadow-card transition-all hover:border-primary/30 hover:shadow-glow"
            >
              <div className="flex aspect-video items-center justify-center rounded-t-xl bg-muted text-4xl">
                {reel.thumbnail}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-medium text-foreground">{reel.title}</h3>
                  <button className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${
                    reel.status === "Published" ? "bg-success/10 text-success"
                    : reel.status === "Processing" ? "bg-warning/10 text-warning"
                    : "bg-muted text-muted-foreground"
                  }`}>{reel.status}</span>
                  <span>{reel.platform}</span>
                  {reel.views !== "—" && (
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{reel.views}</span>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card shadow-card">
          <div className="divide-y divide-border">
            {mockReels.map((reel) => (
              <div key={reel.id} className="flex items-center gap-4 px-6 py-4 transition-colors hover:bg-muted/50">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl">{reel.thumbnail}</div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{reel.title}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  reel.status === "Published" ? "bg-success/10 text-success"
                  : reel.status === "Processing" ? "bg-warning/10 text-warning"
                  : "bg-muted text-muted-foreground"
                }`}>{reel.status}</span>
                <span className="text-xs text-muted-foreground">{reel.platform}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3 w-3" />{reel.views}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{reel.date}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentLibrary;

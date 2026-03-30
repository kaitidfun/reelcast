import { motion } from "framer-motion";
import { Package, Eye, Clock, MoreVertical, Search, Filter, Grid, List, Play, FolderOpen, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Product {
  id: number;
  title: string;
  campaign: string;
  status: "Active" | "Draft" | "Archived";
  reelsGenerated: number;
  affiliateLink: string;
  date: string;
  thumbnail: string;
}

const mockProducts: Product[] = [
  { id: 1, title: "Summer Dress Collection", campaign: "Summer Sale 2026", status: "Active", reelsGenerated: 5, affiliateLink: "reel.link/summer01", date: "Mar 6, 2026", thumbnail: "🏖️" },
  { id: 2, title: "Minimal Watch — Gold", campaign: "Accessories Launch", status: "Active", reelsGenerated: 3, affiliateLink: "reel.link/watch01", date: "Mar 5, 2026", thumbnail: "⌚" },
  { id: 3, title: "Skincare Bundle Set", campaign: "Beauty Week", status: "Draft", reelsGenerated: 0, affiliateLink: "—", date: "Mar 4, 2026", thumbnail: "🧴" },
  { id: 4, title: "Wireless Earbuds Pro", campaign: "Tech Deals", status: "Active", reelsGenerated: 8, affiliateLink: "reel.link/tech01", date: "Mar 3, 2026", thumbnail: "🎧" },
  { id: 5, title: "Fashion Lookbook SS26", campaign: "Summer Sale 2026", status: "Active", reelsGenerated: 12, affiliateLink: "reel.link/fashion01", date: "Mar 2, 2026", thumbnail: "👗" },
  { id: 6, title: "Home Decor Candle Set", campaign: "Home & Living", status: "Archived", reelsGenerated: 2, affiliateLink: "reel.link/home01", date: "Mar 1, 2026", thumbnail: "🕯️" },
];

const campaigns = [...new Set(mockProducts.map((p) => p.campaign))];

const ContentLibrary = () => {
  const [view, setView] = useState<"grid" | "list">("grid");
  const navigate = useNavigate();

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Product Library</h1>
          <p className="mt-1 text-muted-foreground">จัดการสินค้าตามแคมเปญ เชื่อมลิงก์ Affiliate และติดตามผล Reel</p>
        </div>
        <Button onClick={() => navigate("/create")} className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {/* Campaign Tags */}
      <div className="flex items-center gap-2 flex-wrap">
        <button className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary ring-1 ring-primary/20">
          All ({mockProducts.length})
        </button>
        {campaigns.map((c) => (
          <button key={c} className="rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground ring-1 ring-border hover:text-foreground hover:ring-primary/20 transition-colors">
            <FolderOpen className="inline h-3 w-3 mr-1" />
            {c} ({mockProducts.filter((p) => p.campaign === c).length})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ค้นหาสินค้า..." className="bg-card pl-10 border-border h-10" />
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0"><Filter className="h-4 w-4" /></Button>
        <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
          <button onClick={() => setView("grid")} className={`p-2.5 transition-colors ${view === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <Grid className="h-4 w-4" />
          </button>
          <button onClick={() => setView("list")} className={`p-2.5 transition-colors ${view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mockProducts.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group rounded-2xl border border-border bg-card shadow-card card-shine transition-all duration-300 hover:border-primary/20 hover:shadow-elevated cursor-pointer overflow-hidden"
            >
              <div className="relative flex aspect-video items-center justify-center bg-muted text-4xl">
                {product.thumbnail}
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full gradient-primary shadow-glow">
                    <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">{product.title}</h3>
                  <button className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  {product.campaign}
                </p>
                <div className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap">
                  <span className={`rounded-full px-2.5 py-0.5 font-medium ring-1 ${
                    product.status === "Active" ? "bg-success/10 text-success ring-success/20"
                    : product.status === "Draft" ? "bg-warning/10 text-warning ring-warning/20"
                    : "bg-muted text-muted-foreground ring-border"
                  }`}>{product.status}</span>
                  <span className="flex items-center gap-1">
                    <Package className="h-3 w-3" />
                    {product.reelsGenerated} Reels
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="divide-y divide-border">
            {mockProducts.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-5 py-4 sm:px-6 transition-colors hover:bg-muted/40 cursor-pointer group"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-xl ring-1 ring-border group-hover:ring-primary/20 transition-all">{product.thumbnail}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{product.title}</p>
                  <p className="text-xs text-muted-foreground">{product.campaign}</p>
                </div>
                <span className={`hidden sm:inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                  product.status === "Active" ? "bg-success/10 text-success ring-success/20"
                  : product.status === "Draft" ? "bg-warning/10 text-warning ring-warning/20"
                  : "bg-muted text-muted-foreground ring-border"
                }`}>{product.status}</span>
                <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"><Package className="h-3 w-3" />{product.reelsGenerated} Reels</span>
                <span className="hidden md:block text-xs text-muted-foreground">{product.affiliateLink}</span>
                <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{product.date}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentLibrary;

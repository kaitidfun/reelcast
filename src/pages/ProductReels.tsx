import { motion } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Heart,
  Eye,
  Play,
  Clock,
  Search,
  LayoutGrid,
  List,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  getMockReelsForProduct,
  platformLabel,
  platformEmoji,
  formatCount,
  type ReelPlatform,
} from "@/lib/mockReels";

// Mirror of the product summary used by the campaign library — kept inline here
// because the demo uses local mock state. In a real app this would come from a
// shared store / API.
const PRODUCT_LOOKUP: Record<string, { name: string; thumbnail: string; reelsGenerated: number; campaignId: string; campaignName: string }> = {
  p1: { name: "Summer Dress Collection", thumbnail: "🏖️", reelsGenerated: 5, campaignId: "summer-2026", campaignName: "Summer Sale 2026" },
  p2: { name: "Fashion Lookbook SS26", thumbnail: "👗", reelsGenerated: 4, campaignId: "summer-2026", campaignName: "Summer Sale 2026" },
  p3: { name: "Beach Tote Bag", thumbnail: "👜", reelsGenerated: 3, campaignId: "summer-2026", campaignName: "Summer Sale 2026" },
  p4: { name: "Minimal Watch — Gold", thumbnail: "⌚", reelsGenerated: 3, campaignId: "accessories", campaignName: "Accessories Launch" },
  p5: { name: "Leather Wallet Slim", thumbnail: "👛", reelsGenerated: 2, campaignId: "accessories", campaignName: "Accessories Launch" },
  p6: { name: "Sunglasses Aviator", thumbnail: "🕶️", reelsGenerated: 2, campaignId: "accessories", campaignName: "Accessories Launch" },
  p7: { name: "Skincare Bundle Set", thumbnail: "🧴", reelsGenerated: 2, campaignId: "beauty-week", campaignName: "Beauty Week" },
  p8: { name: "Lip Tint Trio", thumbnail: "💄", reelsGenerated: 3, campaignId: "beauty-week", campaignName: "Beauty Week" },
  p9: { name: "Wireless Earbuds Pro", thumbnail: "🎧", reelsGenerated: 4, campaignId: "tech-deals", campaignName: "Tech Deals" },
  p10: { name: "Portable Charger 20K", thumbnail: "🔋", reelsGenerated: 3, campaignId: "tech-deals", campaignName: "Tech Deals" },
  p11: { name: "Smart Desk Lamp", thumbnail: "💡", reelsGenerated: 2, campaignId: "tech-deals", campaignName: "Tech Deals" },
};

const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${r.toString().padStart(2, "0")}` : `0:${r.toString().padStart(2, "0")}`;
};

const ProductReels = () => {
  const { productId = "" } = useParams();
  const navigate = useNavigate();
  const product = PRODUCT_LOOKUP[productId];

  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<"all" | ReelPlatform>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "Published" | "Scheduled" | "Draft">("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const reels = useMemo(() => {
    if (!product) return [];
    return getMockReelsForProduct(productId, product.name, product.reelsGenerated);
  }, [productId, product]);

  const filteredReels = useMemo(() => {
    const q = search.toLowerCase();
    return reels.filter((r) => {
      const matchesSearch = !q || r.title.toLowerCase().includes(q);
      const matchesPlatform = platformFilter === "all" || r.platform === platformFilter;
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesSearch && matchesPlatform && matchesStatus;
    });
  }, [reels, search, platformFilter, statusFilter]);

  if (!product) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          Product not found.
        </div>
      </div>
    );
  }

  const handleCreateReel = () => {
    navigate("/create", {
      state: {
        productId,
        productName: product.name,
        campaignId: product.campaignId,
      },
    });
  };

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              onClick={() => navigate(`/library?campaign=${product.campaignId}`)}
              className="cursor-pointer"
            >
              {product.campaignName}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{product.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-4xl ring-1 ring-border">
            {product.thumbnail}
          </div>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
              {product.name}
            </h1>
            <p className="mt-1 text-muted-foreground">
              {reels.length} reel{reels.length === 1 ? "" : "s"} generated from this product
            </p>
          </div>
        </div>
        <Button
          onClick={handleCreateReel}
          className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto"
        >
          <Sparkles className="h-4 w-4" />
          Create Reel
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reels…"
            className="bg-card pl-10 border-border h-10"
          />
        </div>
        <Select value={platformFilter} onValueChange={(v) => setPlatformFilter(v as typeof platformFilter)}>
          <SelectTrigger className="w-full sm:w-[170px] bg-card h-10">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="youtube">YouTube Shorts</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[160px] bg-card h-10">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Published">Published</SelectItem>
            <SelectItem value="Scheduled">Scheduled</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as "grid" | "list")}
          className="bg-card border border-border rounded-lg p-0.5 h-10"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9 rounded-md data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <LayoutGrid className="!h-5 !w-5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view" className="h-9 w-9 rounded-md data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <List className="!h-5 !w-5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Reels grid / list */}
      {filteredReels.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          No reels match your filters.
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {filteredReels.map((reel, i) => (
            <motion.div
              key={reel.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="group rounded-2xl border border-border bg-card overflow-hidden card-shine hover:border-primary/30 hover:shadow-elevated transition-all duration-300 cursor-pointer"
            >
              <div
                className={`relative aspect-[9/16] bg-gradient-to-br ${reel.gradient} flex items-center justify-center text-6xl`}
              >
                <span className="drop-shadow-lg">{reel.thumbnail}</span>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute top-2 left-2">
                  <Badge variant="outline" className="bg-background/70 backdrop-blur border-border/50 text-foreground text-[10px] gap-1">
                    <span>{platformEmoji[reel.platform]}</span>
                    {platformLabel[reel.platform]}
                  </Badge>
                </div>
                <div className="absolute top-2 right-2">
                  <Badge
                    variant="outline"
                    className={
                      "text-[10px] " +
                      (reel.status === "Published"
                        ? "bg-success/15 text-success border-success/30"
                        : reel.status === "Scheduled"
                        ? "bg-primary/15 text-primary border-primary/30"
                        : "bg-warning/15 text-warning border-warning/30")
                    }
                  >
                    {reel.status}
                  </Badge>
                </div>
                <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-background/70 backdrop-blur px-2 py-0.5 text-[10px] text-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDuration(reel.durationSec)}
                </div>
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="h-12 w-12 rounded-full bg-background/80 backdrop-blur flex items-center justify-center">
                    <Play className="h-5 w-5 text-foreground fill-foreground ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="p-3 space-y-2">
                <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem]">
                  {reel.title}
                </h3>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {formatCount(reel.views)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    {formatCount(reel.likes)}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
          {filteredReels.map((reel, i) => (
            <motion.div
              key={reel.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div
                className={`relative h-16 w-12 shrink-0 rounded-lg bg-gradient-to-br ${reel.gradient} flex items-center justify-center text-2xl`}
              >
                {reel.thumbnail}
                <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-black/40 to-transparent" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">{reel.title}</h3>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span>{platformEmoji[reel.platform]} {platformLabel[reel.platform]}</span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(reel.durationSec)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" />
                    {formatCount(reel.views)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Heart className="h-3 w-3" />
                    {formatCount(reel.likes)}
                  </span>
                </div>
              </div>
              <Badge
                variant="outline"
                className={
                  reel.status === "Published"
                    ? "bg-success/15 text-success border-success/30"
                    : reel.status === "Scheduled"
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-warning/15 text-warning border-warning/30"
                }
              >
                {reel.status}
              </Badge>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProductReels;

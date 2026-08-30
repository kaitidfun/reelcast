"use client";

import { motion } from "framer-motion";
import {
  ArrowLeft,
  Sparkles,
  Package,
  Clock,
  Search,
  LayoutGrid,
  List,
  Film,
} from "lucide-react";
import { useMemo, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, useParams, usePathname } from "next/navigation";
import Link from "next/link";
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
import { useReels } from "@/hooks/useReels";
import { ReelCard } from "@/components/ReelCard";
import { REEL_STATUS_BADGE } from "@/lib/reel-status";

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
};

const ProductReels = () => {
  const { productId = "" } = useParams();
  const id = Array.isArray(productId) ? productId[0] : productId;
  const router = useRouter();

  const [product, setProduct] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { reels, loading: reelsLoading, reload: reloadReels } = useReels({ productId: id });

  const fetchProduct = useCallback(async () => {
    try {
      const token = localStorage.getItem("rf_token");
      if (!token) return;
      const res = await fetch(`http://localhost:8000/api/products/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const p = await res.json();
        const primaryImage = p.images?.find((img: any) => img.is_primary)?.image_url || p.images?.[0]?.image_url;
        setProduct({
            id: p.product_id,
            name: p.product_name,
            keyPoints: p.description || "",
            affiliateLink: p.affiliate_link || "",
            status: "Active",
            thumbnail: primaryImage ? `http://localhost:8000/api/upload/images/${primaryImage}` : (p.brand_logo_url ? `http://localhost:8000/api/upload/images/${p.brand_logo_url}` : null),
            reelsGenerated: p.reel_count ?? 0,
            campaignId: p.campaign_id,
            campaignName: "Campaign" // Could fetch campaign if needed
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchProduct();
  }, [fetchProduct]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<"grid" | "list">("grid");

  const filteredReels = useMemo(() => {
    const q = search.toLowerCase();
    return reels.filter((r) => {
      const matchesSearch = !q || r.title.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [reels, search, statusFilter]);

  if (loading) {
    return <div className="p-12 text-center text-muted-foreground">Loading...</div>;
  }
  if (!product) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" onClick={() => router.back()} className="gap-2">
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
    router.push(`/create?productId=${encodeURIComponent(id)}&productName=${encodeURIComponent(product.name)}&campaignId=${encodeURIComponent(product.campaignId || "")}`);
  };

  const handleOpenReel = (reelId: string) => {
    router.push(`/create?reelId=${encodeURIComponent(reelId)}&productId=${encodeURIComponent(id)}&productName=${encodeURIComponent(product.name)}&campaignId=${encodeURIComponent(product.campaignId || "")}`);
  };

  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              onClick={() => router.push(`/library?campaign=${product.campaignId}`)}
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
            {product.thumbnail ? <img src={product.thumbnail} alt={product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="h-10 w-10 text-muted-foreground/30" />}
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
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[160px] bg-card h-10">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Generating">Generating</SelectItem>
            <SelectItem value="Pending">Pending</SelectItem>
            <SelectItem value="Failed">Failed</SelectItem>
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
            >
              <ReelCard reel={reel} onClick={() => handleOpenReel(reel.id)} onChanged={reloadReels} />
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
              onClick={() => handleOpenReel(reel.id)}
              className="flex items-center gap-4 p-4 hover:bg-muted/30 transition-colors cursor-pointer"
            >
              <div className="relative h-16 w-12 shrink-0 rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                {reel.thumbnail ? (
                  <img src={reel.thumbnail} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Film className="h-5 w-5 text-muted-foreground/30" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-foreground truncate">{reel.title}</h3>
                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {formatDate(reel.createdAt)}
                </div>
              </div>
              <Badge
                variant="outline"
                className={REEL_STATUS_BADGE[reel.status] ?? "bg-muted text-muted-foreground border-border"}
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







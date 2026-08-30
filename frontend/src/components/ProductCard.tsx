"use client";

import { motion } from "framer-motion";
import { Package, Video, Plus, Clock, Edit, Link2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ProductCardData = {
  id: string;
  name: string;
  keyPoints: string;
  thumbnail: string | null;
  status: "Active" | "Draft";
  reelsGenerated: number;
  affiliateLink?: string | null;
  createdAt: string;
  updatedAt: string;
};

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  } catch {
    return "—";
  }
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

type Props = {
  product: ProductCardData;
  onClick: () => void;
  index?: number;
  // Optional — omit any of these to hide that action (e.g. a read-only
  // browsing context like the Distribute page's drill-down, which has no
  // product-editing capability of its own).
  onEdit?: (e: React.MouseEvent) => void;
  onCopyLink?: () => void;
  onCreateReel?: () => void;
};

export function ProductCard({ product, onClick, index = 0, onEdit, onCopyLink, onCreateReel }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={onClick}
      className="rounded-2xl border border-border bg-card overflow-hidden card-shine hover:border-primary/30 hover:shadow-elevated transition-all duration-300 cursor-pointer"
    >
      <div className="aspect-video bg-muted flex items-center justify-center text-5xl relative group/img">
        {product.thumbnail ? (
          <img src={product.thumbnail} alt={product.name} className="h-full w-full object-cover rounded-lg" />
        ) : (
          <Package className="h-10 w-10 text-muted-foreground/30" />
        )}
        <Badge
          variant="outline"
          className={
            "absolute top-3 right-3 " +
            (product.status === "Active"
              ? "bg-success/15 text-success border-success/30"
              : "bg-warning/15 text-warning border-warning/30")
          }
        >
          {product.status}
        </Badge>
        <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-background/70 backdrop-blur px-2 py-1 text-xs text-foreground">
          <Video className="h-3 w-3" />
          {product.reelsGenerated} reels
        </div>
        {onEdit && (
          <Button
            variant="secondary"
            size="icon"
            onClick={(e) => { e.stopPropagation(); onEdit(e); }}
            className="absolute bottom-3 right-3 h-8 w-8 bg-background/70 backdrop-blur hover:bg-background opacity-0 group-hover/img:opacity-100 transition-opacity"
            title="Edit product"
          >
            <Edit className="h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="p-4 space-y-3">
        <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
        <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
          {product.keyPoints}
        </p>

        {(onCopyLink || onCreateReel) && (
          <div className="flex items-center justify-between gap-2 pt-2">
            {onCopyLink && (
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => { e.stopPropagation(); onCopyLink(); }}
                disabled={!product.affiliateLink}
                title="Copy link"
                className="h-8 w-8 text-primary"
              >
                <Link2 className="h-4 w-4" />
              </Button>
            )}
            {onCreateReel && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onCreateReel(); }}
                className="gradient-primary gap-1.5 text-primary-foreground shadow-glow hover:shadow-glow-lg"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Create Reel
              </Button>
            )}
          </div>
        )}

        <div className="pt-2 border-t border-border/50 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
          <span className="flex items-center gap-1" title={`Created ${formatDateTime(product.createdAt)}`}>
            <Plus className="h-3 w-3" />
            {formatDate(product.createdAt)}
          </span>
          <span className="flex items-center gap-1" title={`Updated ${formatDateTime(product.updatedAt)}`}>
            <Clock className="h-3 w-3" />
            {formatDate(product.updatedAt)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

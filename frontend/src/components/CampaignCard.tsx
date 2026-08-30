"use client";

import { motion } from "framer-motion";
import { Package, Video, Clock, Plus, ChevronRight } from "lucide-react";
import { getBannerGradient } from "@/app/(main)/create/_hooks/useProductLibrary";
import type { CampaignCardData } from "@/hooks/useCampaigns";

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

export function CampaignCard({ campaign, onClick, index = 0 }: { campaign: CampaignCardData; onClick: () => void; index?: number }) {
  const previewProducts = campaign.products.slice(0, 4);
  const overflow = Math.max(0, campaign.products.length - 4);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      onClick={onClick}
      className="group relative rounded-2xl border border-border bg-card overflow-hidden card-shine cursor-pointer transition-all duration-300 hover:border-primary/30 hover:shadow-elevated"
    >
      {/* Banner */}
      <div
        className={`relative h-28 overflow-hidden ${campaign.bannerImage ? "" : `bg-gradient-to-br ${getBannerGradient(campaign.bannerColor)}`}`}
        style={campaign.bannerImage ? { backgroundImage: `url(${campaign.bannerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
        {campaign.bannerImage && <div className="absolute inset-0 bg-black/30" />}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
            {campaign.name}
          </h3>
          <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-1" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
          {campaign.description}
        </p>

        {/* Mini product thumbnails grid */}
        <div className="grid grid-cols-4 gap-1.5 mt-4">
          {Array.from({ length: 4 }).map((_, idx) => {
            const product = previewProducts[idx];
            const showOverflow = idx === 3 && overflow > 0;
            if (showOverflow) {
              return (
                <div key={idx} className="h-12 rounded-lg bg-muted ring-1 ring-border flex items-center justify-center text-xs font-semibold text-muted-foreground">
                  +{overflow + 1}
                </div>
              );
            }
            if (product) {
              return (
                <div key={idx} className="h-12 rounded-lg bg-muted ring-1 ring-border flex items-center justify-center text-xl">
                  {product.thumbnail ? <img src={product.thumbnail} alt={product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="h-10 w-10 text-muted-foreground/30" />}
                </div>
              );
            }
            return <div key={idx} className="h-12 rounded-lg border border-dashed border-border/60" />;
          })}
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5" />
            {campaign.products.length} Products
          </span>
          <span className="flex items-center gap-1.5">
            <Video className="h-3.5 w-3.5" />
            {campaign.reelsCount} Reels
          </span>
        </div>
        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
          <span className="flex items-center gap-1" title={`Created ${formatDateTime(campaign.createdAt)}`}>
            <Plus className="h-3 w-3" />
            {formatDate(campaign.createdAt)}
          </span>
          <span className="flex items-center gap-1" title={`Updated ${formatDateTime(campaign.updatedAt)}`}>
            <Clock className="h-3 w-3" />
            {formatDate(campaign.updatedAt)}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

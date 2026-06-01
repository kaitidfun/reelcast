"use client";

import { useState } from "react";
import { FolderOpen, Folder, ChevronLeft } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { LibraryCampaign, LibraryProduct } from "../_types";
import { getBannerGradient } from "../_hooks/useProductLibrary";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productLibrary: LibraryCampaign[];
  onSelect: (product: LibraryProduct) => void;
  selectedProductId?: string | null;
};

export function ProductPickerDialog({
  open,
  onOpenChange,
  productLibrary,
  onSelect,
  selectedProductId,
}: Props) {
  const [view, setView] = useState<"campaigns" | "products">("campaigns");
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);

  const activeCampaign = productLibrary.find((c) => c.id === activeCampaignId) ?? null;

  const handleOpen = (next: boolean) => {
    if (next) {
      setView("campaigns");
      setActiveCampaignId(null);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <FolderOpen className="h-5 w-5 text-primary" />
            Select Product
          </DialogTitle>
          <DialogDescription>
            {view === "campaigns"
              ? "Pick a campaign folder to browse its products."
              : "Choose a product to feature in this Reel."}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto -mx-6 px-6 pb-1">
          {view === "campaigns" && (
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Browse Campaigns
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {productLibrary.map((campaign) => (
                  <button
                    key={campaign.id}
                    type="button"
                    onClick={() => { setActiveCampaignId(campaign.id); setView("products"); }}
                    className="group rounded-lg border border-border bg-card overflow-hidden text-left cursor-pointer transition-all hover:ring-2 hover:ring-primary hover:-translate-y-0.5 hover:shadow-glow"
                  >
                    <div className={`h-24 w-full relative overflow-hidden ${!campaign.bannerUrl ? `bg-gradient-to-br ${getBannerGradient(campaign.bannerColor)}` : "bg-muted"}`}>
                      {campaign.bannerUrl ? (
                        <img
                          src={campaign.bannerUrl}
                          alt={campaign.name}
                          className="absolute inset-0 h-full w-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      ) : (
                        <div className="h-full flex items-center justify-center">
                          <span className="text-3xl font-bold text-white/80 drop-shadow-sm select-none">
                            {campaign.name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-3 space-y-1">
                      <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">
                        {campaign.name}
                      </p>
                      <div className="flex items-center gap-1.5">
                        <Folder className="h-3 w-3 text-muted-foreground" />
                        <span className="text-[11px] text-muted-foreground">
                          {campaign.products.length} Products
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {view === "products" && activeCampaign && (
            <div className="space-y-3">
              <div className="relative h-20 w-full rounded-xl overflow-hidden flex-shrink-0">
                {activeCampaign.bannerUrl ? (
                  <img src={activeCampaign.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${getBannerGradient(activeCampaign.bannerColor)}`} />
                )}
                <div className="absolute inset-0 bg-black/50" />
                <div className="absolute inset-0 flex items-center gap-3 px-4">
                  <button
                    type="button"
                    onClick={() => { setView("campaigns"); setActiveCampaignId(null); }}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4 text-white" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-white truncate">{activeCampaign.name}</h3>
                    <p className="text-[11px] text-white/70">{activeCampaign.products.length} products in this campaign</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {activeCampaign.products.map((product) => {
                  const isSelected = selectedProductId === product.id;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      onClick={() => { onSelect(product); onOpenChange(false); }}
                      className={`flex gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        isSelected
                          ? "border-primary/50 bg-primary/10 ring-1 ring-primary/20"
                          : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
                      }`}
                    >
                      <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center relative">
                        <span className="text-xl font-semibold text-foreground/50 select-none">{product.thumbnail}</span>
                        {product.primaryImageUrl && (
                          <img
                            src={product.primaryImageUrl}
                            alt={product.name}
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{product.name}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{product.highlights}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

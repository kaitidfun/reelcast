"use client";

import { useEffect, useState } from "react";

export type CampaignCardProduct = { id: string; name: string; thumbnail: string | null };
export type CampaignCardData = {
  id: string;
  name: string;
  description: string;
  reelsCount: number;
  bannerColor: string;
  bannerImage?: string;
  products: CampaignCardProduct[];
  createdAt: string;
  updatedAt: string;
};

/** Mirrors library/page.tsx's own campaign fetch+mapping so cards built from this match it exactly. */
export function useCampaigns() {
  const [campaigns, setCampaigns] = useState<CampaignCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const token = localStorage.getItem("rf_token");
        if (!token) return;
        const res = await fetch("http://localhost:8000/api/library", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();

        const mapped: CampaignCardData[] = data.campaigns.map((c: any) => {
          const products = data.products
            .filter((p: any) => p.campaign_id === c.campaign_id)
            .map((p: any) => {
              const primaryImage = p.images?.find((img: any) => img.is_primary)?.image_url || p.images?.[0]?.image_url;
              return {
                id: p.product_id,
                name: p.product_name?.trim() || "Untitled Product",
                thumbnail: primaryImage
                  ? `http://localhost:8000/api/upload/images/${primaryImage}`
                  : p.brand_logo_url
                    ? `http://localhost:8000/api/upload/images/${p.brand_logo_url}`
                    : null,
                reelsGenerated: p.reel_count ?? 0,
              };
            });
          return {
            id: c.campaign_id,
            name: c.name,
            description: c.description || "",
            reelsCount: products.reduce((sum: number, p: any) => sum + (p.reelsGenerated || 0), 0),
            bannerColor: c.banner_color || "Twilight",
            bannerImage: c.banner_image_url || undefined,
            products,
            createdAt: c.created_at || new Date().toISOString(),
            updatedAt: c.updated_at || new Date().toISOString(),
          };
        });

        setCampaigns(mapped);
      } catch (e) {
        console.error("Failed to load campaigns:", e);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return { campaigns, loading };
}

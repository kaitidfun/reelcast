"use client";

import { BACKEND_BASE_URL } from "@/lib/api-config";
import { useMemo } from "react";
import { useLibraryData } from "@/hooks/useLibraryData";

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
export function useCampaigns(params: { limit?: number } = {}) {
  const query = useLibraryData(params);
  const campaigns = useMemo(() => {
    const data = query.data;
    if (!data) return [];
        const mapped: CampaignCardData[] = data.campaigns.map((c: any) => {
          const products = data.products
            .filter((p: any) => p.campaign_id === c.campaign_id)
            .map((p: any) => {
              const primaryImage = p.images?.find((img: any) => img.is_primary)?.image_url || p.images?.[0]?.image_url;
              return {
                id: p.product_id,
                name: p.product_name?.trim() || "Untitled Product",
                thumbnail: p.primary_image_url || (primaryImage
                  ? `${BACKEND_BASE_URL}/api/upload/images/${primaryImage}`
                  : p.brand_logo_url
                    ? `${BACKEND_BASE_URL}/api/upload/images/${p.brand_logo_url}`
                    : null),
                reelsGenerated: p.reel_count ?? 0,
              };
            });
          return {
            id: c.campaign_id,
            name: c.name,
            description: c.description || "",
            reelsCount: products.reduce((sum: number, p: any) => sum + (p.reelsGenerated || 0), 0),
            bannerColor: c.banner_color || "Twilight",
            bannerImage: c.banner_url || (c.banner_image_url ? `${BACKEND_BASE_URL}/api/upload/images/${c.banner_image_url}` : undefined),
            products,
            createdAt: c.created_at || new Date().toISOString(),
            updatedAt: c.updated_at || new Date().toISOString(),
          };
        });

    return mapped;
  }, [query.data]);
  return { campaigns, total: query.data?.total ?? 0, loading: query.isLoading };
}

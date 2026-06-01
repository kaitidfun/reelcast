"use client";

import { useState, useEffect } from "react";
import type { LibraryCampaign } from "../_types";

const BANNER_PRESETS: { label: string; value: string; gradient: string }[] = [
  { label: "Twilight",  value: "Twilight",  gradient: "from-orange-500 via-pink-500 to-purple-600"  },
  { label: "Pacific",   value: "Pacific",   gradient: "from-cyan-500 via-blue-500 to-indigo-600"    },
  { label: "Seafoam",   value: "Seafoam",   gradient: "from-emerald-500 via-teal-500 to-cyan-600"   },
  { label: "Amethyst",  value: "Amethyst",  gradient: "from-violet-500 via-purple-500 to-fuchsia-600" },
  { label: "Sunrise",   value: "Sunrise",   gradient: "from-rose-500 via-red-500 to-orange-500"     },
  { label: "Aurora",    value: "Aurora",    gradient: "from-lime-400 via-emerald-500 to-teal-600"   },
];

export const getBannerGradient = (color: string) => {
  const preset = BANNER_PRESETS.find((p) => p.value === color);
  return preset ? preset.gradient : BANNER_PRESETS[0].gradient;
};

export function useProductLibrary() {
  const [productLibrary, setProductLibrary] = useState<LibraryCampaign[]>([]);

  useEffect(() => {
    const fetchLibrary = async () => {
      try {
        const token = localStorage.getItem("rf_token");
        if (!token) return;
        const headers = { Authorization: `Bearer ${token}` };

        const [campRes, prodRes] = await Promise.all([
          fetch("http://localhost:8000/api/campaigns", { headers }),
          fetch("http://localhost:8000/api/products",  { headers }),
        ]);

        if (!campRes.ok || !prodRes.ok) return;

        const campData = await campRes.json();
        const prodData = await prodRes.json();

        const mapped: LibraryCampaign[] = campData.campaigns.map((c: any) => ({
          id: c.campaign_id,
          name: c.name,
          bannerColor: c.banner_color || "Twilight",
          bannerUrl: c.banner_url ?? null,
          emoji: c.name.charAt(0).toUpperCase() || "📦",
          products: prodData.products
            .filter((p: any) => p.campaign_id === c.campaign_id)
            .map((p: any) => {
              const rawImageKey =
                p.images?.find((img: any) => img.is_primary)?.image_url ||
                p.images?.[0]?.image_url;
              return {
                id: p.product_id,
                name: p.product_name,
                thumbnail: p.product_name.charAt(0).toUpperCase() || "📦",
                primaryImageUrl: rawImageKey
                  ? `http://localhost:8000/api/upload/images/${rawImageKey}`
                  : null,
                brandLogoUrl: p.brand_logo_url
                  ? `http://localhost:8000/api/upload/images/${p.brand_logo_url}`
                  : null,
                highlights: p.description || "",
                campaignName: c.name,
              };
            }),
        }));

        setProductLibrary(mapped);
      } catch (e) {
        console.error("Failed to load library:", e);
      }
    };

    fetchLibrary();
  }, []);

  return productLibrary;
}

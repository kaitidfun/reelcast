"use client";

import { BACKEND_BASE_URL } from "@/lib/api-config";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { fetchWithTimeout } from "@/lib/http";
import type { ReelCardData } from "@/components/ReelCard";
import { resolveVideoUrl } from "@/lib/reel-status";

export function useReels(params: { limit?: number; skip?: number; productId?: string; distributedOnly?: boolean } = {}) {
  const { user } = useAuth();
  const { limit = 50, skip = 0, productId, distributedOnly = false } = params;
  const query = useQuery({
    queryKey: ["member", user?.id, "reels", { limit, skip, productId, distributedOnly }],
    enabled: Boolean(user), staleTime: 15_000,
    queryFn: async ({ signal }) => {
      const qs = new URLSearchParams({ limit: String(limit), skip: String(skip) });
      if (productId) qs.set("product_id", productId);
      if (distributedOnly) qs.set("distributed", "true");
      const res = await fetchWithTimeout(`${BACKEND_BASE_URL}/api/reels?${qs}`, {
        signal, headers: { Authorization: `Bearer ${localStorage.getItem("rf_token")}` },
      });
      if (!res.ok) throw new Error("Unable to load reels");
      const data = await res.json();
      const reels = (
        (data.reels ?? []).map((r: any) => ({
          id: r.reel_id,
          title: r.name?.trim() || r.prompt_text?.trim() || "(no prompt)",
          name: r.name ?? null,
          status: r.status,
          hasDistribution: Boolean(r.has_distribution),
          thumbnail: resolveVideoUrl(r.first_frame_url),
          createdAt: r.created_at,
        }))
      );

      return { reels: reels as ReelCardData[], total: Number(data.total ?? 0) };
    },
  });
  return { reels: query.data?.reels ?? [], total: query.data?.total ?? 0,
    loading: query.isLoading, reload: query.refetch };
}

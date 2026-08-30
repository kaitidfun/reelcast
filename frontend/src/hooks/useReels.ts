"use client";

import { useState, useEffect, useCallback } from "react";
import type { ReelCardData } from "@/components/ReelCard";
import { resolveVideoUrl } from "@/lib/reel-status";

export function useReels(params: { limit?: number; productId?: string; distributedOnly?: boolean } = {}) {
  const [reels, setReels] = useState<ReelCardData[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const { limit, productId, distributedOnly } = params;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem("rf_token");
      if (!token) return;
      const qs = new URLSearchParams();
      if (limit) qs.set("limit", String(limit));
      if (productId) qs.set("product_id", productId);
      if (distributedOnly) qs.set("distributed", "true");

      const res = await fetch(`http://localhost:8000/api/reels?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();

      setReels(
        (data.reels ?? []).map((r: any) => ({
          id: r.reel_id,
          title: r.name?.trim() || r.prompt_text?.trim() || "(no prompt)",
          name: r.name ?? null,
          status: r.status,
          thumbnail: resolveVideoUrl(r.first_frame_url),
          createdAt: r.created_at,
        }))
      );
      setTotal(data.total ?? 0);
    } catch (e) {
      console.error("Failed to load reels:", e);
    } finally {
      setLoading(false);
    }
  }, [limit, productId, distributedOnly]);

  useEffect(() => {
    load();
  }, [load]);

  return { reels, total, loading, reload: load };
}

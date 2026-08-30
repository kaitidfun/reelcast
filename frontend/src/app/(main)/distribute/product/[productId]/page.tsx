"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReels } from "@/hooks/useReels";
import { ReelCard } from "@/components/ReelCard";
import { API_BASE_URL } from "@/lib/api";

export default function DistributedProductReelsPage() {
  const params = useParams();
  const router = useRouter();
  const productId = Array.isArray(params?.productId) ? params.productId[0] : (params?.productId as string) ?? "";

  const [productName, setProductName] = useState("");
  const { reels, loading, reload } = useReels({ productId, distributedOnly: true });

  useEffect(() => {
    if (!productId) return;
    const token = localStorage.getItem("rf_token");
    if (!token) return;
    fetch(`${API_BASE_URL}/products/${productId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setProductName(data.product_name ?? ""))
      .catch(() => {});
  }, [productId]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/distribute")} aria-label="Back to Distribute">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">{productName || "Product"}</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">Recently distributed reels.</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Loading…</div>
      ) : reels.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No distributed reels for this product yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {reels.map((reel) => (
            <ReelCard key={reel.id} reel={reel} onClick={() => router.push(`/distribute/${reel.id}`)} onChanged={reload} />
          ))}
        </div>
      )}
    </div>
  );
}

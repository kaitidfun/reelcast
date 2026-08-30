"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { API_BASE_URL } from "@/lib/api";
import { getProductStatus } from "@/lib/test-plan";
import { ProductCard, type ProductCardData } from "@/components/ProductCard";

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export default function DistributedCampaignProductsPage() {
  const params = useParams();
  const router = useRouter();
  const campaignId = Array.isArray(params?.campaignId) ? params.campaignId[0] : (params?.campaignId as string) ?? "";

  const [campaignName, setCampaignName] = useState("");
  const [products, setProducts] = useState<ProductCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;
    const load = async () => {
      try {
        const [idsRes, libRes, campRes] = await Promise.all([
          fetch(`${API_BASE_URL}/distributions/campaigns/${campaignId}/products`, { headers: authHeaders() }),
          fetch(`${API_BASE_URL}/library`, { headers: authHeaders() }),
          fetch(`${API_BASE_URL}/campaigns/${campaignId}`, { headers: authHeaders() }),
        ]);
        const productIds: string[] = idsRes.ok ? (await idsRes.json()).product_ids ?? [] : [];
        if (campRes.ok) setCampaignName((await campRes.json()).name ?? "");

        if (libRes.ok) {
          const lib = await libRes.json();
          const byId = new Map<string, ProductCardData>(
            lib.products.map((p: any) => {
              const primaryImage = p.images?.find((img: any) => img.is_primary)?.image_url || p.images?.[0]?.image_url;
              const productName = p.product_name?.trim() || "";
              return [
                p.product_id,
                {
                  id: p.product_id,
                  name: productName || "Untitled Product",
                  keyPoints: p.description || "",
                  affiliateLink: p.affiliate_link || "",
                  status: p.status ?? getProductStatus({
                    productName,
                    description: p.description,
                    affiliateLink: p.affiliate_link,
                    imageCount: p.images?.length || 0,
                  }),
                  thumbnail: primaryImage
                    ? `http://localhost:8000/api/upload/images/${primaryImage}`
                    : p.brand_logo_url
                      ? `http://localhost:8000/api/upload/images/${p.brand_logo_url}`
                      : null,
                  reelsGenerated: p.reel_count ?? 0,
                  createdAt: p.created_at || new Date().toISOString(),
                  updatedAt: p.updated_at || new Date().toISOString(),
                },
              ];
            })
          );
          setProducts(productIds.map((id) => byId.get(id)).filter((p): p is ProductCardData => Boolean(p)));
        }
      } catch (e) {
        console.error("Failed to load distributed products:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [campaignId]);

  if (loading) return <div className="p-12 text-center text-muted-foreground">Loading…</div>;

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/distribute")} aria-label="Back to Distribute">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">{campaignName || "Campaign"}</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">Products with recently distributed reels.</p>
        </div>
      </div>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No distributed reels for this campaign yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {products.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              index={i}
              onClick={() => router.push(`/distribute/product/${product.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

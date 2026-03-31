import { motion } from "framer-motion";
import { Package, Eye, Clock, MoreVertical, Search, Filter, Grid, List, Play, FolderOpen, Plus, Link2, Image as ImageIcon, Tag, Edit } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Product {
  id: number;
  title: string;
  collection: string;
  status: "Active" | "Draft" | "Archived";
  reelsGenerated: number;
  affiliateLink: string;
  description: string;
  brandLogo: string;
  productImage: string;
  date: string;
  thumbnail: string;
  tags: string[];
}

const mockProducts: Product[] = [
  { id: 1, title: "Summer Dress Collection", collection: "Summer Sale 2026", status: "Active", reelsGenerated: 5, affiliateLink: "https://shopee.co.th/ref/summer01", description: "คอลเลคชั่นชุดเดรสฤดูร้อนสุดเก๋", brandLogo: "🏷️", productImage: "🏖️", date: "Mar 6, 2026", thumbnail: "🏖️", tags: ["fashion", "summer"] },
  { id: 2, title: "Minimal Watch — Gold", collection: "Accessories Launch", status: "Active", reelsGenerated: 3, affiliateLink: "https://lazada.co.th/ref/watch01", description: "นาฬิกามินิมอลสีทอง หรูหรา", brandLogo: "⌚", productImage: "⌚", date: "Mar 5, 2026", thumbnail: "⌚", tags: ["accessories", "luxury"] },
  { id: 3, title: "Skincare Bundle Set", collection: "Beauty Week", status: "Draft", reelsGenerated: 0, affiliateLink: "", description: "เซ็ตดูแลผิวครบชุด", brandLogo: "🧴", productImage: "🧴", date: "Mar 4, 2026", thumbnail: "🧴", tags: ["beauty", "skincare"] },
  { id: 4, title: "Wireless Earbuds Pro", collection: "Tech Deals", status: "Active", reelsGenerated: 8, affiliateLink: "https://shopee.co.th/ref/tech01", description: "หูฟังไร้สายคุณภาพระดับ Pro", brandLogo: "🎧", productImage: "🎧", date: "Mar 3, 2026", thumbnail: "🎧", tags: ["tech", "audio"] },
  { id: 5, title: "Fashion Lookbook SS26", collection: "Summer Sale 2026", status: "Active", reelsGenerated: 12, affiliateLink: "https://lazada.co.th/ref/fashion01", description: "แฟชั่นลุคบุ๊ค Spring/Summer 2026", brandLogo: "👗", productImage: "👗", date: "Mar 2, 2026", thumbnail: "👗", tags: ["fashion", "lookbook"] },
  { id: 6, title: "Home Decor Candle Set", collection: "Home & Living", status: "Archived", reelsGenerated: 2, affiliateLink: "https://shopee.co.th/ref/home01", description: "เทียนหอมตกแต่งบ้าน", brandLogo: "🕯️", productImage: "🕯️", date: "Mar 1, 2026", thumbnail: "🕯️", tags: ["home", "decor"] },
];

const collections = [...new Set(mockProducts.map((p) => p.collection))];

const ContentLibrary = () => {
  const [view, setView] = useState<"grid" | "list">("grid");
  const [activeCollection, setActiveCollection] = useState<string | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);
  const navigate = useNavigate();

  const filtered = activeCollection
    ? mockProducts.filter((p) => p.collection === activeCollection)
    : mockProducts;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Product Library</h1>
          <p className="mt-1 text-muted-foreground">จัดการสินค้า, รูปภาพ, โลโก้แบรนด์, Affiliate Links และจัดกลุ่มเป็น Collections</p>
        </div>
        <Button onClick={() => navigate("/create")} className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {/* Collection Tags */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setActiveCollection(null)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
            !activeCollection ? "bg-primary/10 text-primary ring-primary/20" : "bg-muted text-muted-foreground ring-border hover:text-foreground"
          }`}
        >
          All ({mockProducts.length})
        </button>
        {collections.map((c) => (
          <button
            key={c}
            onClick={() => setActiveCollection(activeCollection === c ? null : c)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition-colors ${
              activeCollection === c ? "bg-primary/10 text-primary ring-primary/20" : "bg-muted text-muted-foreground ring-border hover:text-foreground"
            }`}
          >
            <FolderOpen className="inline h-3 w-3 mr-1" />
            {c} ({mockProducts.filter((p) => p.collection === c).length})
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ค้นหาสินค้า..." className="bg-card pl-10 border-border h-10" />
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0"><Filter className="h-4 w-4" /></Button>
        <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
          <button onClick={() => setView("grid")} className={`p-2.5 transition-colors ${view === "grid" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <Grid className="h-4 w-4" />
          </button>
          <button onClick={() => setView("list")} className={`p-2.5 transition-colors ${view === "list" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Grid View */}
      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="group rounded-2xl border border-border bg-card shadow-card card-shine transition-all duration-300 hover:border-primary/20 hover:shadow-elevated cursor-pointer overflow-hidden"
              onClick={() => setExpandedProduct(expandedProduct === product.id ? null : product.id)}
            >
              <div className="relative flex aspect-video items-center justify-center bg-muted text-4xl">
                {product.thumbnail}
                <div className="absolute top-2 right-2 text-lg">{product.brandLogo}</div>
                <div className="absolute inset-0 flex items-center justify-center bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full gradient-primary shadow-glow">
                    <Play className="h-5 w-5 text-primary-foreground ml-0.5" />
                  </div>
                </div>
              </div>
              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-1">{product.title}</h3>
                  <button className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  {product.collection}
                </p>
                <p className="mt-1 text-xs text-muted-foreground line-clamp-1">{product.description}</p>
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  {product.tags.map((tag) => (
                    <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border">
                      <Tag className="inline h-2.5 w-2.5 mr-0.5" />{tag}
                    </span>
                  ))}
                </div>
                <div className="mt-3 flex items-center gap-2.5 text-xs text-muted-foreground flex-wrap">
                  <span className={`rounded-full px-2.5 py-0.5 font-medium ring-1 ${
                    product.status === "Active" ? "bg-success/10 text-success ring-success/20"
                    : product.status === "Draft" ? "bg-warning/10 text-warning ring-warning/20"
                    : "bg-muted text-muted-foreground ring-border"
                  }`}>{product.status}</span>
                  <span className="flex items-center gap-1"><Package className="h-3 w-3" />{product.reelsGenerated} Reels</span>
                  {product.affiliateLink && (
                    <span className="flex items-center gap-1 text-primary"><Link2 className="h-3 w-3" />Affiliate</span>
                  )}
                </div>

                {/* Expanded Details */}
                {expandedProduct === product.id && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center gap-2 text-xs">
                      <ImageIcon className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Product Image:</span>
                      <span className="text-foreground">Uploaded ✓</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Link2 className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Affiliate:</span>
                      <span className="text-foreground truncate">{product.affiliateLink || "ยังไม่ได้ตั้งค่า"}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <Button variant="outline" size="sm" className="gap-1 flex-1 text-xs"><Edit className="h-3 w-3" />แก้ไข</Button>
                      <Button size="sm" className="gap-1 flex-1 text-xs gradient-primary text-primary-foreground"><Play className="h-3 w-3" />สร้าง Reel</Button>
                    </div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="divide-y divide-border">
            {filtered.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center gap-4 px-5 py-4 sm:px-6 transition-colors hover:bg-muted/40 cursor-pointer group"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-muted text-xl ring-1 ring-border group-hover:ring-primary/20 transition-all">{product.thumbnail}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{product.title}</p>
                  <p className="text-xs text-muted-foreground">{product.collection}</p>
                </div>
                <span className={`hidden sm:inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${
                  product.status === "Active" ? "bg-success/10 text-success ring-success/20"
                  : product.status === "Draft" ? "bg-warning/10 text-warning ring-warning/20"
                  : "bg-muted text-muted-foreground ring-border"
                }`}>{product.status}</span>
                <span className="hidden sm:flex items-center gap-1 text-xs text-muted-foreground"><Package className="h-3 w-3" />{product.reelsGenerated} Reels</span>
                {product.affiliateLink && <span className="hidden md:flex items-center gap-1 text-xs text-primary"><Link2 className="h-3 w-3" />Affiliate</span>}
                <span className="hidden lg:flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{product.date}</span>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContentLibrary;

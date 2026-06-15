"use client";

import { motion } from "framer-motion";
import {
  Plus,
  Package,
  Video,
  ChevronRight,
  Search,
  Link2,
  UploadCloud,
  Edit,
  Trash2,
  LayoutGrid,
  List,
  Sparkles,
  ArrowUpDown,
  Clock,
} from "lucide-react";
import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams, useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useToast } from "@/hooks/use-toast";

type ProductStatus = "Active" | "Draft";
type SortKey = "newest" | "oldest" | "updated" | "name";

interface Product {
  id: string;
  name: string;
  keyPoints: string;
  affiliateLink: string;
  status: ProductStatus;
  thumbnail: string;
  reelsGenerated: number;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  campaignId?: string;
  campaignName?: string;
  images?: { url: string; isPrimary: boolean }[];
  logo?: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  reelsCount: number;
  bannerColor: string; // The enum value from backend
  bannerImage?: string; // data URL or remote URL — overrides color when present
  products: Product[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

const BANNER_PRESETS: { label: string; value: string; gradient: string }[] = [
  { label: "Twilight", value: "Twilight", gradient: "from-orange-500 via-pink-500 to-purple-600" },
  { label: "Pacific", value: "Pacific", gradient: "from-cyan-500 via-blue-500 to-indigo-600" },
  { label: "Seafoam", value: "Seafoam", gradient: "from-emerald-500 via-teal-500 to-cyan-600" },
  { label: "Amethyst", value: "Amethyst", gradient: "from-violet-500 via-purple-500 to-fuchsia-600" },
  { label: "Sunrise", value: "Sunrise", gradient: "from-rose-500 via-red-500 to-orange-500" },
  { label: "Aurora", value: "Aurora", gradient: "from-lime-400 via-emerald-500 to-teal-600" },
];

const getBannerGradient = (color: string) => {
  const preset = BANNER_PRESETS.find((p) => p.value === color);
  return preset ? preset.gradient : BANNER_PRESETS[0].gradient;
};

// Helper: produce a deterministic ISO date offset by N days back from now
const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
};

const formatDateTime = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
};

const sortItems = <T extends { name: string; createdAt: string; updatedAt: string }>(
  items: T[],
  key: SortKey,
): T[] => {
  const arr = [...items];
  switch (key) {
    case "newest":
      return arr.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    case "oldest":
      return arr.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
    case "updated":
      return arr.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    case "name":
      return arr.sort((a, b) => a.name.localeCompare(b.name));
  }
};

const ContentLibrary = () => {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLibrary = useCallback(async () => {
    try {
      const token = localStorage.getItem("rf_token");
      if (!token) return;
      const headers = { Authorization: `Bearer ${token}` };

      const [campRes, prodRes] = await Promise.all([
        fetch("http://localhost:8000/api/campaigns", { headers }),
        fetch("http://localhost:8000/api/products", { headers })
      ]);

      if (campRes.ok && prodRes.ok) {
        const campData = await campRes.json();
        const prodData = await prodRes.json();

        const mappedCampaigns: Campaign[] = campData.campaigns.map((c: any) => ({
          id: c.campaign_id,
          name: c.name,
          description: c.description || "",
          reelsCount: 0,
          bannerColor: c.banner_color || "Twilight",
          bannerImage: c.banner_image_url || undefined,
          products: prodData.products.filter((p: any) => p.campaign_id === c.campaign_id).map((p: any) => {
            const primaryImage = p.images?.find((img: any) => img.is_primary)?.image_url || p.images?.[0]?.image_url;
            const isActive = Boolean(p.product_name?.trim() && p.description?.trim() && p.affiliate_link?.trim() && p.images?.length > 0);
            return {
              id: p.product_id,
              name: p.product_name,
              keyPoints: p.description || "",
              affiliateLink: p.affiliate_link || "",
              status: isActive ? "Active" : "Draft",
              thumbnail: primaryImage ? `http://localhost:8000/api/upload/images/${primaryImage}` : (p.brand_logo_url ? `http://localhost:8000/api/upload/images/${p.brand_logo_url}` : null),
              reelsGenerated: 0,
              createdAt: p.created_at || new Date().toISOString(),
              updatedAt: p.updated_at || new Date().toISOString(),
              images: p.images?.map((img: any) => ({ url: `http://localhost:8000/api/upload/images/${img.image_url}`, isPrimary: img.is_primary })) || [],
              logo: p.brand_logo_url ? `http://localhost:8000/api/upload/images/${p.brand_logo_url}` : undefined
            };
          }),
          createdAt: c.created_at || new Date().toISOString(),
          updatedAt: c.updated_at || new Date().toISOString()
        }));

        setCampaigns(mappedCampaigns);
      } else {
        const errData = await campRes.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to retrieve campaigns from database");
      }
    } catch (e: any) {
      console.error(e);
      toast({ title: "Error", description: e.message || "Failed to retrieve campaigns", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
  }, [fetchLibrary]);

  const openCampaignId = searchParams.get("campaign");
  const setOpenCampaignId = (id: string | null) => {
    if (id) {
      router.push(`?campaign=${id}`)
    } else {
      router.push(`?`)
    }
  };
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Campaign dialog state
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cDescription, setCDescription] = useState("");
  const [cBanner, setCBanner] = useState<string>("Twilight");
  const [cBannerImage, setCBannerImage] = useState<string>("");
  const cBannerInputRef = useRef<HTMLInputElement>(null);

  // Campaigns view
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignView, setCampaignView] = useState<"grid" | "list">("grid");
  const [campaignSort, setCampaignSort] = useState<SortKey>("updated");

  // Products view
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [productView, setProductView] = useState<"grid" | "list">("grid");
  const [productSort, setProductSort] = useState<SortKey>("updated");

  // Form state
  const [pName, setPName] = useState("");
  const [pPoints, setPPoints] = useState("");
  const [pLink, setPLink] = useState("");
  const [pImages, setPImages] = useState<{ url: string, file: File | null }[]>([]);
  const [pLogo, setPLogo] = useState<string>("");
  const [pLogoFile, setPLogoFile] = useState<File | null>(null);

  const handleMultipleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newImages = filesArray.map(file => ({
        url: URL.createObjectURL(file),
        file
      }));
      setPImages(prev => [...prev, ...newImages].slice(0, 5)); // Limit to 5
    }
  };

  const removeImage = (index: number) => {
    setPImages(prev => prev.filter((_, i) => i !== index));
  };


  const currentCampaign = campaigns.find((c) => c.id === openCampaignId) ?? null;

  const filteredCampaigns = sortItems(
    campaigns.filter((c) => {
      const q = campaignSearch.toLowerCase();
      return (
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q)
      );
    }),
    campaignSort,
  );

  const filteredProducts = currentCampaign
    ? sortItems(
      currentCampaign.products.filter((p) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.keyPoints.toLowerCase().includes(q);
        const matchesStatus = statusFilter === "all" || p.status === statusFilter;
        return matchesSearch && matchesStatus;
      }),
      productSort,
    )
    : [];

  const resetForm = () => {
    setPName("");
    setPPoints("");
    setPLink("");
    setPImages([]);
    setPLogo("");
    setPLogoFile(null);
    setEditingProductId(null);
  };

  const openAddDialog = () => {
    resetForm();
    setIsProductDialogOpen(true);
  };

  const openEditDialog = (product: Product) => {
    setEditingProductId(product.id);
    setPName(product.name);
    setPPoints(product.keyPoints);
    setPLink(product.affiliateLink);
    setPImages(product.images?.map(img => ({ url: img.url, file: null })) || []);
    setPLogo(product.logo || "");
    setPLogoFile(null);
    setIsProductDialogOpen(true);
  };

  const handleSaveProduct = async () => {
    if (!pName.trim() || !currentCampaign) {
      toast({ title: "Product name is required", variant: "destructive" });
      return;
    }
    const token = localStorage.getItem("rf_token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    let productId = editingProductId;

    try {
      if (editingProductId) {
        const res = await fetch(`http://localhost:8000/api/products/${editingProductId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            product_name: pName.trim(),
            description: pPoints.trim(),
            affiliate_link: pLink.trim(),
            campaign_id: currentCampaign.id
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to update product");
        }
        toast({ title: "Product updated" });
      } else {
        const res = await fetch(`http://localhost:8000/api/products`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            campaign_id: currentCampaign.id,
            product_name: pName.trim(),
            description: pPoints.trim(),
            affiliate_link: pLink.trim(),
            brand_logo_url: null
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to create product");
        }
        const data = await res.json();
        productId = data.product_id;
        toast({ title: "Product added" });
      }

      if (productId && (pImages.some(img => img.file) || pLogoFile)) {
        try {
          for (let i = 0; i < pImages.length; i++) {
            const img = pImages[i];
            if (img.file) {
              const formData = new FormData();
              formData.append("file", img.file);
              const isPrimary = i === 0;
              const imgRes = await fetch(`http://localhost:8000/api/products/${productId}/images?is_primary=${isPrimary}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData
              });
              if (!imgRes.ok) throw new Error("Failed to upload image");
            }
          }
          if (pLogoFile) {
            const formDataLogo = new FormData();
            formDataLogo.append("file", pLogoFile);
            const logoRes = await fetch(`http://localhost:8000/api/products/${productId}/upload-logo`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}` },
              body: formDataLogo
            });
            if (!logoRes.ok) throw new Error("Failed to upload logo");
          }
        } catch (uploadError: any) {
          // Rollback product creation if this was a new product
          if (!editingProductId && productId) {
            await fetch(`http://localhost:8000/api/products/${productId}`, {
              method: "DELETE",
              headers: { Authorization: `Bearer ${token}` }
            });
          }
          throw new Error(`Image upload failed: ${uploadError.message}. Product creation cancelled.`);
        }
      }

      await fetchLibrary();
      resetForm();
      setIsProductDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Something went wrong", variant: "destructive" });
    }
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Affiliate link copied" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleDeleteProduct = async (productId: string, productName: string) => {
    if (!currentCampaign) return;
    const token = localStorage.getItem("rf_token");
    await fetch(`http://localhost:8000/api/products/${productId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    toast({ title: "Product deleted", description: `${productName} removed.`, variant: "destructive" });
    await fetchLibrary();
  };

  const handleDeleteProductFromDialog = () => {
    if (!editingProductId || !currentCampaign) return;
    const product = currentCampaign.products.find((p) => p.id === editingProductId);
    if (!product) return;
    handleDeleteProduct(editingProductId, product.name);
    resetForm();
    setIsProductDialogOpen(false);
  };

  const handleDeleteCampaign = async () => {
    if (!editingCampaignId) return;
    const token = localStorage.getItem("rf_token");
    await fetch(`http://localhost:8000/api/campaigns/${editingCampaignId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });
    toast({ title: "Campaign deleted", variant: "destructive" });
    await fetchLibrary();
    resetCampaignForm();
    setIsCampaignDialogOpen(false);
  };

  const handleCreateReel = (product: Product) => {
    router.push(`/create?productId=${encodeURIComponent(product.id)}&productName=${encodeURIComponent(product.name)}&campaignId=${encodeURIComponent(currentCampaign?.id || "")}`);
  };

  // ============ Campaign CRUD ============
  const resetCampaignForm = () => {
    setCName("");
    setCDescription("");
    setCBanner("Twilight");
    setCBannerImage("");
    setEditingCampaignId(null);
  };

  const openNewCampaignDialog = () => {
    resetCampaignForm();
    setIsCampaignDialogOpen(true);
  };

  const openEditCampaignDialog = (e: React.MouseEvent, campaign: Campaign) => {
    e.stopPropagation();
    setEditingCampaignId(campaign.id);
    setCName(campaign.name);
    setCDescription(campaign.description);
    setCBanner(campaign.bannerColor || "Twilight");
    setCBannerImage(campaign.bannerImage ?? "");
    setIsCampaignDialogOpen(true);
  };

  const handleBannerImageUpload = (file: File | null | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setCBannerImage(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveCampaign = async () => {
    if (!cName.trim()) {
      toast({ title: "Campaign name is required", variant: "destructive" });
      return;
    }
    const token = localStorage.getItem("rf_token");
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

    try {
      if (editingCampaignId) {
        const res = await fetch(`http://localhost:8000/api/campaigns/${editingCampaignId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            name: cName.trim(),
            description: cDescription.trim(),
            banner_color: cBanner,
            banner_image_url: cBannerImage
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to update campaign");
        }
        toast({ title: "Campaign updated" });
      } else {
        const res = await fetch(`http://localhost:8000/api/campaigns`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name: cName.trim(),
            description: cDescription.trim(),
            banner_color: cBanner,
            banner_image_url: cBannerImage
          })
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.detail || "Failed to create campaign");
        }
        toast({ title: "Campaign created" });
      }
      await fetchLibrary();
      resetCampaignForm();
      setIsCampaignDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Something went wrong",
        variant: "destructive"
      });
    }
  };

  // ============ Campaign Dialog (shared between views) ============
  const campaignDialog = (
    <Dialog
      open={isCampaignDialogOpen}
      onOpenChange={(open) => {
        setIsCampaignDialogOpen(open);
        if (!open) resetCampaignForm();
      }}
    >
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        >
          <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
            <DialogTitle className="font-display text-xl">
              {editingCampaignId ? "Edit Campaign" : "New Campaign"}
            </DialogTitle>
            <DialogDescription>
              {editingCampaignId
                ? "Update your campaign details and banner style."
                : "Create a new campaign to group related products."}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 py-5 space-y-5">
            {/* Banner preview */}
            <div
              className={`relative h-28 rounded-xl overflow-hidden ${cBannerImage ? "" : `bg-gradient-to-br ${getBannerGradient(cBanner)}`
                }`}
              style={cBannerImage ? { backgroundImage: `url(${cBannerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
            >
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.3),transparent_60%)]" />
              {cBannerImage && <div className="absolute inset-0 bg-black/30" />}
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display text-lg font-semibold text-white drop-shadow">
                  {cName.trim() || "Campaign Banner"}
                </span>
              </div>
              {cBannerImage && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setCBannerImage("")}
                  className="absolute top-2 right-2 h-7 bg-background/70 backdrop-blur hover:bg-background text-xs"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </Button>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Banner</Label>
                <input
                  ref={cBannerInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleBannerImageUpload(e.target.files?.[0])}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => cBannerInputRef.current?.click()}
                  className="h-8 gap-1.5 text-xs"
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  {cBannerImage ? "Replace image" : "Upload image"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Pick a gradient style or upload your own banner image (PNG/JPG, max 5MB).
              </p>
              <div className="grid grid-cols-6 gap-2">
                {BANNER_PRESETS.map((preset) => (
                  <button
                    key={preset.value}
                    type="button"
                    onClick={() => {
                      setCBanner(preset.value);
                      setCBannerImage("");
                    }}
                    title={preset.label}
                    className={`h-10 rounded-lg bg-gradient-to-br ${preset.gradient} transition-all ring-2 ring-offset-2 ring-offset-background ${cBanner === preset.value && !cBannerImage
                      ? "ring-primary scale-105"
                      : "ring-transparent hover:ring-border"
                      }`}
                  />
                ))}
              </div>
            </div>

            <div>
              <Label htmlFor="campaign-name" className="mb-2 block">Campaign Name</Label>
              <Input
                id="campaign-name"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="e.g., Summer Sale 2026"
              />
            </div>

            <div>
              <Label htmlFor="campaign-desc" className="mb-2 block">Description</Label>
              <Textarea
                id="campaign-desc"
                rows={3}
                value={cDescription}
                onChange={(e) => setCDescription(e.target.value)}
                placeholder="Short description of this campaign"
              />
            </div>
          </div>

          <DialogFooter className="px-6 py-4 border-t border-border flex-row gap-3 sm:justify-between">
            <div>
              {editingCampaignId && (
                <Button
                  variant="ghost"
                  onClick={handleDeleteCampaign}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                variant="ghost"
                onClick={() => {
                  resetCampaignForm();
                  setIsCampaignDialogOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveCampaign}
                className="gradient-primary text-primary-foreground shadow-glow hover:shadow-glow-lg"
              >
                {editingCampaignId ? "Save Changes" : "Create Campaign"}
              </Button>
            </div>
          </DialogFooter>
        </motion.div>
      </DialogContent>
    </Dialog>
  );

  if (!currentCampaign) {
    return (
      <>
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
                Campaigns & Products
              </h1>
              <p className="mt-1 text-muted-foreground">
                Organize products by marketing campaign
              </p>
            </div>
            <Button
              onClick={openNewCampaignDialog}
              className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={campaignSearch}
                onChange={(e) => setCampaignSearch(e.target.value)}
                placeholder="Search campaigns…"
                className="bg-card pl-10 border-border h-10"
              />
            </div>
            <Select value={campaignSort} onValueChange={(v) => setCampaignSort(v as SortKey)}>
              <SelectTrigger className="w-full sm:w-[200px] bg-card h-10">
                <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="updated">Recently updated</SelectItem>
                <SelectItem value="newest">Newest first</SelectItem>
                <SelectItem value="oldest">Oldest first</SelectItem>
                <SelectItem value="name">Name (A–Z)</SelectItem>
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              value={campaignView}
              onValueChange={(v) => v && setCampaignView(v as "grid" | "list")}
              className="bg-card border border-border rounded-lg p-0.5 h-10"
            >
              <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9 rounded-md data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
                <LayoutGrid className="!h-5 !w-5" />
              </ToggleGroupItem>
              <ToggleGroupItem value="list" aria-label="List view" className="h-9 w-9 rounded-md data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
                <List className="!h-5 !w-5" />
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {filteredCampaigns.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
              No campaigns match your search.
            </div>
          ) : campaignView === "grid" ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCampaigns.map((campaign, i) => {
                const previewProducts = campaign.products.slice(0, 4);
                const overflow = Math.max(0, campaign.products.length - 4);
                return (
                  <motion.div
                    key={campaign.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setOpenCampaignId(campaign.id)}
                    className="group relative rounded-2xl border border-border bg-card overflow-hidden card-shine cursor-pointer transition-all duration-300 hover:border-primary/30 hover:shadow-elevated"
                  >
                    {/* Banner */}
                    <div
                      className={`relative h-28 overflow-hidden ${campaign.bannerImage ? "" : `bg-gradient-to-br ${getBannerGradient(campaign.bannerColor)}`}`}
                      style={campaign.bannerImage ? { backgroundImage: `url(${campaign.bannerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_60%)]" />
                      {campaign.bannerImage && <div className="absolute inset-0 bg-black/30" />}
                      <Button
                        variant="secondary"
                        size="icon"
                        onClick={(e) => openEditCampaignDialog(e, campaign)}
                        className="absolute top-2 right-2 h-8 w-8 bg-background/70 backdrop-blur hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Edit campaign"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
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
                              <div
                                key={idx}
                                className="h-12 rounded-lg bg-muted ring-1 ring-border flex items-center justify-center text-xs font-semibold text-muted-foreground"
                              >
                                +{overflow + 1}
                              </div>
                            );
                          }
                          if (product) {
                            return (
                              <div
                                key={idx}
                                className="h-12 rounded-lg bg-muted ring-1 ring-border flex items-center justify-center text-xl"
                              >
                                {product.thumbnail ? <img src={product.thumbnail} alt={product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="h-10 w-10 text-muted-foreground/30" />}
                              </div>
                            );
                          }
                          return (
                            <div
                              key={idx}
                              className="h-12 rounded-lg border border-dashed border-border/60"
                            />
                          );
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
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCampaigns.map((campaign, i) => {
                const previewProducts = campaign.products.slice(0, 4);
                return (
                  <motion.div
                    key={campaign.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => setOpenCampaignId(campaign.id)}
                    className="group flex items-center gap-4 p-4 rounded-2xl border border-border bg-card cursor-pointer transition-all duration-300 hover:border-primary/30 hover:shadow-elevated"
                  >
                    <div
                      className={`relative h-12 w-16 rounded-lg shrink-0 overflow-hidden ${campaign.bannerImage ? "" : `bg-gradient-to-br ${getBannerGradient(campaign.bannerColor)}`}`}
                      style={campaign.bannerImage ? { backgroundImage: `url(${campaign.bannerImage})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                    >
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.3),transparent_60%)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                        {campaign.name}
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">{campaign.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1.5">
                          <Package className="h-3.5 w-3.5" />
                          {campaign.products.length} Products
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Video className="h-3.5 w-3.5" />
                          {campaign.reelsCount} Reels
                        </span>
                        <span className="flex items-center gap-1.5" title={`Updated ${formatDateTime(campaign.updatedAt)}`}>
                          <Clock className="h-3.5 w-3.5" />
                          Updated {formatDate(campaign.updatedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="hidden md:flex items-center gap-1.5">
                      {previewProducts.map((p, idx) => (
                        <div
                          key={idx}
                          className="h-9 w-9 shrink-0 rounded-md bg-[#1c1c1c] border border-border/50 flex items-center justify-center overflow-hidden"
                        >
                          {p.thumbnail ? (
                            <img src={p.thumbnail} alt={p.name} className="h-full w-full object-contain" />
                          ) : (
                            <Package className="h-4 w-4 text-muted-foreground/50" />
                          )}
                        </div>
                      ))}
                      {campaign.products.length > 4 && (
                        <div className="h-9 w-9 shrink-0 rounded-md bg-muted border border-border/50 flex items-center justify-center text-xs font-medium text-muted-foreground">
                          +{campaign.products.length - 4}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => openEditCampaignDialog(e, campaign)}
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Edit campaign"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
        {campaignDialog}
      </>
    );
  }

  // ============ STATE 2: Inside Campaign View ============
  return (
    <div className="space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              onClick={() => {
                setOpenCampaignId(null);
                setSearch("");
                setStatusFilter("all");
              }}
              className="cursor-pointer"
            >
              Campaigns
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{currentCampaign.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">
            {currentCampaign.name}
          </h1>
          <p className="mt-1 text-muted-foreground">{currentCampaign.description}</p>
        </div>
        <Button
          onClick={openAddDialog}
          className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Add Product
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products in this campaign…"
            className="bg-card pl-10 border-border h-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[160px] bg-card h-10">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <Select value={productSort} onValueChange={(v) => setProductSort(v as SortKey)}>
          <SelectTrigger className="w-full sm:w-[200px] bg-card h-10">
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Sort" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Recently updated</SelectItem>
            <SelectItem value="newest">Newest first</SelectItem>
            <SelectItem value="oldest">Oldest first</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={productView}
          onValueChange={(v) => v && setProductView(v as "grid" | "list")}
          className="bg-card border border-border rounded-lg p-0.5 h-10"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" className="h-9 w-9 rounded-md data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <LayoutGrid className="!h-5 !w-5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view" className="h-9 w-9 rounded-md data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <List className="!h-5 !w-5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Content */}
      {filteredProducts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">
          No products match your filters.
        </div>
      ) : productView === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProducts.map((product, i) => {
            const previewReels: any[] = [];
            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => router.push(`/library/product/${product.id}`)}
                className="rounded-2xl border border-border bg-card overflow-hidden card-shine hover:border-primary/30 hover:shadow-elevated transition-all duration-300 cursor-pointer"
              >
                <div className="aspect-video bg-muted flex items-center justify-center text-5xl relative group/img">
                  {product.thumbnail ? <img src={product.thumbnail} alt={product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="h-10 w-10 text-muted-foreground/30" />}
                  <Badge
                    variant="outline"
                    className={
                      "absolute top-3 right-3 " +
                      (product.status === "Active"
                        ? "bg-success/15 text-success border-success/30"
                        : "bg-warning/15 text-warning border-warning/30")
                    }
                  >
                    {product.status}
                  </Badge>
                  <div className="absolute top-3 left-3 flex items-center gap-1 rounded-full bg-background/70 backdrop-blur px-2 py-1 text-xs text-foreground">
                    <Video className="h-3 w-3" />
                    {product.reelsGenerated} reels
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={(e) => { e.stopPropagation(); openEditDialog(product); }}
                    className="absolute bottom-3 right-3 h-8 w-8 bg-background/70 backdrop-blur hover:bg-background opacity-0 group-hover/img:opacity-100 transition-opacity"
                    title="Edit product"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </div>
                <div className="p-4 space-y-3">
                  <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                    {product.keyPoints}
                  </p>

                  <div className="flex items-center justify-between gap-2 pt-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); product.affiliateLink && handleCopyLink(product.affiliateLink); }}
                      disabled={!product.affiliateLink}
                      title="Copy link"
                      className="h-8 w-8 text-primary"
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleCreateReel(product); }}
                      className="gradient-primary gap-1.5 text-primary-foreground shadow-glow hover:shadow-glow-lg"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Create Reel
                    </Button>
                  </div>
                  <div className="pt-2 border-t border-border/50 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground/80">
                    <span className="flex items-center gap-1" title={`Created ${formatDateTime(product.createdAt)}`}>
                      <Plus className="h-3 w-3" />
                      {formatDate(product.createdAt)}
                    </span>
                    <span className="flex items-center gap-1" title={`Updated ${formatDateTime(product.updatedAt)}`}>
                      <Clock className="h-3 w-3" />
                      {formatDate(product.updatedAt)}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-[80px]">Thumbnail</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Key Selling Points</TableHead>
                <TableHead className="w-[100px]">Affiliate</TableHead>
                <TableHead className="w-[110px]">Status</TableHead>
                <TableHead className="w-[80px]">Reels</TableHead>
                <TableHead className="w-[140px]">Updated</TableHead>
                <TableHead className="w-[140px]">Create</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow
                  key={product.id}
                  onClick={() => router.push(`/library/product/${product.id}`)}
                  className="cursor-pointer"
                >
                  <TableCell>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl ring-1 ring-border">
                      {product.thumbnail ? <img src={product.thumbnail} alt={product.name} className="h-full w-full object-cover rounded-lg" /> : <Package className="h-10 w-10 text-muted-foreground/30" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-foreground">{product.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <p className="truncate max-w-[280px]">{product.keyPoints}</p>
                  </TableCell>
                  <TableCell>
                    {product.affiliateLink ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleCopyLink(product.affiliateLink); }}
                        title="Copy link"
                        className="h-8 w-8 text-primary"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        product.status === "Active"
                          ? "bg-success/15 text-success border-success/30"
                          : "bg-warning/15 text-warning border-warning/30"
                      }
                    >
                      {product.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5" />
                      {product.reelsGenerated}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground" title={`Created ${formatDateTime(product.createdAt)}\nUpdated ${formatDateTime(product.updatedAt)}`}>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      {formatDate(product.updatedAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={(e) => { e.stopPropagation(); handleCreateReel(product); }}
                      className="gradient-primary gap-1.5 text-primary-foreground shadow-glow hover:shadow-glow-lg"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Create Reel
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); openEditDialog(product); }}
                      className="h-8 w-8"
                      title="Edit product"
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add / Edit Product Dialog */}
      <Dialog
        open={isProductDialogOpen}
        onOpenChange={(open) => {
          setIsProductDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="max-w-2xl p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="flex flex-col min-h-0"
          >
            <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
              <DialogTitle className="font-display text-xl">
                {editingProductId ? "Edit Product" : "Add New Product"}
              </DialogTitle>
              <DialogDescription>
                {editingProductId
                  ? `Update product details in ${currentCampaign.name}.`
                  : `Add a product to ${currentCampaign.name}.`}
              </DialogDescription>
            </DialogHeader>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Image uploads — two-column */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <Label className="mb-2 block">Product Images (up to 5)</Label>
                  {pImages.length > 0 ? (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {pImages.map((img, i) => (
                        <div key={i} className="relative aspect-square rounded-xl overflow-hidden ring-1 ring-border group bg-muted flex items-center justify-center">
                          <img src={img.url} alt="Preview" className="h-full w-full object-cover" />
                          <button onClick={(e) => { e.preventDefault(); removeImage(i); }} className="absolute top-1.5 right-1.5 bg-background/80 text-foreground p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-background">
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </button>
                          {i === 0 && <Badge className="absolute bottom-1.5 left-1.5 text-[10px] px-1.5 py-0 shadow">Primary</Badge>}
                        </div>
                      ))}
                      {pImages.length < 5 && (
                        <label className="relative flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl text-center hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all aspect-square bg-card">
                          <Plus className="h-6 w-6 text-muted-foreground" />
                          <input type="file" accept="image/*" multiple className="hidden" onChange={handleMultipleImageUpload} />
                        </label>
                      )}
                    </div>
                  ) : (
                    <label className="relative overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all min-h-[160px]">
                      <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-foreground">Drag & drop or click to upload</p>
                      <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                      <input type="file" accept="image/*" multiple className="hidden" onChange={handleMultipleImageUpload} />
                    </label>
                  )}
                </div>
                <div>
                  <Label className="mb-2 block">Brand Logo</Label>
                  <label className="relative overflow-hidden flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all min-h-[160px] bg-card">
                    {pLogo ? (
                      <>
                        <img src={pLogo} alt="Logo preview" className="h-full w-full object-contain p-2 absolute inset-0 bg-card" />
                        <div className="absolute inset-0 bg-background/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
                          <p className="text-xs font-medium text-foreground bg-background/80 px-2 py-1 rounded-md">Change Logo</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-6 w-6 text-muted-foreground mb-2" />
                        <p className="text-xs text-foreground">Upload logo</p>
                        <p className="text-[10px] text-muted-foreground mt-1">PNG up to 2MB</p>
                      </>
                    )}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) { setPLogoFile(e.target.files[0]); setPLogo(URL.createObjectURL(e.target.files[0])); } }} />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                <div>
                  <Label htmlFor="product-name" className="mb-2 block">Product Name</Label>
                  <Input
                    id="product-name"
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="e.g., Wireless Earbuds Pro"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="product-points" className="mb-2 block">Key Selling Points</Label>
                <Textarea
                  id="product-points"
                  rows={4}
                  value={pPoints}
                  onChange={(e) => setPPoints(e.target.value)}
                  placeholder="Enter key features for AI script generation"
                />
              </div>

              <div>
                <Label htmlFor="product-link" className="mb-2 block">Affiliate Link</Label>
                <Input
                  id="product-link"
                  type="url"
                  value={pLink}
                  onChange={(e) => setPLink(e.target.value)}
                  placeholder="https://..."
                />
              </div>
            </div>

            <DialogFooter className="px-6 py-4 border-t border-border flex-row gap-3 sm:justify-between">
              <div>
                {editingProductId && (
                  <Button
                    variant="ghost"
                    onClick={handleDeleteProductFromDialog}
                    className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-2"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                )}
              </div>
              <div className="flex gap-3">
                <Button
                  variant="ghost"
                  onClick={() => {
                    resetForm();
                    setIsProductDialogOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveProduct}
                  className="gradient-primary text-primary-foreground shadow-glow hover:shadow-glow-lg"
                >
                  {editingProductId ? "Save Changes" : "Save Product"}
                </Button>
              </div>
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContentLibrary;







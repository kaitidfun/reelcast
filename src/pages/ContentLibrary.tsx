import { motion } from "framer-motion";
import {
  FolderOpen,
  Plus,
  Package,
  Video,
  ChevronRight,
  Search,
  MoreVertical,
  Link2,
  UploadCloud,
  Edit,
  Trash2,
  LayoutGrid,
  List,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface Product {
  id: string;
  name: string;
  keyPoints: string;
  affiliateLink: string;
  status: ProductStatus;
  thumbnail: string;
  reelsGenerated: number;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  reelsCount: number;
  banner: string; // tailwind gradient classes for banner background
  products: Product[];
}

const BANNER_PRESETS: { label: string; value: string }[] = [
  { label: "Sunset", value: "from-orange-500 via-pink-500 to-purple-600" },
  { label: "Ocean", value: "from-cyan-500 via-blue-500 to-indigo-600" },
  { label: "Forest", value: "from-emerald-500 via-teal-500 to-cyan-600" },
  { label: "Royal", value: "from-violet-500 via-purple-500 to-fuchsia-600" },
  { label: "Ember", value: "from-rose-500 via-red-500 to-orange-500" },
  { label: "Mint", value: "from-lime-400 via-emerald-500 to-teal-600" },
];

const initialCampaigns: Campaign[] = [
  {
    id: "summer-2026",
    name: "Summer Sale 2026",
    description: "Seasonal promotion for summer essentials and beachwear.",
    reelsCount: 12,
    banner: "from-orange-500 via-pink-500 to-purple-600",
    products: [
      { id: "p1", name: "Summer Dress Collection", keyPoints: "Lightweight fabric, breathable design, perfect for beach days and casual outings.", affiliateLink: "https://shopee.co.th/ref/summer01", status: "Active", thumbnail: "🏖️", reelsGenerated: 5 },
      { id: "p2", name: "Fashion Lookbook SS26", keyPoints: "Curated Spring/Summer 2026 styles featuring trending colors and silhouettes.", affiliateLink: "https://lazada.co.th/ref/fashion01", status: "Active", thumbnail: "👗", reelsGenerated: 4 },
      { id: "p3", name: "Beach Tote Bag", keyPoints: "Spacious, water-resistant tote with reinforced straps for everyday summer use.", affiliateLink: "https://shopee.co.th/ref/tote01", status: "Draft", thumbnail: "👜", reelsGenerated: 3 },
    ],
  },
  {
    id: "accessories",
    name: "Accessories Launch",
    description: "Premium accessories collection for modern lifestyles.",
    reelsCount: 7,
    banner: "from-violet-500 via-purple-500 to-fuchsia-600",
    products: [
      { id: "p4", name: "Minimal Watch — Gold", keyPoints: "Elegant minimalist design with gold-plated stainless steel and sapphire crystal.", affiliateLink: "https://lazada.co.th/ref/watch01", status: "Active", thumbnail: "⌚", reelsGenerated: 3 },
      { id: "p5", name: "Leather Wallet Slim", keyPoints: "Genuine leather, RFID-blocking, holds up to 8 cards in a slim profile.", affiliateLink: "https://shopee.co.th/ref/wallet01", status: "Active", thumbnail: "👛", reelsGenerated: 2 },
      { id: "p6", name: "Sunglasses Aviator", keyPoints: "Polarized UV400 lenses with classic aviator frame in matte finish.", affiliateLink: "", status: "Draft", thumbnail: "🕶️", reelsGenerated: 2 },
    ],
  },
  {
    id: "beauty-week",
    name: "Beauty Week",
    description: "Skincare and beauty essentials promo week.",
    reelsCount: 5,
    banner: "from-rose-500 via-red-500 to-orange-500",
    products: [
      { id: "p7", name: "Skincare Bundle Set", keyPoints: "Complete 5-step routine with cleanser, toner, serum, moisturizer, and SPF.", affiliateLink: "", status: "Draft", thumbnail: "🧴", reelsGenerated: 2 },
      { id: "p8", name: "Lip Tint Trio", keyPoints: "Long-lasting matte finish in three universally flattering shades.", affiliateLink: "https://shopee.co.th/ref/lip01", status: "Active", thumbnail: "💄", reelsGenerated: 3 },
    ],
  },
  {
    id: "tech-deals",
    name: "Tech Deals",
    description: "Best deals on consumer tech and audio gear.",
    reelsCount: 9,
    banner: "from-cyan-500 via-blue-500 to-indigo-600",
    products: [
      { id: "p9", name: "Wireless Earbuds Pro", keyPoints: "Active noise cancellation, 30-hour battery life, IPX5 water resistance.", affiliateLink: "https://shopee.co.th/ref/tech01", status: "Active", thumbnail: "🎧", reelsGenerated: 4 },
      { id: "p10", name: "Portable Charger 20K", keyPoints: "20,000mAh capacity with fast-charge USB-C and dual USB-A outputs.", affiliateLink: "https://lazada.co.th/ref/charger01", status: "Active", thumbnail: "🔋", reelsGenerated: 3 },
      { id: "p11", name: "Smart Desk Lamp", keyPoints: "Adjustable color temperature, touch dimming, USB charging port built-in.", affiliateLink: "", status: "Draft", thumbnail: "💡", reelsGenerated: 2 },
    ],
  },
];

const ContentLibrary = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);

  // Campaign dialog state
  const [isCampaignDialogOpen, setIsCampaignDialogOpen] = useState(false);
  const [editingCampaignId, setEditingCampaignId] = useState<string | null>(null);
  const [cName, setCName] = useState("");
  const [cDescription, setCDescription] = useState("");
  const [cBanner, setCBanner] = useState<string>(BANNER_PRESETS[0].value);

  // Campaigns view
  const [campaignSearch, setCampaignSearch] = useState("");
  const [campaignView, setCampaignView] = useState<"grid" | "list">("grid");

  // Products view
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");
  const [productView, setProductView] = useState<"grid" | "list">("grid");

  // Form state
  const [pName, setPName] = useState("");
  const [pPoints, setPPoints] = useState("");
  const [pLink, setPLink] = useState("");
  const [pCta, setPCta] = useState("Shop Now");
  const [pImage, setPImage] = useState<string>("");
  const [pLogo, setPLogo] = useState<string>("");

  const currentCampaign = campaigns.find((c) => c.id === openCampaignId) ?? null;

  const filteredCampaigns = campaigns.filter((c) => {
    const q = campaignSearch.toLowerCase();
    return (
      !q ||
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  });

  const filteredProducts = currentCampaign
    ? currentCampaign.products.filter((p) => {
        const q = search.toLowerCase();
        const matchesSearch =
          !q ||
          p.name.toLowerCase().includes(q) ||
          p.keyPoints.toLowerCase().includes(q);
        const matchesStatus = statusFilter === "all" || p.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
    : [];

  const resetForm = () => {
    setPName("");
    setPPoints("");
    setPLink("");
    setPCta("Shop Now");
    setPImage("");
    setPLogo("");
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
    setPCta("Shop Now");
    setPImage(product.thumbnail);
    setPLogo("");
    setIsProductDialogOpen(true);
  };

  const handleSaveProduct = () => {
    if (!pName.trim() || !currentCampaign) {
      toast({ title: "Product name is required", variant: "destructive" });
      return;
    }
    if (editingProductId) {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === currentCampaign.id
            ? {
                ...c,
                products: c.products.map((p) =>
                  p.id === editingProductId
                    ? {
                        ...p,
                        name: pName.trim(),
                        keyPoints: pPoints.trim(),
                        affiliateLink: pLink.trim(),
                        thumbnail: pImage || p.thumbnail,
                      }
                    : p,
                ),
              }
            : c,
        ),
      );
      toast({ title: "Product updated", description: `${pName.trim()} saved.` });
    } else {
      const newProduct: Product = {
        id: `p${Date.now()}`,
        name: pName.trim(),
        keyPoints: pPoints.trim(),
        affiliateLink: pLink.trim(),
        status: "Draft",
        thumbnail: pImage || "📦",
        reelsGenerated: 0,
      };
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === currentCampaign.id ? { ...c, products: [newProduct, ...c.products] } : c,
        ),
      );
      toast({ title: "Product added", description: `${newProduct.name} added to ${currentCampaign.name}.` });
    }
    resetForm();
    setIsProductDialogOpen(false);
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Affiliate link copied" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  const handleCreateReel = (product: Product) => {
    navigate("/create", {
      state: {
        productId: product.id,
        productName: product.name,
        campaignId: currentCampaign?.id,
      },
    });
  };

  // ============ Campaign CRUD ============
  const resetCampaignForm = () => {
    setCName("");
    setCDescription("");
    setCBanner(BANNER_PRESETS[0].value);
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
    setCBanner(campaign.banner);
    setIsCampaignDialogOpen(true);
  };

  const handleSaveCampaign = () => {
    if (!cName.trim()) {
      toast({ title: "Campaign name is required", variant: "destructive" });
      return;
    }
    if (editingCampaignId) {
      setCampaigns((prev) =>
        prev.map((c) =>
          c.id === editingCampaignId
            ? { ...c, name: cName.trim(), description: cDescription.trim(), banner: cBanner }
            : c,
        ),
      );
      toast({ title: "Campaign updated", description: `${cName.trim()} saved.` });
    } else {
      const newCampaign: Campaign = {
        id: `c${Date.now()}`,
        name: cName.trim(),
        description: cDescription.trim(),
        reelsCount: 0,
        banner: cBanner,
        products: [],
      };
      setCampaigns((prev) => [newCampaign, ...prev]);
      toast({ title: "Campaign created", description: `${newCampaign.name} added.` });
    }
    resetCampaignForm();
    setIsCampaignDialogOpen(false);
  };

  if (!currentCampaign) {
    return (
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
            onClick={() => toast({ title: "New Campaign", description: "Campaign creation coming soon." })}
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
          <ToggleGroup
            type="single"
            value={campaignView}
            onValueChange={(v) => v && setCampaignView(v as "grid" | "list")}
            className="bg-card border border-border rounded-md p-1 h-10"
          >
            <ToggleGroupItem value="grid" aria-label="Grid view" className="h-8 w-8 data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
              <LayoutGrid className="h-4 w-4" />
            </ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="List view" className="h-8 w-8 data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
              <List className="h-4 w-4" />
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
                  className="group relative rounded-2xl border border-border bg-card p-6 card-shine cursor-pointer transition-all duration-300 hover:border-primary/30 hover:shadow-elevated before:content-[''] before:absolute before:-top-2 before:left-6 before:h-3 before:w-14 before:rounded-t-lg before:bg-card before:border before:border-b-0 before:border-border"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl gradient-primary shadow-glow">
                      <FolderOpen className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors">
                    {campaign.name}
                  </h3>
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
                            {product.thumbnail}
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

                  <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" />
                      {campaign.products.length} Products
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Video className="h-3.5 w-3.5" />
                      {campaign.reelsCount} Reels
                    </span>
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow shrink-0">
                    <FolderOpen className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-base font-semibold text-foreground truncate group-hover:text-primary transition-colors">
                      {campaign.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">{campaign.description}</p>
                    <div className="mt-1.5 flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Package className="h-3.5 w-3.5" />
                        {campaign.products.length} Products
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Video className="h-3.5 w-3.5" />
                        {campaign.reelsCount} Reels
                      </span>
                    </div>
                  </div>
                  <div className="hidden md:flex -space-x-2">
                    {previewProducts.map((p, idx) => (
                      <div
                        key={idx}
                        className="h-9 w-9 rounded-lg bg-muted ring-2 ring-card flex items-center justify-center text-base"
                      >
                        {p.thumbnail}
                      </div>
                    ))}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products in this campaign…"
            className="bg-card pl-10 border-border h-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-full sm:w-[180px] bg-card h-10">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          value={productView}
          onValueChange={(v) => v && setProductView(v as "grid" | "list")}
          className="bg-card border border-border rounded-md p-1 h-10"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" className="h-8 w-8 data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <LayoutGrid className="h-4 w-4" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view" className="h-8 w-8 data-[state=on]:bg-primary/15 data-[state=on]:text-primary">
            <List className="h-4 w-4" />
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
          {filteredProducts.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="rounded-2xl border border-border bg-card overflow-hidden card-shine hover:border-primary/30 hover:shadow-elevated transition-all duration-300"
            >
              <div className="aspect-video bg-muted flex items-center justify-center text-5xl relative">
                {product.thumbnail}
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
              </div>
              <div className="p-4 space-y-3">
                <h3 className="font-semibold text-foreground line-clamp-1">{product.name}</h3>
                <p className="text-xs text-muted-foreground line-clamp-2 min-h-[2rem]">
                  {product.keyPoints}
                </p>
                <div className="flex items-center justify-between gap-2 pt-2">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => product.affiliateLink && handleCopyLink(product.affiliateLink)}
                      disabled={!product.affiliateLink}
                      title="Copy link"
                      className="h-8 w-8 text-primary"
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(product)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => toast({ title: `Delete ${product.name}`, variant: "destructive" })}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleCreateReel(product)}
                    className="gradient-primary gap-1.5 text-primary-foreground shadow-glow hover:shadow-glow-lg"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Create Reel
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
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
                <TableHead className="w-[140px]">Create</TableHead>
                <TableHead className="w-[60px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredProducts.map((product) => (
                <TableRow key={product.id}>
                  <TableCell>
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-xl ring-1 ring-border">
                      {product.thumbnail}
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
                        onClick={() => handleCopyLink(product.affiliateLink)}
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
                  <TableCell>
                    <Button
                      size="sm"
                      onClick={() => handleCreateReel(product)}
                      className="gradient-primary gap-1.5 text-primary-foreground shadow-glow hover:shadow-glow-lg"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      Create Reel
                    </Button>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEditDialog(product)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => toast({ title: `Delete ${product.name}`, variant: "destructive" })}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
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
                  <Label className="mb-2 block">Product Image</Label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all min-h-[160px]">
                    {pImage && pImage.length <= 4 ? (
                      <div className="text-5xl mb-2">{pImage}</div>
                    ) : (
                      <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                    )}
                    <p className="text-sm text-foreground">Drag & drop or click to upload</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                    <input type="file" accept="image/*" className="hidden" />
                  </label>
                </div>
                <div>
                  <Label className="mb-2 block">Brand Logo</Label>
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-4 text-center hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all min-h-[160px]">
                    <UploadCloud className="h-6 w-6 text-muted-foreground mb-2" />
                    <p className="text-xs text-foreground">Upload logo</p>
                    <p className="text-[10px] text-muted-foreground mt-1">PNG up to 2MB</p>
                    <input type="file" accept="image/*" className="hidden" />
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="product-name" className="mb-2 block">Product Name</Label>
                  <Input
                    id="product-name"
                    value={pName}
                    onChange={(e) => setPName(e.target.value)}
                    placeholder="e.g., Wireless Earbuds Pro"
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Call to Action</Label>
                  <Select value={pCta} onValueChange={setPCta}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Shop Now">Shop Now</SelectItem>
                      <SelectItem value="Link in Bio">Link in Bio</SelectItem>
                      <SelectItem value="Learn More">Learn More</SelectItem>
                    </SelectContent>
                  </Select>
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

            <DialogFooter className="px-6 py-4 border-t border-border flex-row gap-3 justify-end">
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
            </DialogFooter>
          </motion.div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContentLibrary;

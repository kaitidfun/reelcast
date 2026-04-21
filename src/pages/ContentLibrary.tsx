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
} from "lucide-react";
import { useState } from "react";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { useToast } from "@/hooks/use-toast";

type ProductStatus = "Active" | "Draft";

interface Product {
  id: string;
  name: string;
  keyPoints: string;
  affiliateLink: string;
  status: ProductStatus;
  thumbnail: string;
}

interface Campaign {
  id: string;
  name: string;
  description: string;
  reelsCount: number;
  products: Product[];
}

const initialCampaigns: Campaign[] = [
  {
    id: "summer-2026",
    name: "Summer Sale 2026",
    description: "Seasonal promotion for summer essentials and beachwear.",
    reelsCount: 12,
    products: [
      { id: "p1", name: "Summer Dress Collection", keyPoints: "Lightweight fabric, breathable design, perfect for beach days and casual outings.", affiliateLink: "https://shopee.co.th/ref/summer01", status: "Active", thumbnail: "🏖️" },
      { id: "p2", name: "Fashion Lookbook SS26", keyPoints: "Curated Spring/Summer 2026 styles featuring trending colors and silhouettes.", affiliateLink: "https://lazada.co.th/ref/fashion01", status: "Active", thumbnail: "👗" },
      { id: "p3", name: "Beach Tote Bag", keyPoints: "Spacious, water-resistant tote with reinforced straps for everyday summer use.", affiliateLink: "https://shopee.co.th/ref/tote01", status: "Draft", thumbnail: "👜" },
    ],
  },
  {
    id: "accessories",
    name: "Accessories Launch",
    description: "Premium accessories collection for modern lifestyles.",
    reelsCount: 7,
    products: [
      { id: "p4", name: "Minimal Watch — Gold", keyPoints: "Elegant minimalist design with gold-plated stainless steel and sapphire crystal.", affiliateLink: "https://lazada.co.th/ref/watch01", status: "Active", thumbnail: "⌚" },
      { id: "p5", name: "Leather Wallet Slim", keyPoints: "Genuine leather, RFID-blocking, holds up to 8 cards in a slim profile.", affiliateLink: "https://shopee.co.th/ref/wallet01", status: "Active", thumbnail: "👛" },
      { id: "p6", name: "Sunglasses Aviator", keyPoints: "Polarized UV400 lenses with classic aviator frame in matte finish.", affiliateLink: "", status: "Draft", thumbnail: "🕶️" },
    ],
  },
  {
    id: "beauty-week",
    name: "Beauty Week",
    description: "Skincare and beauty essentials promo week.",
    reelsCount: 5,
    products: [
      { id: "p7", name: "Skincare Bundle Set", keyPoints: "Complete 5-step routine with cleanser, toner, serum, moisturizer, and SPF.", affiliateLink: "", status: "Draft", thumbnail: "🧴" },
      { id: "p8", name: "Lip Tint Trio", keyPoints: "Long-lasting matte finish in three universally flattering shades.", affiliateLink: "https://shopee.co.th/ref/lip01", status: "Active", thumbnail: "💄" },
    ],
  },
  {
    id: "tech-deals",
    name: "Tech Deals",
    description: "Best deals on consumer tech and audio gear.",
    reelsCount: 9,
    products: [
      { id: "p9", name: "Wireless Earbuds Pro", keyPoints: "Active noise cancellation, 30-hour battery life, IPX5 water resistance.", affiliateLink: "https://shopee.co.th/ref/tech01", status: "Active", thumbnail: "🎧" },
      { id: "p10", name: "Portable Charger 20K", keyPoints: "20,000mAh capacity with fast-charge USB-C and dual USB-A outputs.", affiliateLink: "https://lazada.co.th/ref/charger01", status: "Active", thumbnail: "🔋" },
      { id: "p11", name: "Smart Desk Lamp", keyPoints: "Adjustable color temperature, touch dimming, USB charging port built-in.", affiliateLink: "", status: "Draft", thumbnail: "💡" },
    ],
  },
];

const ContentLibrary = () => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<Campaign[]>(initialCampaigns);
  const [openCampaignId, setOpenCampaignId] = useState<string | null>(null);
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | ProductStatus>("all");

  // Form state
  const [pName, setPName] = useState("");
  const [pPoints, setPPoints] = useState("");
  const [pLink, setPLink] = useState("");
  const [pCta, setPCta] = useState("Shop Now");

  const currentCampaign = campaigns.find((c) => c.id === openCampaignId) ?? null;

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
  };

  const handleSaveProduct = () => {
    if (!pName.trim() || !currentCampaign) {
      toast({ title: "Product name is required", variant: "destructive" });
      return;
    }
    const newProduct: Product = {
      id: `p${Date.now()}`,
      name: pName.trim(),
      keyPoints: pPoints.trim(),
      affiliateLink: pLink.trim(),
      status: "Draft",
      thumbnail: "📦",
    };
    setCampaigns((prev) =>
      prev.map((c) =>
        c.id === currentCampaign.id ? { ...c, products: [newProduct, ...c.products] } : c,
      ),
    );
    toast({ title: "Product added", description: `${newProduct.name} added to ${currentCampaign.name}.` });
    resetForm();
    setIsAddProductOpen(false);
  };

  const handleCopyLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: "Affiliate link copied" });
    } catch {
      toast({ title: "Failed to copy link", variant: "destructive" });
    }
  };

  // ============ STATE 1: Campaigns View ============
  if (!currentCampaign) {
    return (
      <div className="space-y-8">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {campaigns.map((campaign, i) => (
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
          ))}
        </div>
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
          onClick={() => setIsAddProductOpen(true)}
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
      </div>

      {/* Data Table */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[80px]">Thumbnail</TableHead>
              <TableHead>Product Name</TableHead>
              <TableHead>Key Selling Points</TableHead>
              <TableHead className="w-[100px]">Affiliate</TableHead>
              <TableHead className="w-[110px]">Status</TableHead>
              <TableHead className="w-[60px] text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredProducts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  No products match your filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredProducts.map((product) => (
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
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => toast({ title: `Edit ${product.name}` })}>
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
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Add Product Drawer */}
      <Sheet open={isAddProductOpen} onOpenChange={setIsAddProductOpen}>
        <SheetContent side="right" className="sm:max-w-md w-full flex flex-col p-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <SheetTitle>Add New Product</SheetTitle>
            <SheetDescription>Add a product to {currentCampaign.name}.</SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {/* Image dropzone */}
            <div>
              <Label className="mb-2 block">Product Image</Label>
              <label className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/40 hover:bg-muted/30 cursor-pointer transition-all">
                <UploadCloud className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-foreground">Drag & drop or click to upload</p>
                <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 5MB</p>
                <input type="file" accept="image/*" className="hidden" />
              </label>
            </div>

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

          <SheetFooter className="px-6 py-4 border-t border-border flex-row gap-3 justify-end">
            <Button
              variant="ghost"
              onClick={() => {
                resetForm();
                setIsAddProductOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveProduct}
              className="gradient-primary text-primary-foreground shadow-glow hover:shadow-glow-lg"
            >
              Save Product
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default ContentLibrary;

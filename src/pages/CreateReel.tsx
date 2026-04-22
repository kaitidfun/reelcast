import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Video,
  Wand2,
  Send,
  Check,
  Loader2,
  Brain,
  Film,
  Scissors,
  RefreshCw,
  Hash,
  Play,
  Pause,
  Volume2,
  ShoppingBag,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  Folder,
  Paperclip,
  X,
  Shuffle,
  Maximize2,
  Clock,
  Camera,
  Music2,
  SlidersHorizontal,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

type LibraryProduct = {
  id: string;
  name: string;
  thumbnail: string;
  highlights: string;
};

type LibraryCampaign = {
  id: string;
  name: string;
  banner: string;
  emoji: string;
  products: LibraryProduct[];
};

const productLibrary: LibraryCampaign[] = [
  {
    id: "summer-2026",
    name: "Summer Sale 2026",
    banner: "from-amber-500/40 via-orange-500/30 to-pink-500/40",
    emoji: "🏖️",
    products: [
      { id: "p1", name: "Summer Dress Collection", thumbnail: "🏖️", highlights: "Lightweight fabric, breezy fit, 5 pastel colors for summer outings" },
      { id: "p2", name: "Fashion Lookbook SS26", thumbnail: "👗", highlights: "Curated SS26 looks, mix-and-match outfits for every occasion" },
      { id: "p3", name: "Beach Tote Bag", thumbnail: "👜", highlights: "Roomy interior, water-resistant canvas, perfect beach companion" },
    ],
  },
  {
    id: "accessories",
    name: "Accessories Launch",
    banner: "from-yellow-500/40 via-amber-400/30 to-rose-500/40",
    emoji: "⌚",
    products: [
      { id: "p4", name: "Minimal Watch — Gold", thumbnail: "⌚", highlights: "Sapphire glass, 18K gold plating, quiet quartz movement" },
      { id: "p5", name: "Leather Wallet Slim", thumbnail: "👛", highlights: "Full-grain leather, RFID-blocking, fits 8 cards" },
      { id: "p6", name: "Sunglasses Aviator", thumbnail: "🕶️", highlights: "UV400 protection, polarized, lightweight titanium frame" },
    ],
  },
  {
    id: "beauty-week",
    name: "Beauty Week",
    banner: "from-pink-500/40 via-fuchsia-500/30 to-purple-500/40",
    emoji: "💄",
    products: [
      { id: "p7", name: "Skincare Bundle Set", thumbnail: "🧴", highlights: "Cleanser, serum & moisturizer — clinically tested glow routine" },
      { id: "p8", name: "Lip Tint Trio", thumbnail: "💄", highlights: "Long-wear formula, 3 viral shades, buildable color" },
    ],
  },
  {
    id: "tech-deals",
    name: "Tech Deals",
    banner: "from-sky-500/40 via-indigo-500/30 to-violet-500/40",
    emoji: "🎧",
    products: [
      { id: "p9", name: "Wireless Earbuds Pro", thumbnail: "🎧", highlights: "Active noise cancelling, 30h battery, hi-res audio" },
      { id: "p10", name: "Portable Charger 20K", thumbnail: "🔋", highlights: "20,000mAh, 65W fast charge, charges laptop & phone" },
      { id: "p11", name: "Smart Desk Lamp", thumbnail: "💡", highlights: "Adaptive brightness, 5 color modes, USB-C charging port" },
    ],
  },
];

type GenerationStatus = "idle" | "generating" | "done";

const promptTemplates = [
  { label: "🛍️ Product Showcase", prompt: "Create a 30-second cinematic Reel showcasing a premium wireless headphone. Highlight its sleek design, noise cancellation feature, and long battery life. Use smooth transitions and upbeat background music." },
  { label: "🔥 Flash Sale", prompt: "Generate an urgent, fast-paced Reel for a 24-hour flash sale on skincare products. Include countdown visuals, bold text overlays with discount percentages, and energetic transitions." },
  { label: "✨ New Arrival", prompt: "Create a stylish unboxing-style Reel for a new summer dress collection. Show the fabric texture, color options, and styling tips. Use soft lighting and trendy music." },
  { label: "📦 Bundle Deal", prompt: "Make a Reel promoting a bundle deal: buy 2 get 1 free on fitness accessories. Show each product briefly, then the bundle together. Add price comparison text overlay." },
  { label: "⭐ Review Highlight", prompt: "Create a Reel compiling top 5-star customer reviews for a bestselling watch. Display review quotes with product shots and satisfied customer vibes." },
  { label: "🎯 How-To / Tutorial", prompt: "Generate a quick tutorial Reel showing 3 ways to style a minimal gold necklace for different occasions: casual, office, and evening. Use split-screen transitions." },
];

const surpriseIdeas = [
  "An ASMR-style macro shot of skincare serum dripping onto a velvet petal, slow-motion 120fps, soft golden hour lighting.",
  "A neon-soaked Tokyo street at night, model walking toward camera in our jacket, anamorphic lens flares, 35mm cinematic look.",
  "A floating product on a mirror-glass surface, smoke wisps curling around it, dramatic studio lighting, premium luxury vibe.",
  "Fast-cut montage: unboxing → close-up details → lifestyle scene → happy customer reaction, upbeat trending music.",
  "Dreamy pastel sunrise on a beach, product placed on white sand, gentle wave motion, soft lo-fi background, relaxing aesthetic.",
];

const aspectOptions = [
  { value: "9:16", label: "9:16 Reel", icon: "▮" },
  { value: "1:1", label: "1:1 Square", icon: "■" },
  { value: "16:9", label: "16:9 Landscape", icon: "▬" },
];

const styleOptions = [
  { value: "cinematic", label: "Cinematic B-Roll" },
  { value: "showcase", label: "Product Showcase" },
  { value: "lifestyle", label: "Lifestyle" },
  { value: "minimal", label: "Minimalist" },
  { value: "ugc", label: "UGC / Authentic" },
];

const durationOptions = [15, 30, 60];

const resolutionOptions = [
  { value: "480p", label: "480p", multi: 0 },
  { value: "720p", label: "720p", multi: 2 },
  { value: "1080p", label: "1080p HD", multi: 5 },
];

const cameraOptions = [
  { value: "auto", label: "Auto" },
  { value: "static", label: "Static" },
  { value: "pan-left", label: "Pan Left" },
  { value: "pan-right", label: "Pan Right" },
  { value: "zoom-in", label: "Zoom In" },
  { value: "zoom-out", label: "Zoom Out" },
  { value: "dolly", label: "Dolly Forward" },
];

const musicOptions = [
  { value: "trendy", label: "Trendy & Upbeat" },
  { value: "lofi", label: "Lo-Fi Chill" },
  { value: "cinematic", label: "Cinematic" },
  { value: "none", label: "No Music" },
];

const lightingOptions = [
  { value: "auto", label: "Auto" },
  { value: "cinematic", label: "Cinematic" },
  { value: "studio", label: "Studio" },
  { value: "natural", label: "Natural" },
  { value: "neon", label: "Neon / Night" },
];

const mockHistory = [
  { id: "h1", emoji: "🏖️", gradient: "from-amber-500/40 via-orange-500/30 to-pink-500/40", duration: "0:15" },
  { id: "h2", emoji: "💄", gradient: "from-pink-500/40 via-fuchsia-500/30 to-purple-500/40", duration: "0:30" },
  { id: "h3", emoji: "🎧", gradient: "from-sky-500/40 via-indigo-500/30 to-violet-500/40", duration: "0:30" },
  { id: "h4", emoji: "⌚", gradient: "from-yellow-500/40 via-amber-400/30 to-rose-500/40", duration: "0:60" },
];

const CreateReel = () => {
  const { toast } = useToast();

  // Composer state
  const [promptText, setPromptText] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [referencePreview, setReferencePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings state
  const [aspectRatio, setAspectRatio] = useState("9:16");
  const [videoStyle, setVideoStyle] = useState("cinematic");
  const [duration, setDuration] = useState(30);
  const [resolution, setResolution] = useState("720p");
  const [cameraMotion, setCameraMotion] = useState("auto");
  const [lighting, setLighting] = useState("auto");
  const [bgMusic, setBgMusic] = useState("trendy");
  const [voiceover, setVoiceover] = useState(true);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [seed, setSeed] = useState("");

  // Output / preview state
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [caption, setCaption] = useState("Ready for summer? Check out our new arrival! ✨🏖️ #SummerVibes #MustHave #ReelCast #ShopNow");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["yt", "tt", "fb", "ig"]);
  const [showLogo, setShowLogo] = useState(true);
  const [showProduct, setShowProduct] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [credits] = useState(120);

  // Product picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LibraryProduct | null>(null);
  const [pickerView, setPickerView] = useState<"campaigns" | "products">("campaigns");
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const activeCampaign = productLibrary.find((c) => c.id === activeCampaignId) ?? null;

  // Dynamic credit cost: base + duration + resolution + voiceover
  const generateCost = useMemo(() => {
    const base = 3;
    const durationCost = duration === 15 ? 0 : duration === 30 ? 2 : 5;
    const resCost = resolutionOptions.find((r) => r.value === resolution)?.multi ?? 0;
    const voCost = voiceover ? 2 : 0;
    return base + durationCost + resCost + voCost;
  }, [duration, resolution, voiceover]);

  const platformOptions = [
    { id: "yt", label: "YouTube Shorts", icon: "🎬" },
    { id: "tt", label: "TikTok", icon: "🎵" },
    { id: "fb", label: "Facebook", icon: "📘" },
    { id: "ig", label: "Instagram", icon: "📸" },
  ];

  const generationTasks = [
    { label: "Gemini analyzes product highlights", icon: Brain, detail: "Gemini 1.5 Pro" },
    { label: "Gemini generates Script & Caption", icon: Hash, detail: "Platform-specific captions" },
    { label: "Veo generates B-Roll video", icon: Film, detail: "Google Veo" },
    { label: "FFmpeg composes product overlay", icon: Scissors, detail: "Product Image + Brand Logo" },
  ];

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const openPicker = () => {
    setPickerView("campaigns");
    setActiveCampaignId(null);
    setPickerOpen(true);
  };

  const handleEnhancePrompt = () => {
    if (!promptText.trim()) {
      toast({ title: "Add a prompt first", description: "Type a brief idea before enhancing." });
      return;
    }
    setEnhancing(true);
    setTimeout(() => {
      setPromptText(
        `Create a cinematic ${duration}-second vertical Reel: ${promptText.trim()}. Use dynamic camera moves, premium lighting, hero product close-ups, vibrant color grading, and crisp on-screen text overlays that highlight key benefits. End with a strong call-to-action.`,
      );
      setEnhancing(false);
      toast({ title: "Prompt enhanced ✨", description: "Refined into a professional creative brief." });
    }, 900);
  };

  const handleSurprise = () => {
    const idea = surpriseIdeas[Math.floor(Math.random() * surpriseIdeas.length)];
    setPromptText(idea);
    toast({ title: "Surprise! 🎲", description: "Generated a fresh creative idea for you." });
  };

  const handleAttachReference = () => fileInputRef.current?.click();

  const handleReferenceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReferenceFile(file);
    if (file.type.startsWith("image/") || file.type.startsWith("video/")) {
      const url = URL.createObjectURL(file);
      setReferencePreview(url);
    } else {
      setReferencePreview(null);
    }
    toast({ title: "Reference attached", description: file.name });
  };

  const removeReference = () => {
    if (referencePreview) URL.revokeObjectURL(referencePreview);
    setReferenceFile(null);
    setReferencePreview(null);
  };

  const handleGenerate = () => {
    if (!selectedProduct) {
      toast({ title: "Select a product", description: "Pick a product from your library — required to generate a Reel." });
      return;
    }
    if (!promptText.trim()) {
      toast({ title: "Describe your Reel", description: "Write a prompt describing the Reel you want." });
      return;
    }
    setGenerationStatus("generating");
    setTimeout(() => {
      setGenerationStatus("done");
      toast({ title: "Reel created successfully!", description: "Ready to preview and approve" });
    }, 3000);
  };

  const handleRegenerate = () => {
    setGenerationStatus("generating");
    setTimeout(() => {
      setGenerationStatus("done");
      setCaption("🛍️ Must-have alert! Premium quality at an unbeatable price ✅ #BestDeal #Trending #ReelCast");
      toast({ title: "Regeneration complete!", description: "New version is ready" });
    }, 2500);
  };

  const handleApprove = () => toast({ title: "Approved & Saved!", description: "Reel saved to your library 🎉" });

  const handlePublish = () => {
    const names = platformOptions.filter((p) => selectedPlatforms.includes(p.id)).map((p) => p.label);
    toast({ title: "Published!", description: `Reel has been distributed to ${names.join(", ")} 🎉` });
  };

  const aspectLabel = aspectOptions.find((a) => a.value === aspectRatio)?.label ?? aspectRatio;
  const styleLabel = styleOptions.find((s) => s.value === videoStyle)?.label ?? videoStyle;
  const cameraLabel = cameraOptions.find((c) => c.value === cameraMotion)?.label ?? cameraMotion;
  const musicLabel = musicOptions.find((m) => m.value === bgMusic)?.label ?? bgMusic;

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Create Reel</h1>
          <p className="mt-1 text-muted-foreground">Describe what you want — AI handles the rest. Powered by Gemini + Veo.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-muted-foreground backdrop-blur">
          <span className="size-1.5 rounded-full bg-success animate-pulse" />
          Engine online
          <span className="mx-1 h-3 w-px bg-border" />
          <span className="text-foreground">⚡ {credits}</span> credits
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ============ LEFT: Composer (Sora-style monolith) ============ */}
        <div className="lg:col-span-3 space-y-5">
          {/* THE MONOLITH */}
          <div className="relative rounded-3xl border border-border bg-card shadow-elevated overflow-hidden group focus-within:border-primary/30 transition-colors">
            {/* subtle glow */}
            <div className="pointer-events-none absolute inset-0 opacity-0 group-focus-within:opacity-100 transition-opacity duration-700"
                 style={{ background: "radial-gradient(ellipse at top, hsl(var(--primary) / 0.08), transparent 60%)" }} />

            {/* Reference chip (optional, attached on top of prompt) */}
            {referenceFile && (
              <div className="px-5 pt-4">
                <div className="inline-flex items-center gap-2 rounded-xl border border-border bg-muted/60 p-2 pr-3 max-w-full">
                  <div className="h-10 w-10 shrink-0 rounded-lg overflow-hidden bg-muted ring-1 ring-border flex items-center justify-center">
                    {referencePreview && referenceFile.type.startsWith("image/") ? (
                      <img src={referencePreview} alt="reference" className="h-full w-full object-cover" />
                    ) : referencePreview && referenceFile.type.startsWith("video/") ? (
                      <video src={referencePreview} className="h-full w-full object-cover" muted />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate max-w-[200px]">{referenceFile.name}</p>
                    <p className="text-[10px] text-muted-foreground">Style reference · optional</p>
                  </div>
                  <button
                    type="button"
                    onClick={removeReference}
                    className="ml-1 rounded-full p-1 text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                    aria-label="Remove reference"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* Selected product chip */}
            {selectedProduct && (
              <div className="px-5 pt-4">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/5 py-1 pl-1 pr-2 max-w-full">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-accent/20 text-sm">
                    {selectedProduct.thumbnail}
                  </div>
                  <span className="text-xs font-medium text-foreground truncate max-w-[200px]">{selectedProduct.name}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Remove product"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            )}

            {/* Prompt textarea */}
            <div className="px-5 pt-4 pb-2">
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Describe the Reel you want to create — scene, mood, motion, style, product details…"
                className="min-h-[160px] w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>

            {/* Chip toolbar */}
            <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
              {/* Attach reference */}
              <button
                type="button"
                onClick={handleAttachReference}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
              >
                <Paperclip className="h-3.5 w-3.5" />
                Reference
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                hidden
                onChange={handleReferenceChange}
              />

              {/* Product library */}
              <button
                type="button"
                onClick={openPicker}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 hover:bg-primary/5 transition-colors"
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {selectedProduct ? "Change product" : "Product library"}
              </button>

              {/* Aspect popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    <Maximize2 className="h-3.5 w-3.5" />
                    {aspectLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Aspect ratio</p>
                  {aspectOptions.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setAspectRatio(o.value)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent ${aspectRatio === o.value ? "text-primary" : "text-foreground"}`}
                    >
                      <span className="flex items-center gap-2"><span className="font-mono">{o.icon}</span>{o.label}</span>
                      {aspectRatio === o.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Style popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    <Sparkles className="h-3.5 w-3.5" />
                    {styleLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-2">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Style</p>
                  {styleOptions.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setVideoStyle(o.value)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent ${videoStyle === o.value ? "text-primary" : "text-foreground"}`}
                    >
                      {o.label}
                      {videoStyle === o.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Duration popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    <Clock className="h-3.5 w-3.5" />
                    {duration}s
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-44 p-2">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</p>
                  {durationOptions.map((d) => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent ${duration === d ? "text-primary" : "text-foreground"}`}
                    >
                      {d} seconds
                      {duration === d && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Camera popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    <Camera className="h-3.5 w-3.5" />
                    {cameraLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-52 p-2">
                  <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Camera motion</p>
                  {cameraOptions.map((o) => (
                    <button
                      key={o.value}
                      onClick={() => setCameraMotion(o.value)}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent ${cameraMotion === o.value ? "text-primary" : "text-foreground"}`}
                    >
                      {o.label}
                      {cameraMotion === o.value && <Check className="h-3.5 w-3.5" />}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>

              {/* Audio popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    <Music2 className="h-3.5 w-3.5" />
                    {musicLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3 space-y-3">
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Background music</p>
                    {musicOptions.map((o) => (
                      <button
                        key={o.value}
                        onClick={() => setBgMusic(o.value)}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent ${bgMusic === o.value ? "text-primary" : "text-foreground"}`}
                      >
                        {o.label}
                        {bgMusic === o.value && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs text-foreground">AI Voiceover</span>
                    </div>
                    <Switch checked={voiceover} onCheckedChange={setVoiceover} />
                  </div>
                </PopoverContent>
              </Popover>

              {/* Advanced popover */}
              <Popover>
                <PopoverTrigger asChild>
                  <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Advanced
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-3 space-y-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Director controls</p>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Resolution</label>
                    <Select value={resolution} onValueChange={setResolution}>
                      <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {resolutionOptions.map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}{r.multi > 0 ? ` · +${r.multi}cr` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Lighting</label>
                    <Select value={lighting} onValueChange={setLighting}>
                      <SelectTrigger className="h-9 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {lightingOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Negative prompt</label>
                    <Input
                      value={negativePrompt}
                      onChange={(e) => setNegativePrompt(e.target.value)}
                      placeholder="blurry, low quality, watermark…"
                      className="h-9 rounded-lg text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-medium text-muted-foreground">Seed (optional)</label>
                    <Input
                      value={seed}
                      onChange={(e) => setSeed(e.target.value.replace(/[^0-9]/g, ""))}
                      placeholder="e.g. 482915 — for reproducible results"
                      className="h-9 rounded-lg text-xs font-mono"
                    />
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Action bar (footer of monolith) */}
            <div className="flex items-center justify-between gap-2 border-t border-border bg-background/40 px-3 py-2.5 backdrop-blur">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleEnhancePrompt}
                  disabled={enhancing}
                  className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5"
                >
                  {enhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  Enhance
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleSurprise}
                  className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5"
                >
                  <Shuffle className="h-3.5 w-3.5" />
                  Surprise me
                </Button>
              </div>
              <Button
                onClick={generationStatus === "done" ? handleRegenerate : handleGenerate}
                disabled={generationStatus === "generating"}
                className="gradient-primary h-9 gap-2 px-4 text-sm text-primary-foreground shadow-glow hover:shadow-glow-lg"
              >
                {generationStatus === "generating" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
                ) : generationStatus === "done" ? (
                  <><RefreshCw className="h-4 w-4" />Re-generate <span className="opacity-80 text-xs font-mono">⚡{generateCost}</span></>
                ) : (
                  <><Sparkles className="h-4 w-4" />Generate Video <span className="opacity-80 text-xs font-mono">⚡{generateCost}</span></>
                )}
              </Button>
            </div>
          </div>

          {/* Quick templates strip */}
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1">Quick prompts</p>
            <div className="flex flex-wrap gap-2">
              {promptTemplates.map((t) => (
                <button
                  key={t.label}
                  onClick={() => setPromptText(t.prompt)}
                  className="rounded-full border border-border bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground transition-all"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* History strip */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent outputs</p>
              <button className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground">View all</button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {mockHistory.map((h) => (
                <button
                  key={h.id}
                  className={`relative h-24 w-16 shrink-0 overflow-hidden rounded-xl border border-border bg-gradient-to-br ${h.gradient} flex items-center justify-center text-3xl ring-1 ring-inset ring-white/5 hover:ring-primary/40 hover:-translate-y-0.5 transition-all`}
                  title={`Reel · ${h.duration}`}
                >
                  <span className="drop-shadow">{h.emoji}</span>
                  <span className="absolute bottom-1 left-1 right-1 rounded-md bg-black/50 backdrop-blur px-1 py-0.5 text-[9px] font-mono text-white text-center">{h.duration}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Overlays + platforms (compact card) */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">Output settings</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">Brand Logo</span>
                </div>
                <Switch checked={showLogo} onCheckedChange={setShowLogo} />
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-medium text-foreground">Product Overlay</span>
                </div>
                <Switch checked={showProduct} onCheckedChange={setShowProduct} />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-foreground">Target Platforms</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {platformOptions.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs transition-all ${
                      selectedPlatforms.includes(p.id)
                        ? "border-primary/40 bg-primary/5 text-foreground ring-1 ring-primary/20"
                        : "border-border text-muted-foreground hover:border-primary/20"
                    }`}
                  >
                    <span>{p.icon}</span>
                    <span className="truncate">{p.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Publish */}
          {generationStatus === "done" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
              <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">Publish</h2>
              <p className="text-xs text-muted-foreground">Once approved, distribute your Reel across selected platforms</p>
              <Button onClick={handlePublish} className="gradient-primary w-full gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-11">
                <Send className="h-4 w-4" />
                Publish to {selectedPlatforms.length} platforms
              </Button>
            </motion.div>
          )}
        </div>

        {/* ============ RIGHT: Preview (kept) ============ */}
        <div className="lg:col-span-2 space-y-5">
          {/* Balance reminder */}
          <div className="flex items-center justify-between rounded-2xl border border-border bg-card/60 px-4 py-2.5 text-xs">
            <span className="text-muted-foreground">Estimated cost</span>
            <span className="font-mono text-foreground">⚡ {generateCost} <span className="text-muted-foreground">/ {credits}</span></span>
          </div>

          {/* AI Pipeline Progress */}
          {generationStatus !== "idle" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">AI Pipeline</h3>
              <div className="space-y-3">
                {generationTasks.map((task, i) => {
                  const isDone = generationStatus === "done" || (generationStatus === "generating" && i < 2);
                  const isActive = generationStatus === "generating" && i === 2;
                  const TaskIcon = task.icon;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs shrink-0 ${
                        isDone ? "bg-success/15 ring-1 ring-success/30"
                        : isActive ? "bg-primary/15 ring-1 ring-primary/30"
                        : "bg-muted ring-1 ring-border"
                      }`}>
                        {isDone ? <Check className="h-3.5 w-3.5 text-success" />
                        : isActive ? <Loader2 className="h-3.5 w-3.5 text-primary animate-spin" />
                        : <TaskIcon className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${isDone ? "text-foreground" : isActive ? "text-primary" : "text-muted-foreground"}`}>{task.label}</span>
                        <p className="text-[10px] text-muted-foreground">{task.detail}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Video Preview */}
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card space-y-4">
            <div className="relative aspect-[9/16] w-full overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
              {generationStatus === "done" ? (
                <>
                  <div className="absolute inset-0" style={{
                    backgroundImage: "radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(circle at 70% 75%, hsl(var(--accent) / 0.3), transparent 55%)"
                  }} />
                  {showLogo && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-2 py-1 shadow-lg">
                      <div className="h-5 w-5 rounded-md gradient-primary flex items-center justify-center">
                        <Sparkles className="h-3 w-3 text-primary-foreground" />
                      </div>
                      <span className="text-[10px] font-bold text-white">REELCAST</span>
                    </div>
                  )}
                  {showProduct && (
                    <div className="absolute bottom-16 left-3 right-3 flex items-center gap-2.5 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 p-2.5 shadow-xl">
                      <div className="h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-2xl">
                        {selectedProduct?.thumbnail ?? <ShoppingBag className="h-5 w-5 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-white truncate">{selectedProduct?.name ?? "Summer Dress Collection"}</p>
                        <p className="text-[10px] text-white/70">Tap to shop · $49.99</p>
                      </div>
                    </div>
                  )}
                  <button
                    onClick={() => setIsPlaying((p) => !p)}
                    className="absolute inset-0 flex items-center justify-center group"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/20 group-hover:bg-white/25 transition-all">
                      {isPlaying ? <Pause className="h-6 w-6 text-white" /> : <Play className="h-6 w-6 text-white ml-0.5" />}
                    </div>
                  </button>
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setIsPlaying((p) => !p)} className="text-white shrink-0" aria-label="Toggle play">
                        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <span className="text-[10px] text-white/80 font-mono">0:08</span>
                      <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full w-1/3 rounded-full bg-white" />
                      </div>
                      <span className="text-[10px] text-white/80 font-mono">0:{duration.toString().padStart(2, "0")}</span>
                      <Volume2 className="h-3.5 w-3.5 text-white shrink-0" />
                    </div>
                  </div>
                </>
              ) : generationStatus === "generating" ? (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
                  <div className="relative">
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted-foreground/10">
                      <Wand2 className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
                    </div>
                    <div className="absolute -inset-3 animate-pulse rounded-2xl gradient-primary opacity-10 blur-xl" />
                  </div>
                  <p className="text-sm text-muted-foreground">Veo is generating B-Roll…</p>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted-foreground/10">
                    <Video className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground max-w-[28ch]">Awaiting command. Describe your Reel and hit Generate.</p>
                  <div className="absolute top-3 left-3 w-3 h-3 border-t border-l border-white/10" />
                  <div className="absolute top-3 right-3 w-3 h-3 border-t border-r border-white/10" />
                  <div className="absolute bottom-3 left-3 w-3 h-3 border-b border-l border-white/10" />
                  <div className="absolute bottom-3 right-3 w-3 h-3 border-b border-r border-white/10" />
                </div>
              )}
            </div>

            {generationStatus === "done" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <label className="text-xs font-medium text-foreground">AI Caption & Hashtags (Gemini)</label>
                </div>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={4}
                  className="bg-muted/50 border-border resize-none text-xs"
                />
                <p className="text-[10px] text-muted-foreground">Editable — tweak before approving</p>
              </motion.div>
            )}

            {generationStatus === "done" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-2 gap-2">
                <Button variant="outline" onClick={handleRegenerate} className="gap-2 h-11">
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </Button>
                <Button onClick={handleApprove} className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-11">
                  <Check className="h-4 w-4" />
                  Approve & Save
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Product Picker Dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              Select Product
            </DialogTitle>
            <DialogDescription>
              {pickerView === "campaigns" ? "Pick a campaign folder to browse its products." : "Choose a product to feature in this Reel."}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto -mx-6 px-6 pb-1">
            {pickerView === "campaigns" && (
              <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Browse Campaigns</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {productLibrary.map((campaign) => (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => { setActiveCampaignId(campaign.id); setPickerView("products"); }}
                      className="group rounded-lg border border-border bg-card overflow-hidden text-left cursor-pointer transition-all hover:ring-2 hover:ring-primary hover:-translate-y-0.5 hover:shadow-glow"
                    >
                      <div className={`h-24 w-full bg-gradient-to-br ${campaign.banner} flex items-center justify-center text-4xl`}>
                        <span className="drop-shadow-sm">{campaign.emoji}</span>
                      </div>
                      <div className="p-3 space-y-1">
                        <p className="font-semibold text-sm text-foreground truncate group-hover:text-primary transition-colors">{campaign.name}</p>
                        <div className="flex items-center gap-1.5">
                          <Folder className="h-3 w-3 text-muted-foreground" />
                          <span className="text-[11px] text-muted-foreground">{campaign.products.length} Products</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {pickerView === "products" && activeCampaign && (
              <div className="space-y-3">
                <div className="flex items-center">
                  <ChevronLeft
                    className="w-5 h-5 mr-2 cursor-pointer hover:text-primary transition-colors text-muted-foreground"
                    onClick={() => { setPickerView("campaigns"); setActiveCampaignId(null); }}
                  />
                  <div className={`h-10 w-10 rounded-md bg-gradient-to-br ${activeCampaign.banner} flex items-center justify-center text-xl mr-2.5`}>
                    {activeCampaign.emoji}
                  </div>
                  <div>
                    <h3 className="font-display font-semibold text-foreground">{activeCampaign.name}</h3>
                    <p className="text-[11px] text-muted-foreground">{activeCampaign.products.length} products in this campaign</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {activeCampaign.products.map((product) => {
                    const isSelected = selectedProduct?.id === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => { setSelectedProduct(product); setPickerOpen(false); }}
                        className={`flex gap-3 p-3 rounded-lg border text-left transition-all hover:bg-accent cursor-pointer ${
                          isSelected ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20" : "border-border bg-card"
                        }`}
                      >
                        <div className="h-12 w-12 shrink-0 rounded-md bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center text-2xl">
                          {product.thumbnail}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm text-foreground truncate">{product.name}</p>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{product.highlights}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CreateReel;

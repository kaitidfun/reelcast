"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Sparkles,
  Video,
  Wand2,
  Send,
  Check,
  Loader2,
  Film,
  RefreshCw,
  Play,
  Pause,
  Volume2,
  VolumeX,
  ShoppingBag,
  FolderOpen,
  ChevronRight,
  ChevronLeft,
  Folder,
  X,
  Expand,
  Clock,
  Upload,
  Lightbulb,
  Brain,
} from "lucide-react";
import { useGenerationQueue } from "@/contexts/GenerationQueueContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

type LibraryProduct = {
  id: string;
  name: string;
  thumbnail: string;       // First letter fallback (used when no image available)
  primaryImageUrl: string | null;  // Full public URL from backend (R2 object key resolved)
  brandLogoUrl: string | null;     // Brand logo URL — shown in video preview overlay
  highlights: string;
  campaignName: string;
};

type LibraryCampaign = {
  id: string;
  name: string;
  bannerColor: string;
  bannerUrl: string | null;   // Presigned R2 URL if uploaded, null = use gradient fallback
  emoji: string;
  products: LibraryProduct[];
};

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

// productLibrary mock removed to use real data from backend

type GenerationStatus = "idle" | "generating" | "done";

/**
 * Quick-prompt templates — clicking a chip calls the backend Gemini endpoint
 * to generate a product-specific prompt based on the template type.
 * The `type` key maps directly to `template_type` in POST /api/reels/generate-prompt.
 */
const promptTemplates = [
  { label: "🛍️ Product Showcase", type: "product_showcase" },
  { label: "🔥 Flash Sale",        type: "flash_sale" },
  { label: "✨ New Arrival",        type: "new_arrival" },
  { label: "📦 Bundle Deal",        type: "bundle_deal" },
  { label: "⭐ Review Highlight",   type: "review_highlight" },
  { label: "🎯 How-To / Tutorial",  type: "tutorial" },
];

// 5s and 10s = single Kling clip (cheap/fast for testing); 15/30/60 = Kling+LTX extend hybrid
const durationOptions = [5, 10, 15, 30, 60];

// ─── Guide Me — chip options for each row ────────────────────────────────────
// 6 options per category → grid-cols-3 gives exactly 2 equal rows of 3.
// label = display text AND what Gemini receives.
// description = hover tooltip explaining the option to first-time users.

type GuideOption = { label: string; description: string };

/** Row 1: Mood / Vibe — 6 items → 2 rows × 3 */
const MOOD_OPTIONS: GuideOption[] = [
  { label: "Fun & Energetic",   description: "Bright, fast-paced, upbeat energy. Perfect for products that bring joy or excitement." },
  { label: "Luxury & Premium",  description: "Sophisticated and refined. Deep gold tones conveying exclusivity and high value." },
  { label: "Cute & Warm",       description: "Soft, gentle, and heartwarming. Pastel tones with a cozy, friendly feel." },
  { label: "Dark & Mysterious", description: "Moody shadows and dramatic atmosphere. Intrigue that keeps viewers watching." },
  { label: "Storytelling",      description: "Emotional narrative arc. Draws viewers in with a beginning, conflict, and resolution." },
  { label: "Eco & Natural",     description: "Earth tones and calm energy. Communicates sustainability and natural goodness." },
];

/** Row 2: Target Audience — 6 items → 2 rows × 3 */
const TARGET_OPTIONS: GuideOption[] = [
  { label: "Teens / Gen Z",        description: "Fast cuts, trending sounds, bold text overlays. Speaks their language effortlessly." },
  { label: "Working Adults",       description: "Professional and time-efficient messaging. Highlights quality and convenience." },
  { label: "Female Professionals", description: "Polished, empowering, stylish. Speaks to ambition and modern femininity." },
  { label: "Men 25–40",            description: "Bold and no-nonsense. Quality, performance, and lifestyle credibility." },
  { label: "New Parents",          description: "Warm, safe, and trustworthy. Gentle reassurance for anxious new parents." },
  { label: "Fitness Enthusiasts",  description: "High energy and motivational. Emphasizes performance and transformation." },
];

/** Row 3: Visual Style — 6 items → 2 rows × 3 */
const STYLE_OPTIONS: GuideOption[] = [
  { label: "Cinematic",       description: "Sweeping camera movements and professional lighting. Feels like a movie trailer." },
  { label: "UGC / Authentic", description: "Handheld, real-person footage. Genuine and relatable — like a friend's recommendation." },
  { label: "Minimal & Clean", description: "Simple compositions, clean lines, and restrained design. Lets the product speak." },
  { label: "Trendy / Viral",  description: "Jump cuts, text overlays, trending audio. Optimised for algorithm-friendly virality." },
  { label: "Vintage / Retro", description: "Film grain, warm tones, and nostalgic aesthetics. Evokes warmth and authenticity." },
  { label: "Dark / Moody",    description: "Low-key lighting, rich shadows, and editorial composition. Mysterious and luxurious." },
];

/** Row 4: Scene / Key Focus — 6 items → 2 rows × 3 */
const FOCUS_OPTIONS: GuideOption[] = [
  { label: "Unboxing",       description: "The reveal moment — opening packaging, first impressions, that satisfying first look." },
  { label: "Product Demo",   description: "Hands-on demonstration showing exactly how the product works and why it's better." },
  { label: "Lifestyle",      description: "Product naturally integrated into real-life moments. Shows how it fits your world." },
  { label: "Before & After", description: "Side-by-side transformation. Visually proves the product's effectiveness." },
  { label: "Testimonial",    description: "Real customer speaks authentically. Social proof that builds trust and credibility." },
  { label: "Brand Story",    description: "The 'why' behind the brand. Emotional connection through origin and mission." },
];

/** Row 5: Lighting & Environment — 6 items → 2 rows × 3 */
const LIGHTING_OPTIONS: GuideOption[] = [
  { label: "Golden Hour",          description: "The magic hour just after sunrise or before sunset. Warm amber tones bathing everything in soft gold." },
  { label: "Studio White",         description: "Clean, controlled studio lighting. Bright and neutral — makes product colors pop with accuracy." },
  { label: "Neon / Cyberpunk",     description: "Electric neon lights in purple, cyan, and pink. Futuristic night-city vibes." },
  { label: "Natural Outdoor",      description: "Bright daylight outdoors. Fresh, clean, and organic — the world as a natural studio." },
  { label: "Dark Dramatic",        description: "Minimal light, deep shadows, single key-light. Creates intensity and mystery." },
  { label: "Backlit / Silhouette", description: "Light source placed behind the subject. Creates glowing outlines and artistic silhouettes." },
];

// ─── Platform icons (inline SVG — lucide-react has no brand icons) ────────────
const PlatformIcon = ({ id }: { id: string }) => {
  switch (id) {
    case "yt": return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
        <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/>
      </svg>
    );
    case "tt": return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z"/>
      </svg>
    );
    case "fb": return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
        <path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.27h3.32l-.53 3.49h-2.79V24C19.62 23.1 24 18.1 24 12.07z"/>
      </svg>
    );
    case "ig": return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
      </svg>
    );
    default: return null;
  }
};



const CreateReel = () => {
  const { toast } = useToast();
  const { startGeneration, markDone, markFailed } = useGenerationQueue();

  const [productLibrary, setProductLibrary] = useState<LibraryCampaign[]>([]);

  useEffect(() => {
    const fetchLibrary = async () => {
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

          const mappedCampaigns: LibraryCampaign[] = campData.campaigns.map((c: any) => ({
            id: c.campaign_id,
            name: c.name,
            bannerColor: c.banner_color || "Twilight",
            bannerUrl: c.banner_url ?? null,  // Presigned URL from backend computed_field
            emoji: c.name.charAt(0).toUpperCase() || "📦",
            products: prodData.products.filter((p: any) => p.campaign_id === c.campaign_id).map((p: any) => {
              // Match library/page.tsx URL construction — proxy endpoint reliably serves R2 content
              // regardless of whether presigned URLs or R2_PUBLIC_URL are configured
              const rawImageKey = p.images?.find((img: any) => img.is_primary)?.image_url
                               || p.images?.[0]?.image_url;
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
            })
          }));
          setProductLibrary(mappedCampaigns);
        }
      } catch (e) {
        console.error("Failed to load library:", e);
      }
    };
    fetchLibrary();
  }, []);

  // Composer state
  const [promptText, setPromptText] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  /** Tracks which quick-prompt chip is currently loading (template type string) */
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Settings state
  const [duration, setDuration] = useState(5);  // Default 5s — cheapest single Kling clip for testing
  // overlayPosition kept as hidden state (sent to API, defaulted to bottom-right)
  const [overlayPosition] = useState("bottom-right");

  // Output / preview state
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["yt", "tt", "fb", "ig"]);
  // Overlay preview toggles — UI-only, does not affect the baked video from backend
  const [showLogo, setShowLogo] = useState(true);
  const [showProduct, setShowProduct] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [reelId, setReelId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Video playback tracking (for real-time seek bar + fullscreen)
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const playIconTimerRef = useRef<NodeJS.Timeout | null>(null);
  const videoRefFullscreen = useRef<HTMLVideoElement>(null);

  // Elapsed timer — counts up from 0 while generating; freezes (doesn't reset) on done/fail
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // Stores the final elapsed time after generation completes (for "Generated in X:XX" label)
  const [generationTime, setGenerationTime] = useState<number | null>(null);

  // Video mute state — starts unmuted so uploaded videos with audio play immediately.
  // AI-generated videos (LTX/fal.ai) have no audio track so unmuted makes no difference for them.
  const [videoMuted, setVideoMuted] = useState(false);

  /**
   * Feature 2: Creator mode toggle (F2-URS02 vs F2-URS04)
   * - "generate": User inputs prompt → AI generates video (Veo/fal.ai) + Gemini captions
   * - "upload": User selects video file → validate → upload to R2 → apply overlay + captions
   * Both modes share: product selection, platform choice, overlay position
   */
  const [creatorMode, setCreatorMode] = useState<"generate" | "upload">("generate");

  /** Upload flow state (upload mode only): file selection, progress tracking, status */
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const uploadInputRef = useRef<HTMLInputElement>(null);

  /**
   * Guided Prompt state — 4 rows of chips help users who don't know what to write.
   * Any combination of selections builds an enriched AI prompt automatically.
   */
  const [guidedMode, setGuidedMode] = useState(false);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<string | null>(null);
  const [selectedLighting, setSelectedLighting] = useState<string | null>(null);
  /** Hovered Guide Me option — drives the floating cursor tooltip */
  const [hoveredOption, setHoveredOption] = useState<{ label: string; description: string } | null>(null);
  /** Cursor position for the floating tooltip, updated on every mousemove over a chip */
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  /** True while waiting for Gemini to return the guided prompt */
  const [guidedLoading, setGuidedLoading] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (generationStatus === "generating" && reelId) {
      interval = setInterval(async () => {
        try {
          const token = localStorage.getItem("rf_token");
          const res = await fetch(`http://localhost:8000/api/reels/${reelId}/status`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          // Session expired — stop polling and prompt re-login
          if (res.status === 401) {
            clearInterval(interval);
            setGenerationStatus("idle");
            toast({ title: "Session expired", description: "Please log out and log in again.", variant: "destructive" });
            return;
          }
          if (res.ok) {
            const data = await res.json();
            if (data.status === "Completed") {
              setGenerationStatus("done");
              // Calculate final elapsed from start time directly — avoids stale closure on elapsedSeconds
              setGenerationTime(generationStartTime ? Math.floor((Date.now() - generationStartTime) / 1000) : 0);
              if (data.final_commercial_video_url) {
                const rawUrl: string = data.final_commercial_video_url;
                // fal.ai / Veo return full CDN URLs; R2 uploads return object keys.
                // Proxy R2 keys through the backend video endpoint for reliable playback.
                const resolvedUrl = rawUrl.startsWith("http")
                  ? rawUrl
                  : `http://localhost:8000/api/upload/videos/${rawUrl}`;
                setVideoUrl(resolvedUrl);
                setIsPlaying(true);   // Auto-play as soon as the generated video is ready
              }
              if (data.caption_and_hashtags) {
                setCaption(data.caption_and_hashtags.caption + "\n\n" + (data.caption_and_hashtags.hashtags?.join(" ") || ""));
              }
              // Sync completion to global context (stops background polling, enables status bar)
              markDone(data.final_commercial_video_url ?? undefined);
              toast({ title: "Reel created!", description: "Ready to preview and approve" });
              clearInterval(interval);
            } else if (data.status === "Failed") {
              setGenerationStatus("idle");
              setGenerationTime(generationStartTime ? Math.floor((Date.now() - generationStartTime) / 1000) : 0);
              // Sync failure to global context
              markFailed();
              toast({ title: "Generation Failed", description: data.error_message || "Something went wrong.", variant: "destructive" });
              clearInterval(interval);
            }
          }
        } catch (e) {
          console.error(e);
        }
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [generationStatus, reelId, toast, generationStartTime]);

  // Control actual video playback (main + fullscreen video stay in sync)
  useEffect(() => {
    const vid = videoRef.current;
    if (vid) { isPlaying ? vid.play().catch(() => {}) : vid.pause(); }
    const vidFs = videoRefFullscreen.current;
    if (vidFs) { isPlaying ? vidFs.play().catch(() => {}) : vidFs.pause(); }
  }, [isPlaying]);

  // Sync muted state via DOM — React's muted prop doesn't reliably update on live video elements
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = videoMuted;
    if (videoRefFullscreen.current) videoRefFullscreen.current.muted = videoMuted;
  }, [videoMuted]);

  /** Format seconds as M:SS for seek bar display */
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  /** Toggle play/pause and show flash icon briefly */
  const togglePlay = () => {
    setIsPlaying(p => !p);
    setShowPlayIcon(true);
    if (playIconTimerRef.current) clearTimeout(playIconTimerRef.current);
    playIconTimerRef.current = setTimeout(() => setShowPlayIcon(false), 1200);
  };

  // Elapsed timer — ticks every second while generating
  useEffect(() => {
    if (generationStatus !== "generating" || generationStartTime === null) return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - generationStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [generationStatus, generationStartTime]);

  // Product picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LibraryProduct | null>(null);
  const [pickerView, setPickerView] = useState<"campaigns" | "products">("campaigns");
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const activeCampaign = productLibrary.find((c) => c.id === activeCampaignId) ?? null;

  const platformOptions = [
    { id: "yt", label: "YouTube Shorts", shortLabel: "YT Shorts",  color: "text-red-500",    activeBg: "bg-red-500/10 border-red-500/40 ring-red-500/20"      },
    { id: "tt", label: "TikTok",         shortLabel: "TikTok",     color: "text-foreground", activeBg: "bg-foreground/10 border-foreground/30 ring-foreground/20" },
    { id: "fb", label: "Facebook",       shortLabel: "Facebook",   color: "text-blue-500",   activeBg: "bg-blue-500/10 border-blue-500/40 ring-blue-500/20"   },
    { id: "ig", label: "Instagram",      shortLabel: "Instagram",  color: "text-pink-500",   activeBg: "bg-pink-500/10 border-pink-500/40 ring-pink-500/20"   },
  ];

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const openPicker = () => {
    setPickerView("campaigns");
    setActiveCampaignId(null);
    setPickerOpen(true);
  };

  /**
   * Sends current prompt text to Gemini via backend to produce a more cinematic,
   * production-ready brief. Preserves the user's core idea.
   */
  const handleEnhancePrompt = async () => {
    if (!promptText.trim()) {
      toast({ title: "Add a prompt first", description: "Type a brief idea before enhancing." });
      return;
    }
    setEnhancing(true);
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch("http://localhost:8000/api/reels/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt_text: promptText,
          product_id: selectedProduct?.id ?? null,
          duration,
        }),
      });
      if (!res.ok) throw new Error("Enhancement request failed");
      const data = await res.json();
      setPromptText(data.prompt);
      toast({ title: "Prompt enhanced ✨", description: "Refined into a professional creative brief." });
    } catch (e) {
      toast({ title: "Enhancement failed", description: "Could not reach AI service.", variant: "destructive" });
    } finally {
      setEnhancing(false);
    }
  };

  /**
   * Generates a contextual prompt for the given template type using Gemini.
   * Called when user clicks a quick-prompt chip — uses selected product info as context.
   */
  const handleQuickPrompt = async (templateType: string) => {
    if (!selectedProduct) {
      toast({ title: "Select a product first", description: "Quick prompts are personalised to your product — pick one above." });
      return;
    }
    setLoadingTemplate(templateType);
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch("http://localhost:8000/api/reels/generate-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          template_type: templateType,
          product_id: selectedProduct.id,
          duration,
        }),
      });
      if (!res.ok) throw new Error("Prompt generation failed");
      const data = await res.json();
      setPromptText(data.prompt);
      toast({ title: "Prompt generated ✨", description: "Personalised to your product — edit if needed." });
    } catch (e) {
      toast({ title: "Generation failed", description: "Could not reach AI service.", variant: "destructive" });
    } finally {
      setLoadingTemplate(null);
    }
  };

  /**
   * Guided Prompt: send chip selections + product details (image + description)
   * to the backend, which forwards them to Gemini (multimodal) for a rich,
   * production-ready video prompt. Falls back gracefully if the API fails.
   */
  const handleBuildGuidedPrompt = async () => {
    // Product is required — Gemini uses its images and description for a richer prompt
    if (!selectedProduct) {
      toast({ title: "Select a product first", description: "Auto-Build uses your product details to personalise the prompt." });
      return;
    }
    const hasAnySelection = selectedMood || selectedTarget || selectedStyle || selectedFocus || selectedLighting;
    if (!hasAnySelection) {
      toast({ title: "Pick at least one option", description: "Select any card from the rows below to build a prompt." });
      return;
    }

    setGuidedLoading(true);
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch("http://localhost:8000/api/reels/generate-guided-prompt", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          mood:       selectedMood     ?? undefined,
          target:     selectedTarget   ?? undefined,
          style:      selectedStyle    ?? undefined,
          focus:      selectedFocus    ?? undefined,
          lighting:   selectedLighting ?? undefined,
          product_id: selectedProduct?.id ?? undefined,
          duration,
        }),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPromptText((data.prompt as string).slice(0, 500));

      // Keep all chip selections intact so user can tweak and rebuild without re-picking
      // (user can manually clear via "Clear all" button or individual chip toggles)
      toast({ title: "Prompt built ✨", description: "Ready to generate — feel free to edit it first." });
    } catch (err) {
      console.error("Guided prompt generation failed:", err);
      toast({ title: "Could not build prompt", description: "Something went wrong — please try again.", variant: "destructive" });
    } finally {
      setGuidedLoading(false);
    }
  };

  const handleGenerate = async () => {
    if (!selectedProduct) {
      toast({ title: "Select a product", description: "Pick a product from your library — required to generate a Reel." });
      return;
    }
    if (!promptText.trim()) {
      toast({ title: "Describe your Reel", description: "Write a prompt describing the Reel you want." });
      return;
    }
    setGenerationStatus("generating");
    setGenerationStartTime(Date.now());
    setElapsedSeconds(0);
    // Clear previous result so the player doesn't show stale content during generation
    setVideoUrl(null);
    setIsPlaying(false);

    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch("http://localhost:8000/api/reels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt_text: promptText,
          product_id: selectedProduct.id,
          platform: selectedPlatforms[0] || "ig",
          overlay_position: overlayPosition,
          duration: duration,
        })
      });
      if (!res.ok) throw new Error("Failed to start generation");
      const data = await res.json();
      setReelId(data.reel_id);
      // Notify global context so background polling + status bar work when user navigates away
      startGeneration(data.reel_id, selectedProduct.name);
    } catch (e: any) {
      setGenerationStatus("idle");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRegenerate = async (target: "video" | "caption" | "all") => {
    if (!reelId) return;
    setGenerationStatus("generating");
    // Reset timer for the new generation run (fixes timer counting from old value)
    setGenerationStartTime(Date.now());
    setElapsedSeconds(0);
    setGenerationTime(null);
    setVideoUrl(null);    // Clear stale video during regeneration
    setIsPlaying(false);
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch(`http://localhost:8000/api/reels/${reelId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          target,
          platform: selectedPlatforms[0] || "ig",
          overlay_position: overlayPosition,
          // Send current duration — not backend default (fixes wrong duration on regen)
          duration,
          // Send current prompt — user may have edited it before clicking Re-generate
          prompt_text: target !== "caption" ? promptText : undefined,
        })
      });
      if (!res.ok) throw new Error("Failed to start regeneration");
      toast({ title: "Regenerating...", description: `Regenerating ${target} now.` });
    } catch (e: any) {
      setGenerationStatus("idle");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  /**
   * F2-URS04: Upload member's own video for processing.
   * Validates file (format/size/duration), uploads to R2, queues caption+overlay generation.
   * Uses XMLHttpRequest to track upload progress (fetch doesn't support upload.onprogress).
   */
  const handleUpload = () => {
    if (!selectedProduct) {
      toast({ title: "Select a product", description: "Pick a product before uploading." });
      return;
    }
    if (!uploadFile) {
      toast({ title: "Select a video file", description: "Choose an MP4, MOV, or AVI file to upload." });
      return;
    }
    setUploadStatus("uploading");
    setUploadProgress(0);

    const form = new FormData();
    form.append("file", uploadFile);
    form.append("product_id", selectedProduct.id);
    form.append("platform", selectedPlatforms[0] || "ig");
    form.append("overlay_position", overlayPosition);

    const token = localStorage.getItem("rf_token");
    // XMLHttpRequest allows real-time upload progress tracking (fetch doesn't)
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setReelId(data.reel_id);
        setUploadStatus("done");
        setGenerationStatus("generating");
        setGenerationStartTime(Date.now());
        setElapsedSeconds(0);
        setVideoUrl(null);     // Clear any previous video while overlay/captions process
        setIsPlaying(false);
        // Notify global context so background polling works when user navigates away
        startGeneration(data.reel_id, selectedProduct?.name ?? "Video Upload");
        toast({ title: "Video uploaded!", description: "Processing overlay and captions…" });
      } else {
        setUploadStatus("error");
        let msg = "Upload failed.";
        try { msg = JSON.parse(xhr.responseText).detail; } catch {}
        toast({ title: "Upload failed", description: msg, variant: "destructive" });
      }
    };
    xhr.onerror = () => {
      setUploadStatus("error");
      toast({ title: "Network error", description: "Could not reach the server.", variant: "destructive" });
    };
    xhr.open("POST", "http://localhost:8000/api/reels/upload-video");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  };

  const handleApprove = () => toast({ title: "Approved & Saved!", description: "Reel saved to your library 🎉" });

  const handlePublish = () => {
    const names = platformOptions.filter((p) => selectedPlatforms.includes(p.id)).map((p) => p.label);
    toast({ title: "Published!", description: `Reel has been distributed to ${names.join(", ")} 🎉` });
  };

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
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* ============ LEFT: Composer (Sora-style monolith) ============ */}
        <div className="lg:col-span-3 space-y-5">
          {/* Hidden file input (triggered by upload button) */}
          <input
            ref={uploadInputRef}
            type="file"
            accept=".mp4,.mov,.avi,video/mp4,video/quicktime,video/x-msvideo"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setUploadFile(f);
              setUploadStatus("idle");
            }}
          />

          {/* Feature 2: Creator mode switch (F2-URS02 AI gen vs F2-URS04 upload) */}
          <div className="flex rounded-xl border border-border bg-muted/30 p-1 gap-1">
            <button
              onClick={() => setCreatorMode("generate")}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                creatorMode === "generate"
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Generate with AI
            </button>
            <button
              onClick={() => setCreatorMode("upload")}
              className={`flex-1 inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                creatorMode === "upload"
                  ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload Video
            </button>
          </div>

          {/* PRODUCT — REQUIRED block (separate from prompt) */}
          <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Product</span>
                <span className="rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ring-1 ring-primary/20">Required</span>
              </div>
              {selectedProduct && (
                <button
                  type="button"
                  onClick={openPicker}
                  className="text-[11px] text-muted-foreground hover:text-primary transition-colors"
                >
                  Change
                </button>
              )}
            </div>
            <div className="p-4">
              {selectedProduct ? (
                <div className="flex items-center gap-3">
                  {/* Product image: letter always rendered as fallback; image layers on top if available */}
                  <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden ring-1 ring-border bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center relative">
                    <span className="text-2xl font-semibold text-foreground/50 select-none">{selectedProduct.thumbnail}</span>
                    {selectedProduct.primaryImageUrl && (
                      <img
                        src={selectedProduct.primaryImageUrl}
                        alt={selectedProduct.name}
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{selectedProduct.name}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{selectedProduct.highlights}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">📁 {selectedProduct.campaignName}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedProduct(null)}
                    className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Remove product"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openPicker}
                  className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 hover:border-primary/40 hover:bg-primary/5 transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <FolderOpen className="h-4 w-4 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-foreground">Select a product</p>
                      <p className="text-[11px] text-muted-foreground">Pick from your campaign library</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              )}
            </div>
          </div>

          {/* F2-URS04: Video upload zone (visible when creatorMode === "upload") */}
          {creatorMode === "upload" && (
            <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                <Upload className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Upload Reel</span>
                <span className="text-[10px] text-muted-foreground ml-1">MP4 · MOV · AVI · max 500 MB · max 60 s</span>
              </div>
              <div className="p-4 space-y-3">
                {uploadStatus !== "uploading" && !uploadFile && (
                  <button
                    type="button"
                    onClick={() => uploadInputRef.current?.click()}
                    className="flex flex-col items-center gap-3 w-full py-10 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
                  >
                    <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">Click to select a video</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">MP4, MOV, or AVI · max 500 MB · max 60 s</p>
                    </div>
                  </button>
                )}
                {uploadFile && uploadStatus !== "uploading" && (
                  <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/30 p-3">
                    <Film className="h-8 w-8 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{uploadFile.name}</p>
                      <p className="text-[11px] text-muted-foreground">{(uploadFile.size / 1024 / 1024).toFixed(1)} MB</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setUploadFile(null); setUploadStatus("idle"); }}
                      className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {uploadStatus === "uploading" && (
                  <div className="space-y-2 px-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        {/* After file hits 100%, server is still accepting + queuing the task */}
                        {uploadProgress < 100 ? "Uploading…" : "Waiting for server…"}
                      </span>
                      <span>{uploadProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <div className="border-t border-border bg-background/40 px-3 py-2.5">
                <Button
                  onClick={handleUpload}
                  disabled={!uploadFile || uploadStatus === "uploading"}
                  className="gradient-primary w-full gap-2 h-9 text-sm text-primary-foreground shadow-glow"
                >
                  {uploadStatus === "uploading" ? (
                    <><Loader2 className="h-4 w-4 animate-spin" />Uploading…</>
                  ) : (
                    <><Upload className="h-4 w-4" />Upload &amp; Process</>
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* F2-URS01, F2-URS02: AI Reel generation (visible when creatorMode === "generate") */}
          {creatorMode === "generate" &&
          <div className="relative rounded-3xl border border-border bg-card shadow-elevated overflow-hidden group focus-within:border-primary/30 transition-colors">
            {/* subtle glow */}
            <div className="pointer-events-none absolute inset-0 opacity-0 group-focus-within:opacity-100 transition-opacity duration-700"
                 style={{ background: "radial-gradient(ellipse at top, hsl(var(--primary) / 0.08), transparent 60%)" }} />

            {/* Prompt header: label + guided mode toggle */}
            <div className="flex items-center gap-2 px-5 pt-4 pb-1 flex-wrap">
              <Wand2 className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Prompt</span>
              <span className="rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ring-1 ring-primary/20">Required</span>
              {/* Guided mode toggle — helps users who don't know what to write */}
              <button
                type="button"
                onClick={() => setGuidedMode((g) => !g)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
                  guidedMode
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-primary/30 text-primary hover:bg-primary/5"
                }`}
                title="Not sure what to write? Let AI build the prompt for you."
              >
                <Lightbulb className="h-3 w-3" />
                Guide Me ✨
              </button>
            </div>

            {/* ── Quick prompts strip (default mode, above textarea) ─────────── */}
            {/* Gemini-powered: clicking a chip generates a product-specific prompt */}
            {!guidedMode && (
              <div className="px-5 pt-2 pb-0">
                <div className="flex flex-wrap gap-1.5">
                  {promptTemplates.map((t) => {
                    const isLoading = loadingTemplate === t.type;
                    const isAnyLoading = loadingTemplate !== null;
                    return (
                      <button
                        key={t.type}
                        type="button"
                        onClick={() => handleQuickPrompt(t.type)}
                        disabled={isAnyLoading}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all disabled:cursor-not-allowed ${
                          isLoading
                            ? "border-primary/40 bg-primary/10 text-primary"
                            : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                        }`}
                      >
                        {isLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Guided Prompt panel (guided mode) ─────────────────────────── */}
            {guidedMode && (
              <div className="mx-5 mt-2 mb-1 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">

                {/* Header: title + clear-all */}
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Guide Me — pick any combination, AI builds your prompt</p>
                  {(selectedMood || selectedTarget || selectedStyle || selectedFocus || selectedLighting) && (
                    <button type="button" onClick={() => { setSelectedMood(null); setSelectedTarget(null); setSelectedStyle(null); setSelectedFocus(null); setSelectedLighting(null); }}
                      className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">Clear all</button>
                  )}
                </div>

                {/* Chip rows — flex-wrap so all 6 options sit on one line where space allows.
                     Order: Mood → Lighting → Style → Focus → Target (lighting next to mood for creative flow). */}

                {/* Row 1: Mood / Vibe */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">Mood / Vibe</p>
                  <div className="flex flex-wrap gap-1.5">
                    {MOOD_OPTIONS.map((opt) => (
                      <button key={opt.label} type="button"
                        onClick={() => setSelectedMood(selectedMood === opt.label ? null : opt.label)}
                        onMouseEnter={(e) => { setHoveredOption({ label: opt.label, description: opt.description }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                        onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredOption(null)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${selectedMood === opt.label ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30" : "border border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row 2: Lighting & Environment (placed next to Mood for natural creative pairing) */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">Lighting & Environment</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LIGHTING_OPTIONS.map((opt) => (
                      <button key={opt.label} type="button"
                        onClick={() => setSelectedLighting(selectedLighting === opt.label ? null : opt.label)}
                        onMouseEnter={(e) => { setHoveredOption({ label: opt.label, description: opt.description }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                        onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredOption(null)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${selectedLighting === opt.label ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30" : "border border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row 3: Visual Style */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">Visual Style</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STYLE_OPTIONS.map((opt) => (
                      <button key={opt.label} type="button"
                        onClick={() => setSelectedStyle(selectedStyle === opt.label ? null : opt.label)}
                        onMouseEnter={(e) => { setHoveredOption({ label: opt.label, description: opt.description }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                        onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredOption(null)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${selectedStyle === opt.label ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30" : "border border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row 4: Scene / Focus */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">Scene Focus</p>
                  <div className="flex flex-wrap gap-1.5">
                    {FOCUS_OPTIONS.map((opt) => (
                      <button key={opt.label} type="button"
                        onClick={() => setSelectedFocus(selectedFocus === opt.label ? null : opt.label)}
                        onMouseEnter={(e) => { setHoveredOption({ label: opt.label, description: opt.description }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                        onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredOption(null)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${selectedFocus === opt.label ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30" : "border border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Row 5: Target Audience */}
                <div className="space-y-1.5">
                  <p className="text-sm font-semibold text-foreground">Target Audience</p>
                  <div className="flex flex-wrap gap-1.5">
                    {TARGET_OPTIONS.map((opt) => (
                      <button key={opt.label} type="button"
                        onClick={() => setSelectedTarget(selectedTarget === opt.label ? null : opt.label)}
                        onMouseEnter={(e) => { setHoveredOption({ label: opt.label, description: opt.description }); setTooltipPos({ x: e.clientX, y: e.clientY }); }}
                        onMouseMove={(e) => setTooltipPos({ x: e.clientX, y: e.clientY })}
                        onMouseLeave={() => setHoveredOption(null)}
                        className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${selectedTarget === opt.label ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30" : "border border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Build button — calls Gemini API with chip selections + product images */}
                <button type="button" onClick={handleBuildGuidedPrompt}
                  disabled={guidedLoading || !selectedProduct || (!selectedMood && !selectedTarget && !selectedStyle && !selectedFocus && !selectedLighting)}
                  className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                  {guidedLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  {guidedLoading ? "Building with AI…" : "Auto-Build Prompt"}
                  {!guidedLoading && !selectedProduct && (
                    <span className="opacity-60 ml-1">(select product first)</span>
                  )}
                  {!guidedLoading && selectedProduct && !selectedMood && !selectedTarget && !selectedStyle && !selectedFocus && !selectedLighting && (
                    <span className="opacity-60 ml-1">(pick options above)</span>
                  )}
                </button>

              </div>
            )}

            {/* Prompt textarea */}
            <div className="px-5 pt-3 pb-2 relative">
              <Textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value.slice(0, 500))}
                maxLength={500}
                placeholder={guidedMode ? "Prompt will be auto-built above, or type your own here…" : "Describe the Reel you want to create — scene, mood, motion, style, product details…"}
                className="min-h-[120px] w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <div className="absolute bottom-2 right-5 text-[10px] text-muted-foreground">
                {promptText.length}/500
              </div>
            </div>

            {/* Chip toolbar — duration only (9:16 is fixed, no need to show) */}
            <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
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
                  title="Send your prompt to Gemini for a professional cinematic rewrite"
                >
                  {enhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {enhancing ? "Enhancing…" : "Enhance"}
                </Button>
              </div>
              <Button
                onClick={generationStatus === "done" ? () => handleRegenerate("all") : handleGenerate}
                disabled={generationStatus === "generating"}
                className="gradient-primary h-9 gap-2 px-4 text-sm text-primary-foreground shadow-glow hover:shadow-glow-lg"
              >
                {generationStatus === "generating" ? (
                  <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
                ) : generationStatus === "done" ? (
                  <><RefreshCw className="h-4 w-4" />Re-generate</>
                ) : (
                  <><Sparkles className="h-4 w-4" />Generate Video</>
                )}
              </Button>
            </div>
          </div>

          }
          {/* Target Platforms — icon + slide toggle per platform */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-3">
            <div>
              <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">Target Platforms</h2>
              <p className="text-[11px] text-muted-foreground mt-1">
                Select platforms to distribute to — captions will be optimised per platform
              </p>
            </div>
            {/* Single-row block selector — checkmark badge when active, plain when inactive */}
            <div className="flex gap-2">
              {platformOptions.map((p) => {
                const isActive = selectedPlatforms.includes(p.id);
                return (
                  <div
                    key={p.id}
                    onClick={() => togglePlatform(p.id)}
                    className={`relative flex-1 flex flex-col items-center justify-center gap-1.5 rounded-xl border py-3 cursor-pointer transition-all select-none ${
                      isActive
                        ? `${p.activeBg} ring-1`
                        : "border-border/50 hover:border-border hover:bg-muted/20"
                    }`}
                  >
                    {/* Platform icon — coloured when active, dimmed when off */}
                    <span className={`transition-colors ${isActive ? p.color : "text-muted-foreground/35"}`}>
                      <PlatformIcon id={p.id} />
                    </span>
                    {/* Short platform name */}
                    <span className={`text-[10px] font-medium text-center leading-tight transition-colors ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}>
                      {p.shortLabel}
                    </span>
                    {/* Checkmark badge — top-right corner when active */}
                    {isActive && (
                      <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary">
                        <Check className="h-2 w-2 text-primary-foreground" />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            {selectedPlatforms.length === 0 && (
              <p className="text-[11px] text-amber-500/80">⚠ Select at least one platform before publishing</p>
            )}
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

        {/* ============ RIGHT: Preview (compact, no-scroll) ============ */}
        <div className="lg:col-span-2">
          <div className="lg:sticky lg:top-4 space-y-3">
            {/* Device-style Preview Card */}
            <div className="relative rounded-3xl border border-border bg-gradient-to-b from-card to-card/60 p-3 shadow-elevated overflow-hidden">
              {/* top status bar */}
              <div className="flex items-center justify-between px-1 pb-2">
                <div className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${
                    generationStatus === "done" ? "bg-success" :
                    generationStatus === "generating" ? "bg-primary animate-pulse" : "bg-muted-foreground/40"
                  }`} />
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    {generationStatus === "done" ? "Ready" : generationStatus === "generating" ? "Rendering" : "Standby"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
                  <span>9:16</span>
                  <span className="h-2.5 w-px bg-border" />
                  <span>1080p</span>
                  <span className="h-2.5 w-px bg-border" />
                  <span>{duration}s</span>
                </div>
              </div>

              {/* Phone frame */}
              <div className="relative mx-auto w-full max-w-[260px]">
                <div className="relative aspect-[9/16] w-full overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 ring-1 ring-inset ring-white/5">
                  {generationStatus === "done" ? (
                    <>
                      {/* Real video from Veo / fal.ai */}
                      {videoUrl ? (
                        <video
                          ref={videoRef}
                          src={videoUrl}
                          className="absolute inset-0 w-full h-full object-cover"
                          loop
                          playsInline
                          muted={videoMuted}
                          autoPlay
                          onTimeUpdate={() => setVideoCurrentTime(videoRef.current?.currentTime ?? 0)}
                          onLoadedMetadata={() => setVideoDuration(videoRef.current?.duration ?? 0)}
                        />
                      ) : (
                        <div className="absolute inset-0" style={{
                          backgroundImage: "radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(circle at 70% 75%, hsl(var(--accent) / 0.3), transparent 55%)"
                        }} />
                      )}
                      {showLogo && (
                        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md bg-black/40 backdrop-blur-md border border-white/10 px-1.5 py-1 shadow-lg">
                          {selectedProduct?.brandLogoUrl ? (
                            /* Show actual brand logo from product — matches what the worker bakes in */
                            <img
                              src={selectedProduct.brandLogoUrl}
                              alt="Brand logo"
                              className="h-5 w-auto max-w-[56px] object-contain"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                            />
                          ) : (
                            <>
                              <div className="h-3.5 w-3.5 rounded-sm gradient-primary flex items-center justify-center">
                                <Sparkles className="h-2 w-2 text-primary-foreground" />
                              </div>
                              <span className="text-[8px] font-bold text-white">REELCAST</span>
                            </>
                          )}
                        </div>
                      )}
                      {showProduct && (
                        <div className="absolute bottom-12 left-2 right-2 flex items-center gap-2 rounded-lg bg-black/50 backdrop-blur-md border border-white/10 p-1.5 shadow-xl">
                          <div className="h-9 w-9 shrink-0 rounded-md overflow-hidden bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-lg">
                            {selectedProduct?.primaryImageUrl ? (
                              <img src={selectedProduct.primaryImageUrl} alt={selectedProduct.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                            ) : (
                              <span>{selectedProduct?.thumbnail ?? <ShoppingBag className="h-4 w-4 text-white" />}</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] font-semibold text-white truncate">{selectedProduct?.name ?? "Product Name"}</p>
                            <p className="text-[9px] text-white/70">Tap to shop</p>
                          </div>
                        </div>
                      )}
                      {/* Click overlay — toggles play/pause, shows flash icon briefly */}
                      <button onClick={togglePlay} className="absolute inset-0" aria-label={isPlaying ? "Pause" : "Play"} />
                      {/* Flash icon — appears for 1.2s on toggle, then fades out */}
                      <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-500 ${showPlayIcon ? "opacity-100" : "opacity-0"}`}>
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/25">
                          {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white ml-0.5" />}
                        </div>
                      </div>

                      {/* Top-left controls: fullscreen + mute/unmute */}
                      <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                        <button
                          onClick={(e) => { e.stopPropagation(); setFullscreenOpen(true); }}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-md ring-1 ring-white/15 hover:bg-black/70 transition-all"
                          aria-label="Expand fullscreen"
                          title="Open fullscreen"
                        >
                          <Expand className="h-3.5 w-3.5 text-white" />
                        </button>
                        {/* Mute/unmute toggle — AI videos have no audio but uploaded videos may */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const newMuted = !videoMuted;
                            setVideoMuted(newMuted);
                            // Directly set on element (React muted prop doesn't always update live)
                            if (videoRef.current) videoRef.current.muted = newMuted;
                          }}
                          className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-md ring-1 ring-white/15 hover:bg-black/70 transition-all"
                          aria-label={videoMuted ? "Unmute" : "Mute"}
                          title={videoMuted ? "Unmute video" : "Mute video"}
                        >
                          {videoMuted
                            ? <VolumeX className="h-3.5 w-3.5 text-white/70" />
                            : <Volume2 className="h-3.5 w-3.5 text-white" />}
                        </button>
                      </div>

                      <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] text-white/80 font-mono w-6">{formatTime(videoCurrentTime)}</span>
                          {/* Clickable seek bar */}
                          <div
                            className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden cursor-pointer"
                            onClick={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              const ratio = (e.clientX - rect.left) / rect.width;
                              const newTime = ratio * (videoDuration || duration);
                              if (videoRef.current) { videoRef.current.currentTime = newTime; }
                              if (videoRefFullscreen.current) { videoRefFullscreen.current.currentTime = newTime; }
                              setVideoCurrentTime(newTime);
                            }}
                          >
                            <div
                              className="h-full rounded-full bg-white"
                              style={{ width: `${videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-white/80 font-mono w-6 text-right">{formatTime(videoDuration || duration)}</span>
                        </div>
                      </div>
                    </>
                  ) : generationStatus === "generating" ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-4">
                      <div className="relative">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted-foreground/10">
                          <Wand2 className="h-6 w-6 text-muted-foreground/40 animate-pulse" />
                        </div>
                        <div className="absolute -inset-2 animate-pulse rounded-2xl gradient-primary opacity-10 blur-xl" />
                      </div>
                      <div className="w-full px-2 space-y-1.5">
                        {/* Indeterminate bar — no fake %, just honest motion */}
                        <div className="h-1 rounded-full bg-muted overflow-hidden">
                          <div className="h-full w-1/3 rounded-full bg-primary"
                               style={{ animation: "shimmer 1.8s ease-in-out infinite" }} />
                        </div>
                        <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                          <span>Generating AI Reel…</span>
                          <span className="text-primary tabular-nums">
                            ⏱ {Math.floor(elapsedSeconds / 60).toString().padStart(2, "0")}:{(elapsedSeconds % 60).toString().padStart(2, "0")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted-foreground/10">
                        <Video className="h-6 w-6 text-muted-foreground/30" />
                      </div>
                      <p className="text-[10px] text-muted-foreground max-w-[22ch]">Preview will appear here once generated</p>
                      <div className="absolute top-2 left-2 w-2 h-2 border-t border-l border-white/10" />
                      <div className="absolute top-2 right-2 w-2 h-2 border-t border-r border-white/10" />
                      <div className="absolute bottom-2 left-2 w-2 h-2 border-b border-l border-white/10" />
                      <div className="absolute bottom-2 right-2 w-2 h-2 border-b border-r border-white/10" />
                    </div>
                  )}
                </div>
              </div>

            </div>

            {/* Generation time badge — shows after completion (how long it took) */}
            {generationStatus === "done" && generationTime !== null && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground"
              >
                <Check className="h-3 w-3 text-success" />
                <span>
                  Generated in{" "}
                  <span className="font-mono text-foreground tabular-nums">
                    {Math.floor(generationTime / 60).toString().padStart(2, "0")}:{(generationTime % 60).toString().padStart(2, "0")}
                  </span>
                </span>
              </motion.div>
            )}

            {/* Overlay preview toggles — UI-only, do not affect the baked video */}
            {generationStatus === "done" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-3 shadow-card">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Preview Overlays</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setShowLogo((v) => !v)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                      showLogo
                        ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Brand Logo</span>
                    <span className={`ml-auto text-[9px] font-bold uppercase ${showLogo ? "text-primary" : "text-muted-foreground/60"}`}>
                      {showLogo ? "ON" : "OFF"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowProduct((v) => !v)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                      showProduct
                        ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                    }`}
                  >
                    <ShoppingBag className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Product</span>
                    <span className={`ml-auto text-[9px] font-bold uppercase ${showProduct ? "text-primary" : "text-muted-foreground/60"}`}>
                      {showProduct ? "ON" : "OFF"}
                    </span>
                  </button>
                </div>
                <p className="mt-2 text-[9px] text-muted-foreground/60 text-center">Preview only — overlays are baked into the exported video</p>
              </motion.div>
            )}

            {/* Caption + Actions (only when done) */}
            {generationStatus === "done" ? (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-3 shadow-card space-y-2.5">
                <div className="flex items-center gap-1.5">
                  <Brain className="h-3 w-3 text-primary" />
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Caption · Gemini</label>
                </div>
                <Textarea
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  className="bg-muted/40 border-border resize-none text-[11px] leading-relaxed"
                />
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button variant="outline" onClick={() => handleRegenerate("video")} size="sm" className="gap-1.5 h-9 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regen Video
                  </Button>
                  <Button variant="outline" onClick={() => handleRegenerate("caption")} size="sm" className="gap-1.5 h-9 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Regen Caption
                  </Button>
                  <Button onClick={handleApprove} size="sm" className="gradient-primary gap-1.5 text-primary-foreground shadow-glow h-9 text-xs">
                    <Check className="h-3.5 w-3.5" />
                    Approve
                  </Button>
                </div>
              </motion.div>
            ) : null}
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
                      {/* Banner: image takes full frame; fallback = gradient + first letter (no text overlay on images) */}
                      <div className={`h-24 w-full relative overflow-hidden ${!campaign.bannerUrl ? `bg-gradient-to-br ${getBannerGradient(campaign.bannerColor)}` : "bg-muted"}`}>
                        {campaign.bannerUrl ? (
                          <img
                            src={campaign.bannerUrl}
                            alt={campaign.name}
                            className="absolute inset-0 h-full w-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <div className="h-full flex items-center justify-center">
                            <span className="text-3xl font-bold text-white/80 drop-shadow-sm select-none">
                              {campaign.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
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
                {/* Wide banner header — shows campaign image/gradient with info overlaid */}
                <div className="relative h-20 w-full rounded-xl overflow-hidden flex-shrink-0">
                  {activeCampaign.bannerUrl ? (
                    <img src={activeCampaign.bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  ) : (
                    <div className={`absolute inset-0 bg-gradient-to-br ${getBannerGradient(activeCampaign.bannerColor)}`} />
                  )}
                  {/* Dark overlay for text readability */}
                  <div className="absolute inset-0 bg-black/50" />
                  <div className="absolute inset-0 flex items-center gap-3 px-4">
                    <button
                      type="button"
                      onClick={() => { setPickerView("campaigns"); setActiveCampaignId(null); }}
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
                    >
                      <ChevronLeft className="h-4 w-4 text-white" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-display font-semibold text-white truncate">{activeCampaign.name}</h3>
                      <p className="text-[11px] text-white/70">{activeCampaign.products.length} products in this campaign</p>
                    </div>
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
                        className={`flex gap-3 p-3 rounded-lg border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "border-primary/50 bg-primary/10 ring-1 ring-primary/20"
                            : "border-border bg-card hover:border-primary/30 hover:bg-muted/40"
                        }`}
                      >
                        {/* Letter always rendered; image overlays it when loaded */}
                        <div className="h-12 w-12 shrink-0 rounded-md overflow-hidden bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center relative">
                          <span className="text-xl font-semibold text-foreground/50 select-none">{product.thumbnail}</span>
                          {product.primaryImageUrl && (
                            <img src={product.primaryImageUrl} alt={product.name} className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                          )}
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

      {/* Fullscreen Reel Preview */}
      <Dialog open={fullscreenOpen} onOpenChange={setFullscreenOpen}>
        <DialogContent className="max-w-[420px] p-0 bg-black border-border overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Fullscreen Reel preview</DialogTitle>
            <DialogDescription>Watch the generated Reel in fullscreen</DialogDescription>
          </DialogHeader>
          <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
            {/* Actual video in fullscreen */}
            {videoUrl ? (
              <video
                ref={videoRefFullscreen}
                src={videoUrl}
                className="absolute inset-0 w-full h-full object-cover"
                loop
                playsInline
                muted={videoMuted}
                autoPlay
              />
            ) : (
              <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.45), transparent 55%), radial-gradient(circle at 70% 75%, hsl(var(--accent) / 0.4), transparent 55%)" }} />
            )}
            {showLogo && (
              <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-2.5 py-1.5 shadow-lg">
                {selectedProduct?.brandLogoUrl ? (
                  <img
                    src={selectedProduct.brandLogoUrl}
                    alt="Brand logo"
                    className="h-7 w-auto max-w-[80px] object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <>
                    <div className="h-5 w-5 rounded-md gradient-primary flex items-center justify-center">
                      <Sparkles className="h-3 w-3 text-primary-foreground" />
                    </div>
                    <span className="text-[11px] font-bold text-white">REELCAST</span>
                  </>
                )}
              </div>
            )}
            {showProduct && (
              <div className="absolute bottom-20 left-4 right-4 flex items-center gap-3 rounded-xl bg-black/55 backdrop-blur-md border border-white/10 p-3 shadow-2xl">
                <div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-3xl">
                  {selectedProduct?.primaryImageUrl ? (
                    <img src={selectedProduct.primaryImageUrl} alt={selectedProduct.name} className="h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <span>{selectedProduct?.thumbnail ?? <ShoppingBag className="h-6 w-6 text-white" />}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{selectedProduct?.name ?? "Product Name"}</p>
                  <p className="text-xs text-white/70">Tap to shop</p>
                </div>
                <Button size="sm" className="gradient-primary text-primary-foreground h-8 px-3 text-xs">Shop</Button>
              </div>
            )}
            {/* Click overlay + flash icon */}
            <button onClick={togglePlay} className="absolute inset-0" aria-label={isPlaying ? "Pause" : "Play"} />
            <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-500 ${showPlayIcon ? "opacity-100" : "opacity-0"}`}>
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/25">
                {isPlaying ? <Pause className="h-7 w-7 text-white" /> : <Play className="h-7 w-7 text-white ml-1" />}
              </div>
            </div>
            {/* Seek bar — synced with main video */}
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/80 font-mono w-8">{formatTime(videoCurrentTime)}</span>
                <div
                  className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden cursor-pointer"
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    const newTime = ratio * (videoDuration || duration);
                    if (videoRef.current) { videoRef.current.currentTime = newTime; }
                    if (videoRefFullscreen.current) { videoRefFullscreen.current.currentTime = newTime; }
                    setVideoCurrentTime(newTime);
                  }}
                >
                  <div
                    className="h-full rounded-full bg-white"
                    style={{ width: `${videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs text-white/80 font-mono w-8 text-right">{formatTime(videoDuration || duration)}</span>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating tooltip — appears next to cursor while hovering Guide Me chips.
           Uses position:fixed so it escapes all stacking contexts and always renders
           on top. pointer-events-none prevents it from blocking mouse events. */}
      {hoveredOption && guidedMode && (
        <div
          className="fixed z-[9999] pointer-events-none max-w-[220px] rounded-xl border border-border bg-popover/95 px-3 py-2.5 shadow-xl backdrop-blur-sm"
          style={{ left: tooltipPos.x + 16, top: tooltipPos.y + 16 }}
        >
          <p className="text-[11px] font-semibold text-foreground leading-tight">{hoveredOption.label}</p>
          <p className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{hoveredOption.description}</p>
        </div>
      )}
    </div>
  );
};

export default CreateReel;




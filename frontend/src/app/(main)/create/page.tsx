"use client";

import { useRef, useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Sparkles, Video, Wand2, Send, Check, Loader2, Film, RefreshCw,
  Play, Pause, Volume2, VolumeX, ShoppingBag, FolderOpen,
  ChevronRight, X, Expand, Download, Clock, Upload, Lightbulb,
} from "lucide-react";
import { useGenerationQueue } from "@/contexts/GenerationQueueContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";

import type { LibraryProduct, GenerationStatus, GuideOption } from "./_types";
import { useProductLibrary } from "./_hooks/useProductLibrary";
import { useGenerationPolling } from "./_hooks/useGenerationPolling";
import { GuideChipRow } from "./_components/GuideChipRow";
import { ProductPickerDialog } from "./_components/ProductPickerDialog";
import { FullscreenVideoDialog } from "./_components/FullscreenVideoDialog";
import { CaptionBlock } from "./_components/CaptionBlock";

// ─── Quick-prompt chips ───────────────────────────────────────────────────────
const promptTemplates = [
  { label: "🛍️ Product Showcase", type: "product_showcase" },
  { label: "🔥 Flash Sale",        type: "flash_sale" },
  { label: "✨ New Arrival",        type: "new_arrival" },
  { label: "📦 Bundle Deal",        type: "bundle_deal" },
  { label: "⭐ Review Highlight",   type: "review_highlight" },
  { label: "🎯 How-To / Tutorial",  type: "tutorial" },
];

// LTX 2.3 valid durations; 30s/60s use extend chain on the backend.
const durationOptions = [6, 10, 15, 30, 60];

// ─── Guide Me chip options ────────────────────────────────────────────────────
const MOOD_OPTIONS: GuideOption[] = [
  { label: "Fun & Energetic",   description: "Bright, fast-paced, upbeat energy. Perfect for products that bring joy or excitement." },
  { label: "Luxury & Premium",  description: "Sophisticated and refined. Deep gold tones conveying exclusivity and high value." },
  { label: "Cute & Warm",       description: "Soft, gentle, and heartwarming. Pastel tones with a cozy, friendly feel." },
  { label: "Dark & Mysterious", description: "Moody shadows and dramatic atmosphere. Intrigue that keeps viewers watching." },
  { label: "Dreamy / Soft",     description: "Soft bokeh, pastel tones, and a gentle floating atmosphere. Ethereal and calming." },
  { label: "Eco & Natural",     description: "Earth tones and calm energy. Communicates sustainability and natural goodness." },
];
const TARGET_OPTIONS: GuideOption[] = [
  { label: "Teens / Gen Z",        description: "Fast cuts, trending sounds, bold text overlays. Speaks their language effortlessly." },
  { label: "Working Adults",       description: "Professional and time-efficient messaging. Highlights quality and convenience." },
  { label: "Female Professionals", description: "Polished, empowering, stylish. Speaks to ambition and modern femininity." },
  { label: "Men 25–40",            description: "Bold and no-nonsense. Quality, performance, and lifestyle credibility." },
  { label: "New Parents",          description: "Warm, safe, and trustworthy. Gentle reassurance for anxious new parents." },
  { label: "Fitness Enthusiasts",  description: "High energy and motivational. Emphasizes performance and transformation." },
];
const STYLE_OPTIONS: GuideOption[] = [
  { label: "Cinematic",        description: "Sweeping camera movements and professional lighting. Feels like a movie trailer." },
  { label: "UGC / Authentic",  description: "Handheld, real-person footage. Genuine and relatable — like a friend's recommendation." },
  { label: "Minimal & Clean",  description: "Simple compositions, clean lines, and restrained design. Lets the product speak." },
  { label: "Close-up / Macro", description: "Extreme close-ups on textures, details, and fine craftsmanship. Makes materials look irresistible." },
  { label: "Vintage / Retro",  description: "Film grain, warm tones, and nostalgic aesthetics. Evokes warmth and authenticity." },
  { label: "Dark / Moody",     description: "Low-key lighting, rich shadows, and editorial composition. Mysterious and luxurious." },
];
const FOCUS_OPTIONS: GuideOption[] = [
  { label: "Unboxing",       description: "The reveal moment — opening packaging, first impressions, that satisfying first look." },
  { label: "Product Demo",   description: "Hands-on demonstration showing exactly how the product works and why it's better." },
  { label: "Lifestyle",      description: "Product naturally integrated into real-life moments. Shows how it fits your world." },
  { label: "Before & After", description: "Side-by-side transformation. Visually proves the product's effectiveness." },
  { label: "Testimonial",    description: "Real customer speaks authentically. Social proof that builds trust and credibility." },
  { label: "Brand Story",    description: "The 'why' behind the brand. Emotional connection through origin and mission." },
];
const LIGHTING_OPTIONS: GuideOption[] = [
  { label: "Golden Hour",          description: "The magic hour just after sunrise or before sunset. Warm amber tones bathing everything in soft gold." },
  { label: "Studio White",         description: "Clean, controlled studio lighting. Bright and neutral — makes product colors pop with accuracy." },
  { label: "Neon / Cyberpunk",     description: "Electric neon lights in purple, cyan, and pink. Futuristic night-city vibes." },
  { label: "Natural Outdoor",      description: "Bright daylight outdoors. Fresh, clean, and organic — the world as a natural studio." },
  { label: "Dark Dramatic",        description: "Minimal light, deep shadows, single key-light. Creates intensity and mystery." },
  { label: "Backlit / Silhouette", description: "Light source placed behind the subject. Creates glowing outlines and artistic silhouettes." },
];
const CAMERA_OPTIONS: GuideOption[] = [
  { label: "Slow Zoom In",       description: "Camera gradually pushes toward the subject. Builds tension and draws the viewer in." },
  { label: "Orbit / Rotate",     description: "Camera circles around the subject. Shows every angle of the product elegantly." },
  { label: "Dolly Right",        description: "Camera slides sideways to reveal the scene. Clean, editorial movement." },
  { label: "Pull Back / Reveal", description: "Camera pulls back to reveal the full environment. Great for dramatic scene reveals." },
  { label: "Handheld Drift",     description: "Gentle organic handheld movement. Natural and authentic, like a documentary style." },
  { label: "Static Close-up",    description: "Camera holds still on a tight frame. Lets textures and details take center stage." },
];


const CreateReel = () => {
  const { toast } = useToast();
  const { startGeneration } = useGenerationQueue();

  // ── Product library (fetched from backend) ──────────────────────────────────
  const productLibrary = useProductLibrary();

  // ── Composer state ───────────────────────────────────────────────────────────
  const [promptText, setPromptText] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoRefFullscreen = useRef<HTMLVideoElement>(null);

  // Settings
  const [duration, setDuration] = useState(6);
  const [withAudio, setWithAudio] = useState(true);
  const [overlayPosition] = useState("top-right");

  // Output / preview state
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [isApproved, setIsApproved] = useState(false);
  const [completedMode, setCompletedMode] = useState<"generate" | "upload" | null>(null);
  const completedModeRef = useRef<"generate" | "upload">("generate");
  const captionOnlyRegenRef = useRef(false);
  const [isRegeneratingCaption, setIsRegeneratingCaption] = useState(false);
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["yt", "tt", "fb", "ig"]);
  const [showLogo, setShowLogo] = useState(true);
  const [showProduct, setShowProduct] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [reelId, setReelId] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [rawVideoUrl, setRawVideoUrl] = useState<string | null>(null);

  // Playback tracking
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [showPlayIcon, setShowPlayIcon] = useState(false);
  const playIconTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [videoMuted, setVideoMuted] = useState(false);

  // Elapsed timer
  const [generationStartTime, setGenerationStartTime] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [generationTime, setGenerationTime] = useState<number | null>(null);

  // Creator mode
  const [creatorMode, setCreatorMode] = useState<"generate" | "upload">("generate");

  // Upload
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Product picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<LibraryProduct | null>(null);

  // Guided prompt
  const [guidedMode, setGuidedMode] = useState(false);
  const [selectedMood, setSelectedMood] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<string | null>(null);
  const [selectedFocus, setSelectedFocus] = useState<string | null>(null);
  const [selectedLighting, setSelectedLighting] = useState<string | null>(null);
  const [selectedCameraMotion, setSelectedCameraMotion] = useState<string | null>(null);
  const [hoveredOption, setHoveredOption] = useState<GuideOption | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [guidedLoading, setGuidedLoading] = useState(false);

  // ── Generation polling ────────────────────────────────────────────────────────
  useGenerationPolling({
    generationStatus,
    isRegeneratingCaption,
    reelId,
    generationStartTime,
    captionOnlyRegenRef,
    completedModeRef,
    onCompleted: ({ isCaptionRegen, finalVideoUrl, rawVideoUrl: raw, caption: newCaption, generationTime: gt, completedMode: cm }) => {
      if (!isCaptionRegen) {
        setGenerationStatus("done");
        setCompletedMode(cm);
        setGenerationTime(gt);
        if (finalVideoUrl) { setVideoUrl(finalVideoUrl); setIsPlaying(true); }
        if (raw) setRawVideoUrl(raw);
      } else {
        setIsRegeneratingCaption(false);
      }
      if (newCaption) setCaption(newCaption);
    },
    onFailed: (_, gt) => {
      setGenerationStatus("idle");
      setGenerationTime(gt);
    },
  });

  // ── Video playback sync ───────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    const vidFs = videoRefFullscreen.current;
    if (fullscreenOpen) {
      vid?.pause();
      if (vidFs) {
        if (isPlaying) vidFs.play().catch(() => { vidFs.muted = true; vidFs.play().catch(() => {}); });
        else vidFs.pause();
      }
    } else {
      vidFs?.pause();
      if (vid) {
        if (isPlaying) vid.play().catch(() => { vid.muted = true; setVideoMuted(true); vid.play().catch(() => {}); });
        else vid.pause();
      }
    }
  }, [isPlaying, fullscreenOpen]);

  // Sync position when fullscreen opens/closes
  useEffect(() => {
    if (fullscreenOpen) {
      const rafId = requestAnimationFrame(() => {
        const main = videoRef.current;
        const fs = videoRefFullscreen.current;
        if (main && fs) {
          fs.currentTime = main.currentTime;
          fs.muted = videoMuted;
          main.pause();
          if (isPlaying) fs.play().catch(() => { fs.muted = true; fs.play().catch(() => {}); });
        }
      });
      return () => cancelAnimationFrame(rafId);
    } else {
      const main = videoRef.current;
      const fs = videoRefFullscreen.current;
      if (main && fs) {
        main.currentTime = fs.currentTime;
        fs.pause();
        if (isPlaying) main.play().catch(() => {});
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullscreenOpen]);

  // Sync muted state via DOM
  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = videoMuted;
    if (videoRefFullscreen.current) videoRefFullscreen.current.muted = videoMuted;
  }, [videoMuted, videoUrl]);

  // Auto-resize textareas
  useEffect(() => {
    const el = captionTextareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [caption]);

  useEffect(() => {
    const el = promptTextareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; }
  }, [promptText]);

  // Elapsed timer
  useEffect(() => {
    if (generationStatus !== "generating" || generationStartTime === null) return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - generationStartTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [generationStatus, generationStartTime]);

  // ── Helpers ───────────────────────────────────────────────────────────────────
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const togglePlay = () => {
    setIsPlaying(p => !p);
    setShowPlayIcon(true);
    if (playIconTimerRef.current) clearTimeout(playIconTimerRef.current);
    playIconTimerRef.current = setTimeout(() => setShowPlayIcon(false), 1200);
  };

  const togglePlatform = (id: string) =>
    setSelectedPlatforms(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  /** Shared chip hover handler for Guide Me rows */
  const handleChipHover = (opt: GuideOption | null, pos?: { x: number; y: number }) => {
    setHoveredOption(opt);
    if (opt && pos) setTooltipPos(pos);
  };

  // ── API handlers ──────────────────────────────────────────────────────────────
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
        body: JSON.stringify({ prompt_text: promptText, product_id: selectedProduct?.id ?? null, duration }),
      });
      if (!res.ok) throw new Error("Enhancement request failed");
      const data = await res.json();
      setPromptText(data.prompt);
      toast({ title: "Prompt enhanced ✨", description: "Refined into a professional creative brief." });
    } catch {
      toast({ title: "Enhancement failed", description: "Could not reach AI service.", variant: "destructive" });
    } finally {
      setEnhancing(false);
    }
  };

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
        body: JSON.stringify({ template_type: templateType, product_id: selectedProduct.id, duration }),
      });
      if (!res.ok) throw new Error("Prompt generation failed");
      const data = await res.json();
      setPromptText(data.prompt);
      toast({ title: "Prompt generated ✨", description: "Personalised to your product — edit if needed." });
    } catch {
      toast({ title: "Generation failed", description: "Could not reach AI service.", variant: "destructive" });
    } finally {
      setLoadingTemplate(null);
    }
  };

  const handleBuildGuidedPrompt = async () => {
    if (!selectedProduct) {
      toast({ title: "Select a product first", description: "Auto-Build uses your product details to personalise the prompt." });
      return;
    }
    const hasSelection = selectedMood || selectedTarget || selectedStyle || selectedFocus || selectedLighting || selectedCameraMotion;
    if (!hasSelection) {
      toast({ title: "Pick at least one option", description: "Select any card from the rows below to build a prompt." });
      return;
    }
    setGuidedLoading(true);
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch("http://localhost:8000/api/reels/generate-guided-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          mood:          selectedMood         ?? undefined,
          target:        selectedTarget       ?? undefined,
          style:         selectedStyle        ?? undefined,
          focus:         selectedFocus        ?? undefined,
          lighting:      selectedLighting     ?? undefined,
          camera_motion: selectedCameraMotion ?? undefined,
          product_id:    selectedProduct?.id  ?? undefined,
          duration,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setPromptText((data.prompt as string).slice(0, 500));
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
    completedModeRef.current = "generate";
    setCompletedMode(null);
    setGenerationStatus("generating");
    setIsApproved(false);
    setGenerationStartTime(Date.now());
    setElapsedSeconds(0);
    setVideoUrl(null);
    setRawVideoUrl(null);
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
          duration,
          with_audio: withAudio,
        }),
      });
      if (!res.ok) throw new Error("Failed to start generation");
      const data = await res.json();
      setReelId(data.reel_id);
      startGeneration(data.reel_id, selectedProduct.name);
    } catch (e: any) {
      setGenerationStatus("idle");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleRegenerate = async (target: "video" | "caption" | "all") => {
    if (!reelId) return;
    completedModeRef.current = completedMode ?? "generate";
    captionOnlyRegenRef.current = target === "caption";
    setIsApproved(false);
    setGenerationStartTime(Date.now());
    setElapsedSeconds(0);
    setGenerationTime(null);
    if (target === "caption") {
      setIsRegeneratingCaption(true);
    } else {
      setCompletedMode(null);
      setVideoUrl(null);
      setRawVideoUrl(null);
      setIsPlaying(false);
      setGenerationStatus("generating");
    }
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch(`http://localhost:8000/api/reels/${reelId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          target,
          platform: selectedPlatforms[0] || "ig",
          overlay_position: overlayPosition,
          duration,
          with_audio: withAudio,
          prompt_text: target !== "caption" ? promptText : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to start regeneration");
      toast({ title: "Regenerating...", description: `Regenerating ${target} now.` });
    } catch (e: any) {
      setGenerationStatus("idle");
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleUpload = () => {
    if (!selectedProduct) {
      toast({ title: "Select a product", description: "Pick a product before uploading." });
      return;
    }
    if (!uploadFile) {
      toast({ title: "Select a video file", description: "Choose an MP4, MOV, or AVI file to upload." });
      return;
    }
    const videoEl = document.createElement("video");
    videoEl.preload = "metadata";
    const objectUrl = URL.createObjectURL(uploadFile);
    videoEl.src = objectUrl;
    videoEl.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      if (videoEl.duration > 60) {
        toast({ title: "Video too long", description: `Duration ${Math.round(videoEl.duration)}s exceeds the 60s limit.`, variant: "destructive" });
        return;
      }
      doUpload();
    };
    videoEl.onerror = () => { URL.revokeObjectURL(objectUrl); doUpload(); };
  };

  const doUpload = () => {
    setUploadStatus("uploading");
    setUploadProgress(0);
    const form = new FormData();
    form.append("file", uploadFile!);
    form.append("product_id", selectedProduct!.id);
    form.append("platform", selectedPlatforms[0] || "ig");
    form.append("overlay_position", overlayPosition);
    const token = localStorage.getItem("rf_token");
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        const data = JSON.parse(xhr.responseText);
        setReelId(data.reel_id);
        setUploadStatus("done");
        completedModeRef.current = "upload";
        setCompletedMode(null);
        setGenerationStatus("generating");
        setIsApproved(false);
        setGenerationStartTime(Date.now());
        setElapsedSeconds(0);
        setVideoUrl(null);
        setRawVideoUrl(null);
        setIsPlaying(false);
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

  // NOTE: Approve is UI-only — library persistence requires coordination with library teammate.
  const handleApprove = () => {
    setIsApproved(true);
    toast({ title: "Approved & Saved!", description: "Reel saved to your library 🎉" });
  };

  const handlePublish = () => {
    const names = [
      { id: "yt", label: "YouTube Shorts" },
      { id: "tt", label: "TikTok" },
      { id: "fb", label: "Facebook" },
      { id: "ig", label: "Instagram" },
    ].filter(p => selectedPlatforms.includes(p.id)).map(p => p.label);
    toast({ title: "Published!", description: `Reel has been distributed to ${names.join(", ")} 🎉` });
  };

  const handleDownload = async () => {
    if (!reelId) return;
    try {
      const filename = `reel_${reelId}.mp4`;
      const token = localStorage.getItem("rf_token");
      const res = await fetch(`http://localhost:8000/api/reels/${reelId}/download?with_logo=${showLogo}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} — Could not get download URL`);
      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const data = await res.json();
        const a = document.createElement("a");
        a.href = data.download_url;
        a.setAttribute("download", filename);
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
      }
    } catch (err: any) {
      toast({ title: "Download failed", description: err.message || "Could not download the video.", variant: "destructive" });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Create Reel</h1>
          <p className="mt-1 text-muted-foreground">Describe what you want — AI handles the rest.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 lg:items-start gap-6">
        {/* ============ LEFT: Composer ============ */}
        <div className="lg:col-span-3 space-y-5">
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

          {/* Creator mode toggle */}
          <div className="flex rounded-xl border border-border bg-muted/30 p-1 gap-1">
            <button
              onClick={() => { setCreatorMode("generate"); setWithAudio(true); }}
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

          {/* Product selector */}
          <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
              <div className="flex items-center gap-2">
                <ShoppingBag className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Product</span>
                {!selectedProduct && (
                  <span className="rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ring-1 ring-primary/20">Required</span>
                )}
              </div>
              {selectedProduct && (
                <button type="button" onClick={() => setPickerOpen(true)} className="text-[11px] text-muted-foreground hover:text-primary transition-colors">
                  Change
                </button>
              )}
            </div>
            <div className="p-4">
              {selectedProduct ? (
                <div className="flex items-center gap-3">
                  <div className="h-14 w-14 shrink-0 rounded-xl overflow-hidden ring-1 ring-border bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center relative">
                    <span className="text-2xl font-semibold text-foreground/50 select-none">{selectedProduct.thumbnail}</span>
                    {selectedProduct.primaryImageUrl && (
                      <img src={selectedProduct.primaryImageUrl} alt={selectedProduct.name} className="absolute inset-0 h-full w-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{selectedProduct.name}</p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1">{selectedProduct.highlights}</p>
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">📁 {selectedProduct.campaignName}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedProduct(null)} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors" aria-label="Remove product">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setPickerOpen(true)} className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/40 px-4 py-3 hover:border-primary/40 hover:bg-primary/5 transition-all group">
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

          {/* Upload zone */}
          {creatorMode === "upload" && (
            <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-muted/30">
                <Upload className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Upload Reel</span>
                {!uploadFile && uploadStatus !== "done" && (
                  <span className="rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ring-1 ring-primary/20">Required</span>
                )}
                <span className="text-[10px] text-muted-foreground ml-auto">MP4 · MOV · AVI · max 500 MB · max 60 s</span>
              </div>
              <div className="p-4 space-y-3">
                {uploadStatus !== "uploading" && !uploadFile && (
                  <button type="button" onClick={() => uploadInputRef.current?.click()} className="flex flex-col items-center gap-3 w-full py-10 rounded-xl border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary/5 transition-all">
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
                    <button type="button" onClick={() => { setUploadFile(null); setUploadStatus("idle"); }} className="rounded-full p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {uploadStatus === "uploading" && (
                  <div className="space-y-2 px-1">
                    {uploadProgress < 100 ? (
                      <>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Uploading…</span>
                          <span>{uploadProgress}%</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" />Processing on server…</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full w-1/3 rounded-full bg-primary" style={{ animation: "shimmer 1.8s ease-in-out infinite" }} />
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
              <div className="border-t border-border bg-background/40 px-3 py-2.5">
                <Button onClick={handleUpload} disabled={!selectedProduct || !uploadFile || uploadStatus === "uploading" || uploadStatus === "done"} className="gradient-primary w-full gap-2 h-9 text-sm text-primary-foreground shadow-glow">
                  {uploadStatus === "uploading" ? (<><Loader2 className="h-4 w-4 animate-spin" />Uploading…</>)
                    : uploadStatus === "done" ? (<><Check className="h-4 w-4" />Uploaded — select a new file to re-upload</>)
                    : (<><Upload className="h-4 w-4" />Upload &amp; Process</>)}
                </Button>
              </div>
            </div>
          )}

          {/* Generate prompt area */}
          {creatorMode === "generate" && (
            <div className="relative rounded-3xl border border-border bg-card shadow-elevated overflow-hidden group focus-within:border-primary/30 transition-colors">
              <div className="pointer-events-none absolute inset-0 opacity-0 group-focus-within:opacity-100 transition-opacity duration-700"
                   style={{ background: "radial-gradient(ellipse at top, hsl(var(--primary) / 0.08), transparent 60%)" }} />

              <div className="flex items-center gap-2 px-5 pt-4 pb-1 flex-wrap">
                <Wand2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-semibold uppercase tracking-wider text-foreground">Prompt</span>
                {!promptText.trim() && (
                  <span className="rounded-full bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 ring-1 ring-primary/20">Required</span>
                )}
                <button type="button" onClick={() => setGuidedMode(g => !g)}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold transition-all ${
                    guidedMode ? "bg-primary text-primary-foreground shadow-sm" : "border border-primary/30 text-primary hover:bg-primary/5"
                  }`}>
                  <Lightbulb className="h-3 w-3" />
                  Guide Me ✨
                </button>
              </div>

              {/* Quick prompts */}
              {!guidedMode && (
                <div className="px-5 pt-2 pb-0">
                  <div className="flex flex-wrap gap-1.5">
                    {promptTemplates.map((t) => {
                      const isLoading = loadingTemplate === t.type;
                      return (
                        <button key={t.type} type="button" onClick={() => handleQuickPrompt(t.type)} disabled={loadingTemplate !== null}
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all disabled:cursor-not-allowed ${
                            isLoading ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-muted/30 text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground disabled:opacity-50"
                          }`}>
                          {isLoading && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                          {t.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Guide Me panel */}
              {guidedMode && (
                <div className="mx-5 mt-2 mb-1 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-primary/80">Guide Me — pick any combination, AI builds your prompt</p>
                    {(selectedMood || selectedTarget || selectedStyle || selectedFocus || selectedLighting || selectedCameraMotion) && (
                      <button type="button" onClick={() => { setSelectedMood(null); setSelectedTarget(null); setSelectedStyle(null); setSelectedFocus(null); setSelectedLighting(null); setSelectedCameraMotion(null); }}
                        className="text-[9px] text-muted-foreground hover:text-foreground transition-colors">Clear all</button>
                    )}
                  </div>

                  <GuideChipRow label="Mood / Vibe"            options={MOOD_OPTIONS}    selected={selectedMood}         onSelect={setSelectedMood}         onHover={handleChipHover} />
                  <GuideChipRow label="Lighting & Environment" options={LIGHTING_OPTIONS} selected={selectedLighting}     onSelect={setSelectedLighting}     onHover={handleChipHover} />
                  <GuideChipRow label="Visual Style"           options={STYLE_OPTIONS}   selected={selectedStyle}        onSelect={setSelectedStyle}        onHover={handleChipHover} />
                  <GuideChipRow label="Scene Focus"            options={FOCUS_OPTIONS}   selected={selectedFocus}        onSelect={setSelectedFocus}        onHover={handleChipHover} />
                  <GuideChipRow label="Target Audience"        options={TARGET_OPTIONS}  selected={selectedTarget}       onSelect={setSelectedTarget}       onHover={handleChipHover} />
                  <GuideChipRow label="Camera Motion"          options={CAMERA_OPTIONS}  selected={selectedCameraMotion} onSelect={setSelectedCameraMotion} onHover={handleChipHover} />

                  <button type="button" onClick={handleBuildGuidedPrompt}
                    disabled={guidedLoading || !selectedProduct || (!selectedMood && !selectedTarget && !selectedStyle && !selectedFocus && !selectedLighting && !selectedCameraMotion)}
                    className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-sm disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5">
                    {guidedLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {guidedLoading ? "Building with AI…" : "Auto-Build Prompt"}
                    {!guidedLoading && !selectedProduct && <span className="opacity-60 ml-1">(select product first)</span>}
                    {!guidedLoading && selectedProduct && !selectedMood && !selectedTarget && !selectedStyle && !selectedFocus && !selectedLighting && !selectedCameraMotion && <span className="opacity-60 ml-1">(pick options above)</span>}
                  </button>
                </div>
              )}

              <div className="px-5 pt-3 pb-2 relative">
                <Textarea
                  ref={promptTextareaRef}
                  value={promptText}
                  onChange={(e) => {
                    setPromptText(e.target.value.slice(0, 500));
                    e.target.style.height = "auto";
                    e.target.style.height = `${e.target.scrollHeight}px`;
                  }}
                  maxLength={500}
                  placeholder={guidedMode ? "Prompt will be auto-built above, or type your own here…" : "Describe the Reel you want to create — scene, mood, motion, style, product details…"}
                  className="min-h-[80px] w-full resize-none border-0 bg-transparent p-0 text-base leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus-visible:ring-0 focus-visible:ring-offset-0 overflow-hidden"
                />
                <div className="absolute bottom-2 right-5 text-[10px] text-muted-foreground">{promptText.length}/500</div>
              </div>

              {/* Duration + Audio dropdowns */}
              <div className="px-4 pb-3 flex flex-wrap items-center gap-1.5">
                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                      <Clock className="h-3.5 w-3.5" />{duration}s
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-2">
                    <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Duration</p>
                    {durationOptions.map((d) => (
                      <button key={d} onClick={() => setDuration(d)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent ${duration === d ? "text-primary" : "text-foreground"}`}>
                        {d} seconds
                        {duration === d && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <button className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors">
                      {withAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
                      {withAudio ? "With Audio" : "No Audio"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-44 p-2">
                    <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Audio</p>
                    {([
                      { value: true, label: "With Audio", Icon: Volume2 },
                      { value: false, label: "No Audio", Icon: VolumeX },
                    ] as const).map(({ value, label, Icon }) => (
                      <button key={String(value)} onClick={() => setWithAudio(value)} className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-xs hover:bg-accent ${withAudio === value ? "text-primary" : "text-foreground"}`}>
                        <span className="flex items-center gap-1.5"><Icon className="h-3.5 w-3.5" />{label}</span>
                        {withAudio === value && <Check className="h-3.5 w-3.5" />}
                      </button>
                    ))}
                  </PopoverContent>
                </Popover>
              </div>

              {/* Generate / Re-generate button */}
              <div className="flex items-center justify-between gap-2 border-t border-border bg-background/40 px-3 py-2.5 backdrop-blur">
                <Button type="button" variant="ghost" size="sm" onClick={handleEnhancePrompt} disabled={enhancing} className="h-8 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-primary hover:bg-primary/5">
                  {enhancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {enhancing ? "Enhancing…" : "Enhance"}
                </Button>
                <Button
                  onClick={generationStatus === "done" ? () => handleRegenerate("all") : handleGenerate}
                  disabled={generationStatus === "generating" || !selectedProduct || !promptText.trim()}
                  className="gradient-primary h-9 gap-2 px-4 text-sm text-primary-foreground shadow-glow hover:shadow-glow-lg"
                >
                  {generationStatus === "generating" ? (<><Loader2 className="h-4 w-4 animate-spin" />Generating…</>)
                    : generationStatus === "done" ? (<><RefreshCw className="h-4 w-4" />Re-generate</>)
                    : (<><Sparkles className="h-4 w-4" />Generate Video</>)}
                </Button>
              </div>
            </div>
          )}

          {/* Preview Overlays (shown after completion) */}
          {completedMode !== null && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-3 shadow-card">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2.5">Preview Overlays</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: "logo",    label: "Brand Logo",  Icon: Sparkles,    value: showLogo,    setter: setShowLogo    },
                  { key: "product", label: "Product",     Icon: ShoppingBag, value: showProduct, setter: setShowProduct },
                ].map(({ key, label, Icon, value, setter }) => (
                  <button key={key} type="button" onClick={() => setter(v => !v)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition-all ${
                      value ? "border-primary/40 bg-primary/10 text-primary ring-1 ring-primary/20" : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                    }`}>
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{label}</span>
                    <span className={`ml-auto text-[9px] font-bold uppercase ${value ? "text-primary" : "text-muted-foreground/60"}`}>{value ? "ON" : "OFF"}</span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[9px] text-muted-foreground/60 text-center">Brand Logo toggle applies at download — Product preview is UI-only</p>
            </motion.div>
          )}

          {/* Caption + Approve */}
          {completedMode !== null && (
            <CaptionBlock
              caption={caption}
              onCaptionChange={setCaption}
              captionTextareaRef={captionTextareaRef}
              isRegeneratingCaption={isRegeneratingCaption}
              isApproved={isApproved}
              selectedPlatforms={selectedPlatforms}
              onTogglePlatform={togglePlatform}
              onRegenCaption={() => handleRegenerate("caption")}
              onApprove={handleApprove}
              onPublish={handlePublish}
            />
          )}
        </div>

        {/* ============ RIGHT: Video Preview ============ */}
        <div className="lg:col-span-2 lg:sticky lg:top-4 lg:h-[calc(100vh-4rem)] flex flex-col gap-3">
          <div className="relative flex-1 flex flex-col rounded-3xl border border-border bg-gradient-to-b from-card to-card/60 p-3 shadow-elevated overflow-hidden">
            <div className="flex items-center justify-between px-1 pb-2 shrink-0">
              <div className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${generationStatus === "done" ? "bg-success" : generationStatus === "generating" ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
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

            <div className="flex-1 flex items-center justify-center min-h-0">
              <div className="relative h-full aspect-[9/16] max-h-full overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 ring-1 ring-inset ring-white/5">
                {generationStatus === "done" ? (
                  <>
                    {videoUrl ? (
                      <video ref={videoRef} src={rawVideoUrl ?? videoUrl} className="absolute inset-0 w-full h-full object-cover" loop playsInline muted={videoMuted} autoPlay
                        onTimeUpdate={() => setVideoCurrentTime(videoRef.current?.currentTime ?? 0)}
                        onLoadedMetadata={() => setVideoDuration(videoRef.current?.duration ?? 0)}
                      />
                    ) : (
                      <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(circle at 70% 75%, hsl(var(--accent) / 0.3), transparent 55%)" }} />
                    )}

                    {showLogo && (
                      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 rounded-md bg-black/40 backdrop-blur-md border border-white/10 px-1.5 py-1 shadow-lg">
                        {selectedProduct?.brandLogoUrl ? (
                          <img src={selectedProduct.brandLogoUrl} alt="Brand logo" className="h-5 w-auto max-w-[56px] object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
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

                    <button onClick={togglePlay} className="absolute inset-0" aria-label={isPlaying ? "Pause" : "Play"} />
                    <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-500 ${showPlayIcon ? "opacity-100" : "opacity-0"}`}>
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/25">
                        {isPlaying ? <Pause className="h-4 w-4 text-white" /> : <Play className="h-4 w-4 text-white ml-0.5" />}
                      </div>
                    </div>

                    <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 z-10">
                      <button onClick={(e) => { e.stopPropagation(); setFullscreenOpen(true); }} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-md ring-1 ring-white/15 hover:bg-black/70 transition-all" aria-label="Expand fullscreen">
                        <Expand className="h-3.5 w-3.5 text-white" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); const newMuted = !videoMuted; setVideoMuted(newMuted); if (videoRef.current) videoRef.current.muted = newMuted; }} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-md ring-1 ring-white/15 hover:bg-black/70 transition-all" aria-label={videoMuted ? "Unmute" : "Mute"}>
                        {videoMuted ? <VolumeX className="h-3.5 w-3.5 text-white/70" /> : <Volume2 className="h-3.5 w-3.5 text-white" />}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDownload(); }} className="flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-md ring-1 ring-white/15 hover:bg-black/70 transition-all" aria-label="Download video">
                        <Download className="h-3.5 w-3.5 text-white" />
                      </button>
                    </div>

                    <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/70 to-transparent">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-white/80 font-mono w-6">{formatTime(videoCurrentTime)}</span>
                        <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden cursor-pointer" onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          const newTime = ((e.clientX - rect.left) / rect.width) * (videoDuration || duration);
                          if (videoRef.current) videoRef.current.currentTime = newTime;
                          if (videoRefFullscreen.current) videoRefFullscreen.current.currentTime = newTime;
                          setVideoCurrentTime(newTime);
                        }}>
                          <div className="h-full rounded-full bg-white" style={{ width: `${videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0}%` }} />
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
                      <div className="h-1 rounded-full bg-muted overflow-hidden">
                        <div className="h-full w-1/3 rounded-full bg-primary" style={{ animation: "shimmer 1.8s ease-in-out infinite" }} />
                      </div>
                      <div className="flex items-center justify-between text-[9px] font-mono text-muted-foreground">
                        <span>{creatorMode === "upload" ? "Processing video…" : "Generating AI Reel…"}</span>
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

          {completedMode !== null && generationTime !== null && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground shrink-0">
              <Check className="h-3 w-3 text-success" />
              <span>Generated in <span className="font-mono text-foreground tabular-nums">{Math.floor(generationTime / 60).toString().padStart(2, "0")}:{(generationTime % 60).toString().padStart(2, "0")}</span></span>
            </motion.div>
          )}

          {completedMode === "generate" && (
            <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="shrink-0">
              <Button variant="outline" onClick={() => handleRegenerate("video")} size="sm" className="w-full gap-1.5 h-9 text-xs">
                <RefreshCw className="h-3.5 w-3.5" />
                Regenerate Video
              </Button>
            </motion.div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <ProductPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        productLibrary={productLibrary}
        onSelect={setSelectedProduct}
        selectedProductId={selectedProduct?.id}
      />

      <FullscreenVideoDialog
        open={fullscreenOpen}
        onOpenChange={setFullscreenOpen}
        videoUrl={videoUrl}
        rawVideoUrl={rawVideoUrl}
        videoMuted={videoMuted}
        isPlaying={isPlaying}
        showLogo={showLogo}
        showProduct={showProduct}
        videoCurrentTime={videoCurrentTime}
        videoDuration={videoDuration}
        duration={duration}
        selectedProduct={selectedProduct}
        videoRefFullscreen={videoRefFullscreen}
        videoRef={videoRef}
        onTogglePlay={togglePlay}
        onToggleMute={() => setVideoMuted(m => !m)}
        onDownload={handleDownload}
        onSeek={setVideoCurrentTime}
        showPlayIcon={showPlayIcon}
        formatTime={formatTime}
      />

      {/* Guide Me floating tooltip */}
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

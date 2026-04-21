import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Type, Sparkles, Video, Wand2, Send, Check, Loader2, Brain, Film, Scissors, RefreshCw, Hash, Lightbulb, Play, Pause, Volume2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";

type InputType = "text" | "upload";
type GenerationStatus = "idle" | "generating" | "done";

const promptTemplates = [
  { label: "🛍️ Product Showcase", prompt: "Create a 30-second cinematic Reel showcasing a premium wireless headphone. Highlight its sleek design, noise cancellation feature, and long battery life. Use smooth transitions and upbeat background music." },
  { label: "🔥 Flash Sale", prompt: "Generate an urgent, fast-paced Reel for a 24-hour flash sale on skincare products. Include countdown visuals, bold text overlays with discount percentages, and energetic transitions." },
  { label: "✨ New Arrival", prompt: "Create a stylish unboxing-style Reel for a new summer dress collection. Show the fabric texture, color options, and styling tips. Use soft lighting and trendy music." },
  { label: "📦 Bundle Deal", prompt: "Make a Reel promoting a bundle deal: buy 2 get 1 free on fitness accessories. Show each product briefly, then the bundle together. Add price comparison text overlay." },
  { label: "⭐ Review Highlight", prompt: "Create a Reel compiling top 5-star customer reviews for a bestselling watch. Display review quotes with product shots and satisfied customer vibes." },
  { label: "🎯 How-To / Tutorial", prompt: "Generate a quick tutorial Reel showing 3 ways to style a minimal gold necklace for different occasions: casual, office, and evening. Use split-screen transitions." },
];

const CreateReel = () => {
  const [inputType, setInputType] = useState<InputType>("text");
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [caption, setCaption] = useState("Ready for summer? Check out our new arrival! ✨🏖️ #SummerVibes #MustHave #ReelCast #ShopNow");
  const [promptText, setPromptText] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["yt", "tt", "fb", "ig"]);
  const [showLogo, setShowLogo] = useState(true);
  const [showProduct, setShowProduct] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const { toast } = useToast();

  const inputOptions = [
    { type: "text" as const, icon: Type, label: "Prompt", desc: "Type a prompt" },
    { type: "upload" as const, icon: Upload, label: "Upload Reel", desc: "Upload a video" },
  ];

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
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleGenerate = () => {
    setGenerationStatus("generating");
    setTimeout(() => {
      setGenerationStatus("done");
      setCaption("Ready for summer? Check out our new arrival! ✨🏖️ #SummerVibes #MustHave #ReelCast #ShopNow");
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

  const handleApprove = () => {
    toast({ title: "Approved & Saved!", description: "Reel saved to your library 🎉" });
  };

  const handlePublish = () => {
    const names = platformOptions.filter((p) => selectedPlatforms.includes(p.id)).map((p) => p.label);
    toast({ title: "Published!", description: `Reel has been distributed to ${names.join(", ")} 🎉` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Create Reel</h1>
        <p className="mt-1 text-muted-foreground">Generate commercial Reels with AI — Gemini + Veo + FFmpeg</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left Column */}
        <div className="lg:col-span-3 space-y-5">
          {/* Input Type */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">1. Input Source</h2>
            <div className="grid grid-cols-2 gap-3">
              {inputOptions.map(({ type, icon: Icon, label, desc }) => (
                <button
                  key={type}
                  onClick={() => setInputType(type)}
                  className={`group relative rounded-xl border p-4 text-center transition-all duration-200 ${
                    inputType === type
                      ? "border-primary/40 bg-primary/5 shadow-glow ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-primary/20 hover:bg-muted/30"
                  }`}
                >
                  <Icon className={`mx-auto h-5 w-5 mb-1.5 ${inputType === type ? "text-primary" : "text-muted-foreground"}`} />
                  <p className="text-xs font-semibold text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 hidden sm:block">{desc}</p>
                </button>
              ))}
            </div>

            <div>
              {inputType === "text" && (
                <div className="space-y-3">
                  <Textarea
                    value={promptText}
                    onChange={(e) => setPromptText(e.target.value)}
                    placeholder="Describe the Reel you want — product details, highlights, style..."
                    rows={4}
                    className="bg-muted/50 border-border resize-none"
                  />
                  <div>
                    <div className="flex items-center gap-1.5 mb-2">
                      <Lightbulb className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-medium text-muted-foreground">Quick Templates</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {promptTemplates.map((t) => (
                        <button
                          key={t.label}
                          onClick={() => setPromptText(t.prompt)}
                          className="rounded-lg border border-border bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-foreground transition-all"
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {inputType === "upload" && (
                <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 py-10 transition-colors hover:border-primary/30 hover:bg-primary/5 cursor-pointer">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Upload your Reel video for processing</p>
                  <p className="text-[10px] text-muted-foreground">Supports MP4, MOV (max 100MB)</p>
                  <Button variant="outline" size="sm">Choose Video</Button>
                </div>
              )}
            </div>
          </div>

          {/* Select Product from Library */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">2. Select Product from Library</h2>
            <select className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
              <option>— Select a product —</option>
              <option>Summer Dress Collection</option>
              <option>Minimal Watch — Gold</option>
              <option>Skincare Bundle Set</option>
              <option>Wireless Earbuds Pro</option>
            </select>
          </div>

          {/* Settings */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">3. Settings</h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Video Style</label>
                <select className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option>Cinematic B-Roll</option>
                  <option>Product Showcase</option>
                  <option>Lifestyle</option>
                  <option>Minimalist</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-foreground">Duration</label>
                <select className="w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                  <option>15 seconds</option>
                  <option>30 seconds</option>
                  <option>60 seconds</option>
                </select>
              </div>
            </div>

            {/* Overlays (FFmpeg) */}
            <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3">
              <div className="flex items-center gap-1.5">
                <Scissors className="h-3.5 w-3.5 text-primary" />
                <label className="text-xs font-medium text-foreground">Overlays (FFmpeg)</label>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2">
                <span className="text-xs text-foreground">Show Brand Logo</span>
                <Switch checked={showLogo} onCheckedChange={setShowLogo} />
              </div>
              <div className="flex items-center justify-between rounded-lg bg-card/60 px-3 py-2">
                <span className="text-xs text-foreground">Show Product Image</span>
                <Switch checked={showProduct} onCheckedChange={setShowProduct} />
              </div>
            </div>

            {/* Target Platforms */}
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

          {/* Caption & Publish */}
          {generationStatus === "done" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
              <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">4. Preview & Approve</h2>
              <p className="text-xs text-muted-foreground">Review the AI-generated caption (optimized per platform) — edit before publishing</p>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="bg-muted/50 border-border resize-none"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handlePublish} className="gradient-primary flex-1 gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-11">
                  <Send className="h-4 w-4" />
                  Publish ({selectedPlatforms.length} platforms)
                </Button>
                <Button variant="outline" onClick={handleRegenerate} className="flex-1 gap-2 h-11">
                  <RefreshCw className="h-4 w-4" />
                  Regenerate
                </Button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-5">
          {/* Generate Button */}
          <Button
            onClick={generationStatus === "done" ? handleRegenerate : handleGenerate}
            disabled={generationStatus === "generating"}
            className="w-full gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-12 text-base"
          >
            {generationStatus === "generating" ? (
              <><Loader2 className="h-5 w-5 animate-spin" />AI is generating...</>
            ) : generationStatus === "done" ? (
              <><RefreshCw className="h-5 w-5" />Re-generate</>
            ) : (
              <><Sparkles className="h-5 w-5" />Generate with AI</>
            )}
          </Button>

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
                  {/* Mock video background */}
                  <div className="absolute inset-0" style={{
                    backgroundImage: "radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(circle at 70% 75%, hsl(var(--accent) / 0.3), transparent 55%)"
                  }} />

                  {/* Brand Logo overlay (top-right) */}
                  {showLogo && (
                    <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-2 py-1 shadow-lg">
                      <div className="h-5 w-5 rounded-md gradient-primary flex items-center justify-center">
                        <Sparkles className="h-3 w-3 text-primary-foreground" />
                      </div>
                      <span className="text-[10px] font-bold text-white">REELCAST</span>
                    </div>
                  )}

                  {/* Product overlay (near bottom) */}
                  {showProduct && (
                    <div className="absolute bottom-16 left-3 right-3 flex items-center gap-2.5 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 p-2.5 shadow-xl">
                      <div className="h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center">
                        <ShoppingBag className="h-5 w-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-semibold text-white truncate">Summer Dress Collection</p>
                        <p className="text-[10px] text-white/70">Tap to shop · $49.99</p>
                      </div>
                    </div>
                  )}

                  {/* Center play/pause */}
                  <button
                    onClick={() => setIsPlaying((p) => !p)}
                    className="absolute inset-0 flex items-center justify-center group"
                    aria-label={isPlaying ? "Pause" : "Play"}
                  >
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 backdrop-blur-md ring-1 ring-white/20 group-hover:bg-white/25 transition-all">
                      {isPlaying ? <Pause className="h-6 w-6 text-white" /> : <Play className="h-6 w-6 text-white ml-0.5" />}
                    </div>
                  </button>

                  {/* Bottom controls */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setIsPlaying((p) => !p)} className="text-white shrink-0" aria-label="Toggle play">
                        {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </button>
                      <span className="text-[10px] text-white/80 font-mono">0:08</span>
                      <div className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden">
                        <div className="h-full w-1/3 rounded-full bg-white" />
                      </div>
                      <span className="text-[10px] text-white/80 font-mono">0:30</span>
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
                  <p className="text-sm text-muted-foreground">Veo is generating B-Roll...</p>
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted-foreground/10">
                    <Video className="h-8 w-8 text-muted-foreground/30" />
                  </div>
                  <p className="text-xs text-muted-foreground text-center">Click Generate to let AI create your Reel</p>
                </div>
              )}
            </div>

            {generationStatus === "done" && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Brain className="h-3.5 w-3.5 text-primary" />
                  <label className="text-xs font-medium text-foreground">AI Generated Caption & Hashtags (Gemini)</label>
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

            {generationStatus === "done" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2.5">
                {[
                  ["Duration", "30s"],
                  ["Style", "Cinematic B-Roll"],
                  ["Resolution", "1080×1920"],
                  ["AI Models", "Veo + Gemini"],
                  ["Overlay", "Product Image + Logo ✓"],
                  ["Affiliate", "Embedded ✓"],
                  ["Platforms", `${selectedPlatforms.length} selected`],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground bg-muted px-2 py-0.5 rounded-md">{value}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateReel;
import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Type, Sparkles, Video, Wand2, Send, Check, Loader2, Brain, Film, Scissors, RefreshCw, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type InputType = "text" | "upload";
type GenerationStatus = "idle" | "generating" | "done";

const CreateReel = () => {
  const [inputType, setInputType] = useState<InputType>("text");
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [caption, setCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState(["yt", "tt", "fb", "ig"]);
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
      setCaption("✨ Introducing our new collection! Products that will transform your lifestyle 🔥\n\n#Shopping #NewArrival #MustHave #ReelCast");
      toast({ title: "Reel created successfully!", description: "Ready to preview and publish" });
    }, 3000);
  };

  const handleRegenerate = () => {
    setGenerationStatus("generating");
    setTimeout(() => {
      setGenerationStatus("done");
      setCaption("🛍️ Must-have alert! Premium quality at an unbeatable price ✅\n\n#BestDeal #Shopping #Trending #ReelCast");
      toast({ title: "Regeneration complete!", description: "New version is ready" });
    }, 2500);
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
                <Textarea placeholder="Describe the Reel you want — product details, highlights, style..." rows={4} className="bg-muted/50 border-border resize-none" />
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
          <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="aspect-[9/16] w-full overflow-hidden rounded-2xl bg-muted border border-border">
              <div className="flex h-full flex-col items-center justify-center gap-3 p-6">
                {generationStatus === "done" ? (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-glow">
                      <Video className="h-8 w-8 text-primary-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground">Reel is ready!</p>
                    <p className="text-xs text-muted-foreground text-center">B-Roll + Product Image + Brand Logo Overlay</p>
                  </>
                ) : generationStatus === "generating" ? (
                  <>
                    <div className="relative">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted-foreground/10">
                        <Wand2 className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
                      </div>
                      <div className="absolute -inset-3 animate-pulse rounded-2xl gradient-primary opacity-10 blur-xl" />
                    </div>
                    <p className="text-sm text-muted-foreground">Veo is generating B-Roll...</p>
                  </>
                ) : (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted-foreground/10">
                      <Video className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">Click Generate to let AI create your Reel</p>
                  </>
                )}
              </div>
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
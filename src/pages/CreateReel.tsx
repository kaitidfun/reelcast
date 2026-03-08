import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Link2, Type, Sparkles, Image, Video, Wand2, Send, Check, Loader2, Clock, Play, Instagram, Facebook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const CreateReel = () => {
  const navigate = useNavigate();
  const [inputType, setInputType] = useState<"link" | "image" | "text">("link");
  const [productUrl, setProductUrl] = useState("");
  const [productDesc, setProductDesc] = useState("");
  const [videoStyle, setVideoStyle] = useState("cinematic");
  const [duration, setDuration] = useState("30");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGenerated, setIsGenerated] = useState(false);
  const [generationStep, setGenerationStep] = useState(0);
  const [captions, setCaptions] = useState({ instagram: "", facebook: "" });

  const inputOptions = [
    { type: "link" as const, icon: Link2, label: "Link", desc: "วาง URL สินค้า" },
    { type: "image" as const, icon: Image, label: "Image", desc: "อัปโหลดรูป" },
    { type: "text" as const, icon: Type, label: "Text", desc: "อธิบายสินค้า" },
  ];

  const generationSteps = [
    "วิเคราะห์สินค้า...",
    "สร้าง Script & Caption...",
    "สร้างวิดีโอ B-Roll...",
    "ประมวลผลขั้นสุดท้าย...",
  ];

  const canGenerate = inputType === "link" ? productUrl.trim() !== "" : inputType === "text" ? productDesc.trim() !== "" : false;

  const handleGenerate = () => {
    if (!canGenerate && inputType !== "image") {
      toast.error("กรุณากรอกข้อมูลสินค้าก่อน");
      return;
    }
    setIsGenerating(true);
    setIsGenerated(false);
    setGenerationStep(0);

    // Simulate AI generation progress
    const stepDuration = 800;
    generationSteps.forEach((_, i) => {
      setTimeout(() => setGenerationStep(i + 1), stepDuration * (i + 1));
    });

    setTimeout(() => {
      setIsGenerating(false);
      setIsGenerated(true);
      setCaptions({
        instagram: "✨ เปิดตัวคอลเลคชั่นใหม่! สินค้าที่จะเปลี่ยนไลฟ์สไตล์ของคุณ 🔥\n\n#Shopping #NewArrival #MustHave #ของดี",
        facebook: "🛍️ สินค้าใหม่มาแรง! ดีไซน์สวย คุณภาพเกินราคา\n\n👉 สั่งซื้อได้ที่ลิงก์ใน bio",
      });
      toast.success("สร้าง Reel สำเร็จ!");
    }, stepDuration * generationSteps.length + 400);
  };

  const handlePublish = () => {
    toast.success("เผยแพร่ Reel สำเร็จ! 🎉");
    setTimeout(() => navigate("/"), 1500);
  };

  const handleSave = () => {
    toast.success("บันทึกไว้ใน Library แล้ว");
    setTimeout(() => navigate("/library"), 1500);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Create Reel</h1>
        <p className="mt-1 text-muted-foreground">สร้างวิดีโอ Reel ด้วย AI — ทุกอย่างในหน้าเดียว</p>
      </div>

      {/* Main Layout: Left (Input) + Right (Preview) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        
        {/* ===== LEFT PANEL — Input & Settings ===== */}
        <div className="lg:col-span-3 space-y-5">
          {/* Input Type Selector */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <h2 className="font-display text-base font-semibold text-foreground">ข้อมูลสินค้า</h2>
            </div>

            {/* Input type tabs */}
            <div className="flex gap-2">
              {inputOptions.map(({ type, icon: Icon, label }) => (
                <button
                  key={type}
                  onClick={() => setInputType(type)}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 ${
                    inputType === type
                      ? "gradient-primary text-primary-foreground shadow-glow"
                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 ring-1 ring-border"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Input area */}
            <AnimatePresence mode="wait">
              <motion.div
                key={inputType}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                {inputType === "link" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Product URL</label>
                    <Input
                      placeholder="https://shopee.co.th/product/..."
                      value={productUrl}
                      onChange={(e) => setProductUrl(e.target.value)}
                      className="bg-muted/50 border-border h-11"
                    />
                  </div>
                )}
                {inputType === "image" && (
                  <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 py-10 transition-colors hover:border-primary/30 hover:bg-primary/5 cursor-pointer">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted ring-1 ring-border">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-foreground">ลากไฟล์มาวาง หรือคลิก</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">PNG, JPG, WEBP สูงสุด 10MB</p>
                    </div>
                    <Button variant="outline" size="sm">เลือกไฟล์</Button>
                  </div>
                )}
                {inputType === "text" && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Product Description</label>
                    <Textarea
                      placeholder="อธิบายสินค้าของคุณ เช่น จุดเด่น, กลุ่มเป้าหมาย, โปรโมชั่น..."
                      value={productDesc}
                      onChange={(e) => setProductDesc(e.target.value)}
                      rows={4}
                      className="bg-muted/50 border-border resize-none"
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* Settings row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Video Style</label>
                <Select value={videoStyle} onValueChange={setVideoStyle}>
                  <SelectTrigger className="bg-muted/50 border-border h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cinematic">Cinematic B-Roll</SelectItem>
                    <SelectItem value="showcase">Product Showcase</SelectItem>
                    <SelectItem value="lifestyle">Lifestyle</SelectItem>
                    <SelectItem value="minimal">Minimalist</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Duration</label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger className="bg-muted/50 border-border h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 วินาที</SelectItem>
                    <SelectItem value="30">30 วินาที</SelectItem>
                    <SelectItem value="60">60 วินาที</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || (!canGenerate && inputType !== "image")}
              className="w-full gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-12 text-base disabled:opacity-50"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  กำลังสร้าง...
                </>
              ) : (
                <>
                  <Wand2 className="h-5 w-5" />
                  Generate with AI
                </>
              )}
            </Button>
          </div>

          {/* AI Progress (shows during/after generation) */}
          <AnimatePresence>
            {(isGenerating || isGenerated) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isGenerated ? "bg-success/15" : "bg-primary/10"}`}>
                    {isGenerated ? <Check className="h-4 w-4 text-success" /> : <Loader2 className="h-4 w-4 text-primary animate-spin" />}
                  </div>
                  <h2 className="font-display text-base font-semibold text-foreground">
                    {isGenerated ? "สร้างเสร็จแล้ว ✨" : "AI กำลังทำงาน..."}
                  </h2>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-muted mb-4 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full gradient-primary"
                    initial={{ width: "0%" }}
                    animate={{ width: isGenerated ? "100%" : `${(generationStep / generationSteps.length) * 100}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>

                <div className="space-y-2.5">
                  {generationSteps.map((text, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`flex h-5 w-5 items-center justify-center rounded-full text-xs transition-all ${
                        i < generationStep
                          ? "bg-success/15 ring-1 ring-success/30"
                          : i === generationStep && isGenerating
                          ? "bg-primary/15 ring-1 ring-primary/30"
                          : "bg-muted ring-1 ring-border"
                      }`}>
                        {i < generationStep ? (
                          <Check className="h-2.5 w-2.5 text-success" />
                        ) : i === generationStep && isGenerating ? (
                          <Loader2 className="h-2.5 w-2.5 text-primary animate-spin" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/30" />
                        )}
                      </div>
                      <span className={`text-sm ${i < generationStep ? "text-foreground" : "text-muted-foreground"}`}>{text}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Captions (editable, shows after generation) */}
          <AnimatePresence>
            {isGenerated && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {[
                  { key: "instagram" as const, label: "Instagram", emoji: "📸" },
                  { key: "facebook" as const, label: "Facebook", emoji: "📘" },
                ].map(({ key, label, emoji }) => (
                  <div key={key} className="rounded-2xl border border-border bg-card p-5 shadow-card">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-base">{emoji}</span>
                      <h3 className="font-display text-sm font-semibold text-foreground">Caption — {label}</h3>
                    </div>
                    <Textarea
                      value={captions[key]}
                      onChange={(e) => setCaptions(prev => ({ ...prev, [key]: e.target.value }))}
                      rows={4}
                      className="bg-muted/30 border-border/50 text-sm resize-none"
                    />
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ===== RIGHT PANEL — Preview & Publish ===== */}
        <div className="lg:col-span-2 space-y-5">
          {/* Phone Preview */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-info/10">
                <Play className="h-4 w-4 text-info" />
              </div>
              <h2 className="font-display text-base font-semibold text-foreground">Preview</h2>
            </div>

            <div className="flex justify-center">
              <div className="aspect-[9/16] w-full max-w-[240px] overflow-hidden rounded-2xl border-2 border-border bg-muted/50 relative">
                <AnimatePresence mode="wait">
                  {isGenerating ? (
                    <motion.div
                      key="generating"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex h-full flex-col items-center justify-center gap-3 p-4"
                    >
                      <div className="relative">
                        <div className="flex h-16 w-16 items-center justify-center rounded-2xl gradient-primary shadow-glow">
                          <Wand2 className="h-8 w-8 text-primary-foreground" />
                        </div>
                        <div className="absolute -inset-3 animate-pulse rounded-2xl gradient-primary opacity-20 blur-xl" />
                      </div>
                      <p className="text-xs font-medium text-muted-foreground text-center">AI กำลังสร้างวิดีโอ...</p>
                    </motion.div>
                  ) : isGenerated ? (
                    <motion.div
                      key="generated"
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex h-full flex-col items-center justify-center gap-3 p-4 bg-gradient-to-b from-muted/30 to-muted"
                    >
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10 ring-1 ring-success/30">
                        <Video className="h-8 w-8 text-success" />
                      </div>
                      <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Reel พร้อมแล้ว!</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">จะแสดง preview จริงเมื่อเชื่อมต่อ API</p>
                      </div>
                      <Button variant="outline" size="sm" className="gap-1.5 mt-1">
                        <Play className="h-3 w-3" />
                        ดูตัวอย่าง
                      </Button>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="flex h-full flex-col items-center justify-center gap-3 p-4"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted-foreground/10">
                        <Video className="h-7 w-7 text-muted-foreground/30" />
                      </div>
                      <p className="text-xs text-muted-foreground text-center">กรอกข้อมูลแล้วกด Generate<br />เพื่อดู preview ที่นี่</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Reel Details */}
          <AnimatePresence>
            {isGenerated && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl border border-border bg-card p-5 shadow-card"
              >
                <h3 className="font-display text-sm font-semibold text-foreground mb-4">Reel Details</h3>
                <div className="space-y-3">
                  {[
                    ["Duration", `${duration} seconds`],
                    ["Style", videoStyle === "cinematic" ? "Cinematic B-Roll" : videoStyle === "showcase" ? "Product Showcase" : videoStyle === "lifestyle" ? "Lifestyle" : "Minimalist"],
                    ["Resolution", "1080 × 1920"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium text-foreground bg-muted px-2.5 py-0.5 rounded-lg text-xs">{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Affiliate Link</span>
                    <span className="font-medium text-success bg-success/10 px-2.5 py-0.5 rounded-lg text-xs ring-1 ring-success/20">Embedded ✓</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Publish Actions */}
          <AnimatePresence>
            {isGenerated && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="space-y-3"
              >
                <Button
                  onClick={handlePublish}
                  className="w-full gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-12"
                >
                  <Send className="h-4 w-4" />
                  Publish to Platforms
                </Button>
                <Button variant="outline" onClick={handleSave} className="w-full h-10">
                  Save to Library
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default CreateReel;

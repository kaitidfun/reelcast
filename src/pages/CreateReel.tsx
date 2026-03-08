import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Link2, Type, Sparkles, Image, Video, Wand2, Send, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

type InputType = "link" | "image" | "text";
type GenerationStatus = "idle" | "generating" | "done";

const CreateReel = () => {
  const [inputType, setInputType] = useState<InputType>("link");
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [caption, setCaption] = useState("");
  const { toast } = useToast();

  const inputOptions = [
    { type: "link" as const, icon: Link2, label: "Link", desc: "วาง URL สินค้า" },
    { type: "image" as const, icon: Image, label: "Image", desc: "อัปโหลดรูป" },
    { type: "text" as const, icon: Type, label: "Text", desc: "พิมพ์คำอธิบาย" },
  ];

  const generationTasks = [
    "วิเคราะห์สินค้า",
    "สร้าง Script & Caption",
    "สร้างวิดีโอ B-Roll",
    "ประมวลผลขั้นสุดท้าย",
  ];

  const handleGenerate = () => {
    setGenerationStatus("generating");
    setTimeout(() => {
      setGenerationStatus("done");
      setCaption("✨ เปิดตัวคอลเลคชั่นใหม่! สินค้าที่จะเปลี่ยนไลฟ์สไตล์ของคุณ 🔥\n\n#Shopping #NewArrival #MustHave");
      toast({ title: "สร้าง Reel สำเร็จ!", description: "พร้อม publish แล้ว" });
    }, 3000);
  };

  const handlePublish = () => {
    toast({ title: "Published!", description: "Reel ถูกเผยแพร่ไปยัง platforms แล้ว 🎉" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Create Reel</h1>
        <p className="mt-1 text-muted-foreground">สร้างวิดีโอ Reel ด้วย AI — ทุกอย่างในหน้าเดียว</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Left Column — Input & Settings */}
        <div className="lg:col-span-3 space-y-5">
          {/* Input Type Selector */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-display font-semibold text-foreground text-sm uppercase tracking-wider text-muted-foreground">1. แหล่งข้อมูลสินค้า</h2>
            <div className="grid grid-cols-3 gap-3">
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

            {/* Input Field */}
            <div>
              {inputType === "link" && (
                <Input placeholder="https://shopee.co.th/product/..." className="bg-muted/50 border-border h-11" />
              )}
              {inputType === "image" && (
                <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border/60 py-10 transition-colors hover:border-primary/30 hover:bg-primary/5 cursor-pointer">
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">ลากไฟล์มาวาง หรือคลิกอัปโหลด</p>
                  <Button variant="outline" size="sm">เลือกไฟล์</Button>
                </div>
              )}
              {inputType === "text" && (
                <Textarea placeholder="อธิบายสินค้าของคุณ..." rows={4} className="bg-muted/50 border-border resize-none" />
              )}
            </div>
          </div>

          {/* Settings */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
            <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">2. ตั้งค่า</h2>
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
          </div>

          {/* Caption — shown after generation */}
          {generationStatus === "done" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-5 shadow-card space-y-4">
              <h2 className="font-display font-semibold text-sm uppercase tracking-wider text-muted-foreground">3. Caption & Publish</h2>
              <Textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                rows={4}
                className="bg-muted/50 border-border resize-none"
              />
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handlePublish} className="gradient-primary flex-1 gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-11">
                  <Send className="h-4 w-4" />
                  Publish to Platforms
                </Button>
                <Button variant="outline" className="flex-1 h-11">Save to Library</Button>
              </div>
            </motion.div>
          )}
        </div>

        {/* Right Column — Preview & Generate */}
        <div className="lg:col-span-2 space-y-5">
          {/* Generate Button */}
          <Button
            onClick={handleGenerate}
            disabled={generationStatus === "generating"}
            className="w-full gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-12 text-base"
          >
            {generationStatus === "generating" ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                AI กำลังสร้าง...
              </>
            ) : generationStatus === "done" ? (
              <>
                <Sparkles className="h-5 w-5" />
                Re-generate
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                Generate with AI
              </>
            )}
          </Button>

          {/* Generation Progress */}
          {generationStatus !== "idle" && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="space-y-3">
                {generationTasks.map((text, i) => {
                  const isDone = generationStatus === "done" || (generationStatus === "generating" && i < 2);
                  const isActive = generationStatus === "generating" && i === 2;
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs shrink-0 ${
                        isDone
                          ? "bg-success/15 ring-1 ring-success/30"
                          : isActive
                          ? "bg-primary/15 ring-1 ring-primary/30"
                          : "bg-muted ring-1 ring-border"
                      }`}>
                        {isDone ? (
                          <Check className="h-3 w-3 text-success" />
                        ) : isActive ? (
                          <Loader2 className="h-3 w-3 text-primary animate-spin" />
                        ) : (
                          <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                        )}
                      </div>
                      <span className={`text-sm ${isDone ? "text-foreground" : isActive ? "text-primary" : "text-muted-foreground"}`}>{text}</span>
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
                    <p className="text-sm font-medium text-foreground">Reel พร้อมแล้ว!</p>
                    <p className="text-xs text-muted-foreground">เชื่อมต่อ API เพื่อดู preview จริง</p>
                  </>
                ) : generationStatus === "generating" ? (
                  <>
                    <div className="relative">
                      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted-foreground/10">
                        <Wand2 className="h-8 w-8 text-muted-foreground/40 animate-pulse" />
                      </div>
                      <div className="absolute -inset-3 animate-pulse rounded-2xl gradient-primary opacity-10 blur-xl" />
                    </div>
                    <p className="text-sm text-muted-foreground">กำลังสร้าง...</p>
                  </>
                ) : (
                  <>
                    <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted-foreground/10">
                      <Video className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                    <p className="text-xs text-muted-foreground text-center">กด Generate เพื่อสร้าง Reel</p>
                  </>
                )}
              </div>
            </div>

            {/* Reel Details */}
            {generationStatus === "done" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-2.5">
                {[
                  ["Duration", "30s"],
                  ["Style", "Cinematic B-Roll"],
                  ["Resolution", "1080×1920"],
                  ["Affiliate", "Embedded ✓"],
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

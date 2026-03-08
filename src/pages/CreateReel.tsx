import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, Link2, Type, Sparkles, Image, Video, Wand2, ChevronRight, Send, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const CreateReel = () => {
  const [step, setStep] = useState(1);
  const [inputType, setInputType] = useState<"link" | "image" | "text">("link");

  const inputOptions = [
    { type: "link" as const, icon: Link2, label: "Product Link", desc: "วาง URL สินค้าเพื่อให้ AI วิเคราะห์" },
    { type: "image" as const, icon: Image, label: "Product Image", desc: "อัปโหลดรูปสินค้าโดยตรง" },
    { type: "text" as const, icon: Type, label: "Text Description", desc: "อธิบายสินค้าด้วยข้อความ" },
  ];

  const steps = [
    { num: 1, label: "Input" },
    { num: 2, label: "AI Generate" },
    { num: 3, label: "Preview" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Create Reel</h1>
        <p className="mt-1 text-muted-foreground">สร้างวิดีโอ Reel ด้วย AI อัตโนมัติ</p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 sm:gap-3">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => s.num < step && setStep(s.num)}
              className={`flex items-center gap-2 sm:gap-2.5 rounded-full px-3 py-1.5 sm:px-4 sm:py-2 text-sm font-medium transition-all duration-300 ${
                s.num === step
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : s.num < step
                  ? "bg-primary/15 text-primary ring-1 ring-primary/30 cursor-pointer hover:bg-primary/20"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              <span className={`flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-xs font-bold ${
                s.num < step ? "bg-primary/20" : s.num === step ? "bg-primary-foreground/20" : "bg-muted-foreground/20"
              }`}>
                {s.num < step ? <Check className="h-3 w-3" /> : s.num}
              </span>
              <span className="hidden sm:inline">{s.label}</span>
            </button>
            {i < steps.length - 1 && (
              <div className={`h-px w-6 sm:w-10 transition-colors duration-300 ${
                s.num < step ? "bg-primary/40" : "bg-border"
              }`} />
            )}
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* Step 1 */}
        {step === 1 && (
          <motion.div key="step1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {inputOptions.map(({ type, icon: Icon, label, desc }) => (
                <button
                  key={type}
                  onClick={() => setInputType(type)}
                  className={`group relative rounded-2xl border p-6 text-left transition-all duration-300 card-shine ${
                    inputType === type
                      ? "border-primary/40 bg-primary/5 shadow-glow ring-1 ring-primary/20"
                      : "border-border bg-card hover:border-primary/20 hover:bg-muted/30"
                  }`}
                >
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl transition-all duration-300 ${
                    inputType === type 
                      ? "gradient-primary shadow-glow" 
                      : "bg-muted ring-1 ring-border group-hover:ring-primary/20"
                  }`}>
                    <Icon className={`h-5 w-5 ${inputType === type ? "text-primary-foreground" : "text-muted-foreground group-hover:text-primary"}`} />
                  </div>
                  <p className="mt-4 font-display font-semibold text-foreground">{label}</p>
                  <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </button>
              ))}
            </div>

            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              {inputType === "link" && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Product URL</label>
                  <Input placeholder="https://shopee.co.th/product/..." className="bg-muted/50 border-border h-11" />
                </div>
              )}
              {inputType === "image" && (
                <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-border/60 py-14 transition-colors hover:border-primary/30 hover:bg-primary/5 cursor-pointer">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted ring-1 ring-border">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="text-sm font-medium text-foreground">ลากไฟล์มาวาง หรือคลิกเพื่ออัปโหลด</p>
                    <p className="mt-1 text-xs text-muted-foreground">PNG, JPG, WEBP up to 10MB</p>
                  </div>
                  <Button variant="outline" size="sm">เลือกไฟล์</Button>
                </div>
              )}
              {inputType === "text" && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-foreground">Product Description</label>
                  <Textarea placeholder="อธิบายสินค้าของคุณ เช่น จุดเด่น, กลุ่มเป้าหมาย, โปรโมชั่น..." rows={5} className="bg-muted/50 border-border resize-none" />
                </div>
              )}

              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Video Style</label>
                  <select className="w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option>Cinematic B-Roll</option>
                    <option>Product Showcase</option>
                    <option>Lifestyle</option>
                    <option>Minimalist</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Duration</label>
                  <select className="w-full rounded-xl border border-border bg-muted/50 px-4 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring">
                    <option>15 seconds</option>
                    <option>30 seconds</option>
                    <option>60 seconds</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} className="gradient-primary gap-2 px-8 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-11">
                <Sparkles className="h-4 w-4" />
                Generate with AI
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <motion.div key="step2" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            <div className="rounded-2xl border border-border bg-card p-8 shadow-card">
              <div className="flex flex-col items-center gap-6 py-8">
                <div className="relative">
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-primary shadow-glow-lg">
                    <Wand2 className="h-10 w-10 text-primary-foreground" />
                  </div>
                  <div className="absolute -inset-4 animate-pulse-glow rounded-3xl gradient-primary opacity-20 blur-2xl" />
                </div>
                <div className="text-center">
                  <h3 className="font-display text-xl font-bold text-foreground">AI กำลังสร้าง Reel ของคุณ</h3>
                  <p className="mt-1 text-sm text-muted-foreground">กรุณารอสักครู่...</p>
                </div>
                <div className="w-full max-w-sm space-y-4 mt-2">
                  {["วิเคราะห์สินค้า...", "สร้าง Script & Caption...", "สร้างวิดีโอ B-Roll...", "ประมวลผลขั้นสุดท้าย..."].map((text, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                        i < 2 
                          ? "bg-success/15 ring-1 ring-success/30" 
                          : "bg-muted ring-1 ring-border"
                      }`}>
                        {i < 2 ? <Check className="h-3 w-3 text-success" /> : <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-pulse-glow" />}
                      </div>
                      <span className={`text-sm ${i < 2 ? "text-foreground" : "text-muted-foreground"}`}>{text}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {[
                { platform: "Instagram", emoji: "📸", caption: "✨ เปิดตัวคอลเลคชั่นใหม่! สินค้าที่จะเปลี่ยนไลฟ์สไตล์ของคุณ 🔥", hashtags: "#Shopping #NewArrival #MustHave #ของดี #แนะนำ" },
                { platform: "Facebook", emoji: "📘", caption: "🛍️ สินค้าใหม่มาแรง! ดีไซน์สวย คุณภาพเกินราคา ต้องลองแล้วจะติดใจ", hashtags: "👉 สั่งซื้อได้ที่ลิงก์ใน bio" },
              ].map(({ platform, emoji, caption, hashtags }) => (
                <div key={platform} className="rounded-2xl border border-border bg-card p-6 shadow-card">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{emoji}</span>
                    <h3 className="font-display font-semibold text-foreground">Caption ({platform})</h3>
                  </div>
                  <div className="mt-4 rounded-xl bg-muted/40 p-4 text-sm text-foreground ring-1 ring-border/50">
                    <p>{caption}</p>
                    <p className="mt-2 text-muted-foreground">{hashtags}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                ย้อนกลับ
              </Button>
              <Button onClick={() => setStep(3)} className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300">
                <Video className="h-4 w-4" />
                Preview Reel
              </Button>
            </div>
          </motion.div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <motion.div key="step3" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-6">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <div className="flex flex-col items-center">
                <div className="aspect-[9/16] w-full max-w-[280px] overflow-hidden rounded-3xl border-2 border-border bg-muted shadow-elevated">
                  <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
                    <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-muted-foreground/10">
                      <Video className="h-10 w-10 text-muted-foreground/40" />
                    </div>
                    <div className="text-center">
                      <p className="text-sm font-medium text-muted-foreground">ตัวอย่างวิดีโอ</p>
                      <p className="mt-1 text-xs text-muted-foreground/70">จะแสดงเมื่อเชื่อมต่อ Google Veo API</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
                  <h3 className="font-display font-semibold text-foreground">Reel Details</h3>
                  <div className="mt-5 space-y-4">
                    {[
                      ["Duration", "30 seconds"],
                      ["Style", "Cinematic B-Roll"],
                      ["Resolution", "1080 × 1920"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-foreground bg-muted px-3 py-1 rounded-lg">{value}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">Affiliate Link</span>
                      <span className="font-medium text-success bg-success/10 px-3 py-1 rounded-lg ring-1 ring-success/20">Embedded ✓</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <Button className="gradient-primary w-full gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 h-12">
                    <Send className="h-4 w-4" />
                    Publish to Platforms
                  </Button>
                  <Button variant="outline" className="w-full h-11">Save to Library</Button>
                </div>
              </div>
            </div>

            <div className="flex justify-start">
              <Button variant="outline" onClick={() => setStep(2)} className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                ย้อนกลับ
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default CreateReel;

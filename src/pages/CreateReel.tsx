import { useState } from "react";
import { motion } from "framer-motion";
import { Upload, Link2, Type, Sparkles, Image, Video, Wand2, ChevronRight, Send } from "lucide-react";
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-foreground">Create Reel</h1>
        <p className="mt-1 text-muted-foreground">สร้างวิดีโอ Reel ด้วย AI อัตโนมัติ</p>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-3">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all ${
                s === step
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {s}
            </div>
            <span className={`text-sm ${s === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>
              {s === 1 ? "Input" : s === 2 ? "AI Generate" : "Preview"}
            </span>
            {s < 3 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {inputOptions.map(({ type, icon: Icon, label, desc }) => (
              <button
                key={type}
                onClick={() => setInputType(type)}
                className={`rounded-xl border p-6 text-left transition-all ${
                  inputType === type
                    ? "border-primary bg-primary/5 shadow-glow"
                    : "border-border bg-card hover:border-primary/30"
                }`}
              >
                <Icon className={`h-6 w-6 ${inputType === type ? "text-primary" : "text-muted-foreground"}`} />
                <p className="mt-3 font-display font-semibold text-foreground">{label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>

          <div className="rounded-xl border border-border bg-card p-6 shadow-card">
            {inputType === "link" && (
              <div className="space-y-4">
                <label className="text-sm font-medium text-foreground">Product URL</label>
                <Input placeholder="https://shopee.co.th/product/..." className="bg-muted" />
              </div>
            )}
            {inputType === "image" && (
              <div className="flex flex-col items-center gap-4 rounded-lg border-2 border-dashed border-border py-12">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">ลากไฟล์มาวาง หรือคลิกเพื่ออัปโหลด</p>
                <Button variant="outline" size="sm">เลือกไฟล์</Button>
              </div>
            )}
            {inputType === "text" && (
              <div className="space-y-4">
                <label className="text-sm font-medium text-foreground">Product Description</label>
                <Textarea placeholder="อธิบายสินค้าของคุณ เช่น จุดเด่น, กลุ่มเป้าหมาย, โปรโมชั่น..." rows={5} className="bg-muted" />
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Video Style</label>
                <select className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  <option>Cinematic B-Roll</option>
                  <option>Product Showcase</option>
                  <option>Lifestyle</option>
                  <option>Minimalist</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Duration</label>
                <select className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground">
                  <option>15 seconds</option>
                  <option>30 seconds</option>
                  <option>60 seconds</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setStep(2)} className="gradient-primary gap-2 px-8 text-primary-foreground shadow-glow">
              <Sparkles className="h-4 w-4" />
              Generate with AI
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="rounded-xl border border-border bg-card p-8 shadow-card">
            <div className="flex flex-col items-center gap-6 py-8">
              <div className="relative">
                <div className="flex h-20 w-20 items-center justify-center rounded-2xl gradient-primary shadow-glow">
                  <Wand2 className="h-10 w-10 text-primary-foreground" />
                </div>
                <div className="absolute -inset-3 animate-pulse-glow rounded-2xl gradient-primary opacity-30 blur-xl" />
              </div>
              <h3 className="font-display text-xl font-bold text-foreground">AI กำลังสร้าง Reel ของคุณ</h3>
              <div className="w-full max-w-md space-y-3">
                {["วิเคราะห์สินค้า...", "สร้าง Script & Caption...", "สร้างวิดีโอ B-Roll...", "ประมวลผลขั้นสุดท้าย..."].map((text, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${i < 2 ? "bg-success" : "bg-muted-foreground animate-pulse-glow"}`} />
                    <span className={`text-sm ${i < 2 ? "text-foreground" : "text-muted-foreground"}`}>{text}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h3 className="font-display font-semibold text-foreground">📝 Generated Caption (Instagram)</h3>
              <div className="mt-4 rounded-lg bg-muted p-4 text-sm text-foreground">
                <p>✨ เปิดตัวคอลเลคชั่นใหม่! สินค้าที่จะเปลี่ยนไลฟ์สไตล์ของคุณ 🔥</p>
                <p className="mt-2 text-muted-foreground">#Shopping #NewArrival #MustHave #ของดี #แนะนำ</p>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 shadow-card">
              <h3 className="font-display font-semibold text-foreground">📝 Generated Caption (Facebook)</h3>
              <div className="mt-4 rounded-lg bg-muted p-4 text-sm text-foreground">
                <p>🛍️ สินค้าใหม่มาแรง! ดีไซน์สวย คุณภาพเกินราคา ต้องลองแล้วจะติดใจ</p>
                <p className="mt-2 text-muted-foreground">👉 สั่งซื้อได้ที่ลิงก์ใน bio</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>ย้อนกลับ</Button>
            <Button onClick={() => setStep(3)} className="gradient-primary gap-2 text-primary-foreground shadow-glow">
              <Video className="h-4 w-4" />
              Preview Reel
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="flex flex-col items-center">
              <div className="aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-2xl border border-border bg-muted shadow-card">
                <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
                  <Video className="h-16 w-16 text-muted-foreground" />
                  <p className="text-center text-sm text-muted-foreground">
                    ตัวอย่างวิดีโอจะแสดงที่นี่<br />เมื่อเชื่อมต่อ Google Veo API
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-xl border border-border bg-card p-6 shadow-card">
                <h3 className="font-display font-semibold text-foreground">Reel Details</h3>
                <div className="mt-4 space-y-3">
                  {[
                    ["Duration", "30 seconds"],
                    ["Style", "Cinematic B-Roll"],
                    ["Resolution", "1080 × 1920"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="text-foreground">{value}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Affiliate Link</span>
                    <span className="text-primary">Embedded ✓</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <Button className="gradient-primary w-full gap-2 text-primary-foreground shadow-glow">
                  <Send className="h-4 w-4" />
                  Publish to Platforms
                </Button>
                <Button variant="outline" className="w-full">Save to Library</Button>
              </div>
            </div>
          </div>

          <div className="flex justify-start">
            <Button variant="outline" onClick={() => setStep(2)}>ย้อนกลับ</Button>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default CreateReel;

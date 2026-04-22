

# Create Reel — ปรับให้ Fit หน้าจอ + Reference เด่นชัด + Product บังคับ

## 4 จุดหลักที่จะแก้ใน `src/pages/CreateReel.tsx`

### 1. ลบ "Recent outputs" (History strip) ออกทั้งบล็อก
- ลบบล็อก `Recent outputs` (lines 667–685) ทั้งก้อน
- ลบ `mockHistory` constant และ icon imports ที่ไม่ใช้แล้ว
- ผลลัพธ์: คอลัมน์ซ้ายสั้นลง พอดีกับความสูง preview ฝั่งขวา

### 2. Product = **บังคับใส่** (Required)
- เพิ่ม **banner เตือนสีอ่อน** เหนือ chip toolbar เมื่อยังไม่เลือก product:
  > "📦 Select a product to feature — required for shoppable Reels"
  พร้อมปุ่ม "Choose product" ในตัว
- เปลี่ยนชิป "Product library" เป็น **chip สีเด่น** (border-primary, bg-primary/5) เมื่อยังไม่เลือก + มีจุดแดงเล็กๆ (•) บอก required
- ปุ่ม **Generate disabled** ถ้า `!selectedProduct` พร้อม tooltip/toast: "Please select a product first"
- เพิ่ม validation ใน `handleGenerate`

### 3. Reference = **Optional ชัดเจน + ดูแตกต่าง**
- แยกชิป "Reference" ออกจากกลุ่ม chip toolbar ปกติ → ใส่เป็น **dashed-border chip** สีเทา จาง พร้อม label `(Optional)` ติดข้างๆ:
  > `[+ Reference] Optional · style/inspiration`
- ใช้ `border-dashed border-border/60 text-muted-foreground/70` ต่างจากชิปอื่นที่เป็น solid
- มี hint icon (ⓘ) hover แสดง: "Attach a clip or image as style reference. Leave empty to generate from prompt only."

### 4. Right Column — Real-world Preview Polish + Fit-to-screen
- **Sticky preview** (`lg:sticky lg:top-4`) ให้ preview ติดอยู่กับที่เวลาเลื่อน
- **Compact balance bar**: รวม "Estimated cost" + credits + aspect ratio badge ใน bar เดียว
- **Phone-frame mockup**: เพิ่ม device frame บางๆ รอบ preview (rounded-[2.5rem] border-2 border-zinc-800 + notch ปลอม) ให้ดูเหมือน real device
- **Status pill** บนมุม preview: 🔴 LIVE / 🟢 READY / ⚪ IDLE
- **Pipeline ย่อให้กระชับ**: เปลี่ยนจาก vertical list เป็น **horizontal stepper** (4 dots เชื่อมเส้น) เมื่อ generating → ประหยัดพื้นที่ครึ่งหนึ่ง
- **Caption + Actions**: ย่อให้ tighter — caption textarea 3 rows (จากเดิม 4), spacing แน่นขึ้น

### 5. Fit-to-viewport Optimization
- Container หลักลด `space-y-6` → `space-y-4`, ลด `gap-6` → `gap-5`
- Header padding/margin ลดลง: `mt-1` ไม่ต้อง, ใช้ inline
- Composer monolith: ลด `min-h-[160px]` → `min-h-[120px]` สำหรับ textarea, ลด padding ภายใน
- "Output settings" card กับ "Quick prompts" รวมเป็น **collapsed accordion** ใต้ composer (ไม่ขยายตอนแรก) → ประหยัดความสูง
- Preview phone frame ใช้ `max-h-[calc(100vh-12rem)]` กับ `aspect-[9/16]` คุม

---

## Layout เป้าหมาย (1311×887 viewport)

```text
┌─────────────────────────────────────────────────────────┐
│ Create Reel                              ⚡ 120 credits │
├──────────────────────────────────┬──────────────────────┤
│ ⚠ Select product (required)      │  ┌──────────────┐   │
│ ┌──────────────────────────────┐ │  │              │   │
│ │ [📦 Product*] [+Ref optional]│ │  │  📱 Phone    │   │
│ │                              │ │  │   Preview    │   │
│ │  Prompt textarea (compact)   │ │  │  (sticky)    │   │
│ │                              │ │  │              │   │
│ │ Chips: aspect|style|dur|cam… │ │  │              │   │
│ │ [Enhance][Surprise] [Gen ⚡8]│ │  └──────────────┘   │
│ └──────────────────────────────┘ │  ● Pipeline stepper │
│ ▸ Quick prompts                  │  Caption + Actions  │
│ ▸ Output settings                │                     │
└──────────────────────────────────┴──────────────────────┘
```

ทุกอย่าง fit ใน viewport เดียวบนจอ ≥900px — ไม่ต้อง scroll

---

## Technical Details
- ไฟล์เดียว: `src/pages/CreateReel.tsx`
- ลบ: `mockHistory`, history block, icon imports ที่ไม่ใช้
- เพิ่ม validation: `handleGenerate` check `selectedProduct` ก่อน
- Disabled state: `disabled={generationStatus==='generating' || !selectedProduct}`
- Sticky: `lg:sticky lg:top-4 lg:self-start` บน right column wrapper
- Phone frame: nested wrapper รอบ aspect-[9/16] เดิม
- Horizontal stepper: เปลี่ยน Pipeline `space-y-3` → `flex items-center gap-2` + connector lines
- Output settings + Quick prompts ห่อด้วย shadcn `Accordion type="multiple"` defaultValue=[] (collapsed)



# Create Reel — Real-World AI Studio Redesign

ปรับหน้า Create Reel ให้เหมือนเครื่องมือ AI Video จริง (Sora / Runway / Kling / Veo) — Prompt เป็นหัวใจหลัก, Upload Reel กลายเป็น **optional add-on** ไม่ใช่โหมดแยก

## Core Concept Change

**ก่อน:** Toggle 2 ปุ่ม — "Prompt" หรือ "Upload Reel" (เลือกอย่างใดอย่างหนึ่ง)
**หลัง:** Prompt **อยู่ตลอดเวลา** + ช่อง Upload เป็น optional reference (เช่น "อิงสไตล์จากคลิปนี้" หรือ "remix จากวิดีโอเก่า")

---

## เลือก 1 ใน 3 แบบ (ฉันจะส่ง prototype ให้ดูก่อนทำจริง)

### Option A — "Sora-style" Hero Composer
- Prompt เป็น **textarea ขนาดใหญ่กลางจอ** เหมือน ChatGPT / Sora
- ใต้ prompt มี **toolbar แถวเดียว** (chip-style): 📎 Attach Reference · 🎨 Style · ⏱️ Duration · 📐 Aspect · 🎬 Camera · 🔊 Audio
- กด chip ไหน popover เด้งให้เลือก
- Upload กลายเป็นปุ่ม 📎 ใน toolbar — กดแล้วโชว์ thumbnail เล็กๆ ติดอยู่บน prompt
- Settings เก่าทั้งหมดยุบเข้า toolbar/popover → หน้าโล่งสุด
- Quick Templates เป็น chip ด้านล่าง prompt

### Option B — "Runway-style" Split Composer
- Prompt textarea เด่นด้านบน + ปุ่ม ✨ Enhance / 🎲 Surprise me
- ใต้ prompt มี **"Reference (optional)" dropzone แบบ collapsed** — โชว์เป็นแถบบางๆ "+ Add reference video/image" กดแล้วขยาย
- ขวามือเป็น **panel settings แบบ stacked cards** — Style / Duration / Audio / Advanced
- Product Library เป็น **chip ติดบน prompt** ("📦 Summer Dress") ลบออกได้
- ปุ่ม Generate ใหญ่ติด sticky ด้านล่าง

### Option C — "Kling-style" Tabbed Modes
- Header tabs: **Text-to-Video** (default) · **Image-to-Video** · **Video-to-Video**
- ทุก tab มี prompt เหมือนกัน — tab ต่างกันแค่ "input ที่แนบเพิ่ม" (รูป / วิดีโอ)
- Upload อยู่ใน tab Image/Video-to-Video เท่านั้น (optional ตาม tab)
- Settings panel เดียวใช้ร่วมกันทุก tab
- Visual: tabs เป็น pill-style ด้านบน prompt

---

## Common Improvements (ทำเหมือนกันทั้ง 3 แบบ)

1. **ลบ "Input Source" toggle เดิม** — Prompt ไม่ใช่ตัวเลือกอีกต่อไป มันคือ default
2. **Upload = Optional Reference** — แนบ clip/image เป็น style reference ไม่ใช่แทน prompt
3. **Aspect Ratio selector** เพิ่มใหม่ (9:16 / 1:1 / 16:9) — ของจริง AI gen ทุกตัวมี
4. **Seed number** field ใน Advanced — สำหรับ reproducibility
5. **Resolution selector** (480p / 720p / 1080p) — ผูกกับ credit cost (1080p แพงกว่า)
6. **Dynamic credit cost** — ราคาเปลี่ยนตาม duration × resolution × voiceover (เช่น 5 → 12 credits)
7. **History strip** ด้านล่าง — thumbnail รีลที่เพิ่ง gen 3-4 ตัวล่าสุด คลิก preview ได้
8. **"Surprise me 🎲"** ปุ่มข้างๆ Enhance — สุ่ม prompt creative

---

## Technical Details

- ไฟล์เดียว: `src/pages/CreateReel.tsx`
- State ใหม่: `referenceFile` (File | null), `aspectRatio`, `resolution`, `seed`, `history[]`
- ลบ state `inputType` (ไม่จำเป็นแล้ว) — Option C จะใช้ `mode` แทน
- ใช้ shadcn `Popover` สำหรับ chip toolbar (Option A), `Tabs` สำหรับ Option C
- Credit cost คำนวณแบบ memoized: `useMemo(() => base + durationCost + resCost, [duration, resolution, voiceover])`
- Reference upload: file input ซ่อน + button trigger, preview thumbnail แบบ removable chip
- ไม่แตะ Right Column (Preview) — คงไว้เหมือนเดิม

---

## Next Step

ฉันจะสร้าง **3 prototypes** (HTML mockup เห็นภาพจริง) ให้ดูเลือกก่อน แล้วค่อย implement ตัวที่ชอบ

**กดอนุมัติ plan นี้** → ฉันจะเปิด default mode แล้ว generate prototype ทั้ง 3 แบบให้เลือกผ่าน `ask_questions` (type: prototype) ก่อนลงมือแก้โค้ดจริง

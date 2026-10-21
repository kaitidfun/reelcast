# Project memory

## F5 / Data Tracking

- [Proposal เทียบกับโค้ด F5 — 20 ตุลาคม 2026](F5_PROPOSAL_COMPARISON_2026-10-20.md): อ่าน Google Docs ReelCast_v2.2.0 แล้วเทียบโค้ด HEAD `b42b52a` พบ proposal ยังมี shops/orders/CTR/ROI แต่ F5 ใหม่ใช้ social observations และ ReelCast link visits พร้อม ranking/comparison/CSV/XLSX ตามขอบเขตที่ตกลงไว้ อย่าเพิ่ม commerce กลับโดยอาศัย proposal เดิมเพียงอย่างเดียว
- จุดต้องจำ: Social เป็น lifetime observation ไม่ใช่ period activity; filters หน้าเว็บอยู่เฉพาะ comparison; comparison แทน unavailable เป็น 0; Social Growth บน UI ยังไม่มีคอลัมน์แยกใน export; legacy commerce ยังอยู่ใน models/adapter แต่ไม่ใช่ F5 reporting flow ใหม่
- งานนี้เป็นการวิเคราะห์และบันทึกเท่านั้น ไม่ได้เปลี่ยนแอป ฐานข้อมูล หรือ proposal และไม่ได้ยืนยัน live provider/worker readiness รายละเอียดหลักฐาน ข้อจำกัด และหัวข้อเอกสารที่ต้องปรับอยู่ในรายงานข้างต้น

## การแก้เอกสารภายหลัง — 20 ตุลาคม 2026

- ตามคำสั่งผู้ใช้ เขียน Change Request No.5 ใน Google Docs `1cwYtWJ0ILTSFfBlFe-enk5xtu-GB-ipPqvnl5KbJf-Q` แล้ว โดยให้เหตุผลเรื่องข้อจำกัด e-commerce API และอธิบายการเปลี่ยนขอบเขตจาก CR No.3 เดิม ยังไม่อ้างว่า stakeholder อนุมัติแล้ว
- ตามคำสั่งถัดมา แก้ proposal Google Docs `1890ma-ip3WWFejhz3eFNqeCFV29lKseqd6-J6R2seGY` ใน Motivation, architecture descriptions, tracking limits และ Feature 5 ให้ตรงโค้ดปัจจุบันครบ 6 UCs พร้อมข้อจำกัด observation/filters/comparison/export โดยไม่ได้แก้ application code
- ผู้ใช้ให้แจ้งกรณี Figure จึงคงภาพเดิมไว้: ตรวจผ่านหน้า Google Docs พบ Figure 19 หน้า 52 ของเอกสารหลังแก้ยังมี E-Commerce Shop (TikTok Shop/Shopee/Lazada) และ Receive Tracking Order/Click ต้องปรับเป็น Social adapter/observations และ Viewer → tracking redirect → affiliate destination แยกจาก worker sync
- Figure 26 หน้า 71 หลังแก้ระบุ F5 Views/Clicks อยู่แล้ว ไม่พบ shop/orders ในภาพนี้ แต่ภาพแสดงเดือนกันยายน 2569 ควรทวนช่วงวันที่ให้ตรง Schedule Plan Final Progress 19 ตุลาคม–2 พฤศจิกายน 2026 เลขหน้าอาจเปลี่ยนเมื่อจัดหน้าใหม่
- บันทึกการเปรียบเทียบเดิมเป็นหลักฐานก่อนแก้ proposal; อย่าอ่านถ้อยคำว่า “ยังไม่ได้แก้ proposal” ในรายงานเดิมเป็นสถานะล่าสุด
- ผู้ใช้ขอให้ 4.5.1 Feature 5 มีสำนวนและความยาวเหมือน Feature อื่น จึงย่อเป็น Actor: Member, Description หนึ่งประโยค และ Detail 3 bullets โดยรวม social sync/link clicks, dashboard/ranking และ period comparison/CSV/XLSX ไม่แสดงรหัส UC หรือรายละเอียด implementation ยาวในส่วน feature overview อีกต่อไป
- ผู้ใช้ขอให้ Tracking and API Constraints ใน 4.2.1.3 Limits กระชับเหมือนข้ออื่น จึงย่อเหลือหนึ่งย่อหน้าประมาณ 44 คำ คงข้อจำกัด e-commerce API, social permissions/cumulative observations และ repeat link visits ที่ไม่ยืนยัน purchases/ROI

# Memory: Proposal เทียบกับ F5 ในโค้ดปัจจุบัน

ตรวจวันที่ 20 ตุลาคม 2026 (Asia/Bangkok) ตามคำขอให้อ่าน proposal เทียบ F5 และบันทึกผล ไม่ได้แก้แอป ฐานข้อมูล หรือเอกสารบน Google Docs

## แหล่งข้อมูลและขอบเขตหลักฐาน

- Proposal ที่อ่านจริง: [ReelCast_v2.2.0](https://docs.google.com/document/d/1890ma-ip3WWFejhz3eFNqeCFV29lKseqd6-J6R2seGY/edit) ผ่าน Google Docs connector รวมข้อความ tab `t.0`
- Document revision ที่อ่าน: `AHj4eMTcQ-Mw5DRpx760Nc6RbwmBPZH1noxKC5tYWFGlCw7IQMow-ehzuRUIfnUfizlu4TXAm6pY3nn1e-rm4ffyY-hfDd7yNSKOH5xJPpg`
- โค้ด HEAD: `b42b52a7813f8bb605902e84e67307749ba9ddb8` โดย working tree สะอาดก่อนเริ่มงาน
- อ่านข้อความทั้งเอกสารและตรวจส่วนที่เกี่ยวกับ F5: 1.2, 4.1–4.3 และ 4.5.1 ไม่ได้ตรวจรายละเอียดที่อยู่ในภาพ architecture/diagram จึงไม่อ้างว่าแก้หรือยืนยันเส้นเชื่อมในภาพแล้ว
- ใช้ตำแหน่งข้อความ Google Docs แทนเลขหน้า เพราะไม่ได้ render เอกสารเป็น PDF
- เทียบโค้ด UI/routes/services/models/worker/provider registry และชุดทดสอบ ไม่ได้เรียก Social API จริง ไม่ได้ตรวจ deployment, token/permissions หรือสถานะ worker/Beat จริง

## ข้อสรุปสำคัญสำหรับงานครั้งถัดไป

Proposal ยังเป็นขอบเขต **Social + E-commerce shops + orders/CTR + ROI** แต่ F5 ปัจจุบันเป็น **Social observations + ReelCast affiliate-link visits + dashboard/ranking/comparison/export** ตามขอบเขตใหม่ที่บันทึกในสกิล f5 ตั้งแต่ 15 ต.ค. 2026

การไม่มี shop/orders ใน F5 ใหม่เป็นการเปลี่ยนขอบเขตที่ตกลงไว้ ไม่ใช่เหตุให้เพิ่มกลับอัตโนมัติ การตรวจครั้งนี้ไม่ถือเป็นการอนุมัติเปลี่ยนขอบเขตใหม่หรือการยืนยันว่าอาจารย์อนุมัติแล้ว หากปรับ proposal ให้ตรงโค้ด ต้องปรับข้อความ architecture และ limitations ด้วย ไม่ใช่แก้เฉพาะ Feature 5

## ตารางจุดต่าง

| ประเด็น | Proposal | โค้ดปัจจุบัน | ความหมาย |
|---|---|---|---|
| เชื่อมร้านค้า | F5 ระบุ TikTok Shop, Shopee, Lazada และ sync tracking data | F5 backend provider map มี youtube/facebook/instagram/tiktok เท่านั้น; หน้า Tracking ไม่มี shop connection; ใช้ SocialAccount จาก F3 | เปลี่ยนขอบเขตหลัก ไม่ตรง proposal เดิม |
| Orders/conversion/ROI | F5 description กล่าวถึง ROI; architecture กล่าวถึง orders/clicks เป็น conversion metrics | F5 ใหม่ไม่มี orders/revenue/commission/purchase conversion หรือ financial ROI ในรายงาน | ห้ามอ้างว่าวัดผลยอดซื้อ/ROI ได้จาก views และ clicks |
| CTR | ระบุ sync orders และ CTR ที่เกิดจาก embedded affiliate links | บันทึก GET ผ่าน redirect link ของ ReelCast; ไม่มี marketplace CTR หรือการยืนยันว่าคลิกตามหลังการดูวิดีโอ | clicks ไม่เท่ากับ CTR และไม่เท่ากับ conversion |
| แหล่งข้อมูลคลิก | อยู่ในบริบทข้อมูลจาก e-commerce integration | TrackingLink ผูก distribution; Viewer เปิดแล้วบันทึก TrackingClick ก่อน 302 redirect ไป affiliate URL เดิม | แหล่งข้อมูลเปลี่ยนเป็นเหตุการณ์ที่ ReelCast เก็บเอง |
| Social performance | รองรับ YouTube Shorts, Facebook, Instagram, TikTok และ views/popularity | มี adapter/social sync พร้อม views/likes/comments/shares/engagement ตาม field ที่มี; map กับ published distributions ของเจ้าของ | สอดคล้องในเชิงความสามารถของโค้ด แต่ยังไม่ยืนยัน live integration |
| Dashboard/charts | รวม e-commerce และ social เพื่อวิเคราะห์ภาพรวม | รวม social กับ link clicks; totals, platform charts, top products/campaigns/Reels และรายละเอียด | ยังมี dashboard แต่ชุดข้อมูลเปลี่ยน |
| Ranking | F5 ระบุ comprehensive analysis แบบกว้าง | จัดอันดับ Reel/product/campaign/platform ด้วย views/likes/comments/shares/engagement/clicks | เป็นรายละเอียดที่เพิ่มจากข้อความ F5 เดิม |
| Period comparison | F5 เดิมไม่ได้แจกแจงการเทียบ A/B | มี A/B, difference, percentage และ coverage; Social ใช้ยอด lifetime ล่าสุดที่สังเกตในแต่ละช่วง | เพิ่มความสามารถ แต่ไม่ใช่ Social activity รายช่วง |
| CSV/XLSX export | ส่วน F5 เดิมไม่ได้ระบุ export | API/UI มี CSV UTF-8 BOM และ XLSX Summary + Details; ส่งออกข้อมูลทั้งหมดใน scope ไม่จำกัดหน้าตาราง | เพิ่มความสามารถจาก proposal F5 เดิม |
| Actor | F5 ระบุ Member เท่านั้น | Member ดูรายงาน/สั่ง sync/export; Viewer เปิดลิงก์; scheduler เริ่ม sync อัตโนมัติ; F3 เรียกเตรียมลิงก์ระหว่าง publish | UC/actor ต้องแจกแจงให้ตรงบทบาท |

## ข้อจำกัดและความต่างภายใน implementation ปัจจุบัน

1. **Social dates เป็น observation dates:** `detail_rows` เลือก observation ล่าสุดต่อ distribution ภายในช่วง ไม่รวม snapshot หลายวันซ้ำ และไม่สามารถบอกจำนวน views ที่เกิดในช่วงนั้นหรือย้อนหลังถึงก่อนเริ่มเก็บข้อมูลได้ คลิกจึงมีความหมายด้านเวลาต่างจาก Social
2. **ตัวกรอง UI อยู่เฉพาะ comparison:** Dashboard เรียก `fetchTrackingDashboard({})`; ranking ส่งเพียง level/metric; export details ส่ง options ว่าง ส่วน comparison มี date/platform/campaign/product/Reel filters และ export ตามค่าที่ apply แล้ว Backend รองรับ filters ทั้ง dashboard/analysis/export อยู่แล้ว จึงต้องแยก API capability ออกจากสิ่งที่ผู้ใช้เลือกได้บน UI
3. **Unavailable ไม่สม่ำเสมอ:** dashboard/ranking เก็บ null/partial_metrics; comparison ใช้ `_totals(..., unavailable_as_zero=True)` และ UI ระบุ Unavailable = 0 การแสดง Social Growth อาจชวนให้ตีความข้อมูลขาดเป็นยอดศูนย์
4. **Comparison export ไม่เหมือน UI ทั้งหมด:** UI คำนวณ Social Growth และ Growth Rate เอง; API `social_comparison` เป็น null แม้มี a.social/b.social; export มี social detail A/B แต่ไม่มีคอลัมน์ Social Growth แยกเหมือนหน้าจอ สรุป difference/percentage หลักเป็นของ clicks
5. **Coverage เป็นเงื่อนไขคลิก:** ใช้เวลาสร้างลิงก์ล่าสุดใน scope และช่วงต้องจบก่อนวันนี้ ไม่ใช่หลักฐานว่าข้อมูล Social ครบ ช่วงที่ partial ยังส่ง difference/percentage ของคลิกอยู่ พร้อมคำอธิบายข้อจำกัด เมื่อ baseline = 0 ให้ percentage เป็น null
6. **ลิงก์ไม่ได้รับประกัน clickable ทุกแพลตฟอร์ม:** F3 worker สร้าง/ใช้ tracking link แล้วแนบใน caption ระหว่าง publish; หน้า Tracking ไม่มีปุ่มสร้างลิงก์ Instagram/TikTok caption มีข้อจำกัดที่ UI ระบุไว้แล้ว shared bio link ไม่ยืนยัน Reel ต้นทาง
7. **Click count เป็น visits รวมการเข้าซ้ำ:** ไม่ใช้ IP/cookie เพื่อยืนยัน unique visitor; ตัด HEAD, prefetch, user-agent bot/preview ที่รู้จักแบบ heuristic; ไม่ยืนยันว่าตัด bot ได้ครบ
8. **Legacy commerce ยังอยู่บางชั้น:** `Analytics`/`EcommerceAccount` ยังอยู่ใน models และ adapter registry ยังลงทะเบียน tiktok_shop/shopee/lazada จึงห้ามบอกว่าลบ commerce ออกจากทั้ง repository แล้ว แต่ F5 routes/provider map ใหม่ไม่ได้ใช้เป็นรายงาน shop ตาม proposal
9. **เอกสารใน repo มีบางข้อความล้าสมัย:** `F5_IMPLEMENTATION.md` บอกว่า CSV ปกติ/ranking มี metadata columns แต่ `report_bytes` ปัจจุบันสร้าง metadata ไว้โดยไม่ได้แนบลง CSV ปกติ/rankingจริง; CSV comparison เพิ่ม summary/coverage/limitation ขณะที่ XLSX มี Summary นอกจากนี้ API มี daily click trend แต่ UI ปัจจุบันรวมแสดง clicks by platform ไม่ใช่กราฟรายวัน ข้อมูลโค้ดมีน้ำหนักเหนือเอกสารนี้เมื่อไม่ตรงกัน

## ตำแหน่ง proposal ที่ควรปรับหากได้รับคำสั่งแก้เอกสาร

- **4.5.1 Feature 5**, text indices 52237–53121: เปลี่ยน description/รายละเอียด shop integration, orders, CTR, ROI; ระบุ 6 UCs ใหม่พร้อม metric semantics และข้อจำกัดตามจริง
- **4.3.1.1 System Architecture**, indices 43170 และ 44215–44580: Worker ไม่ได้รับ order conversions ใน F5 ใหม่; เปลี่ยนคำอธิบาย e-commerce ecosystem ให้ตรง social adapter และ first-party tracking redirect พร้อมทบทวน Figure 19 แยกต่างหาก
- **4.2.1.3 Limits** (ชื่อหัวข้อที่เอกสารใช้จริง), index 45898: limitation เดิมพูดถึงการเชื่อม shop และ order tracking; ควรแทนด้วย social permissions/metric availability, history coverage, link clickability และความหมาย visits
- **4.1 Motivation**, index 38916: เอกสารเองระบุว่า PoC วัดความสำเร็จผ่าน UAT/เวลา/technical validation และหลีกเลี่ยง business goals ที่วัดไม่ได้ แต่ F5 description ยังกล่าว ROI จึงมีความไม่สอดคล้องภายใน proposal อยู่แล้ว การมี social engagement reporting ไม่ได้แปลว่าใช้ engagement เป็นเกณฑ์ความสำเร็จโครงการ
- อย่าเพิ่ม sales import, manual sales entry หรือ AI recommendation ว่าเป็นข้อกำหนดที่พบใน Feature 5 ของ proposal นี้ เพราะข้อความ F5 ที่อ่านไม่ได้ระบุไว้
- ไม่มีการแก้ Google Docs หรือยืนยันการอนุมัติขอบเขตโดย stakeholder ในงานครั้งนี้

## จุดอ้างอิงโค้ดที่ตรวจ

- `backend/app/routes/tracking_routes.py:18` filters/ownership; `:36` sync; `:62` dashboard; `:94` comparison; `:101` export; `:134` link creation; `:145` redirect
- `backend/app/services/tracking_service.py:22` supported platforms/metrics; `:112` snapshot/date semantics; `:153` null aggregation; `:182` dashboard; `:224` comparison/coverage; `:253` link creation; `:276` click rules
- `backend/app/services/tracking_provider_service.py:35` social-only map; `:58` configuration-only readiness
- `backend/app/services/tracking_export_service.py:49` report generation; `:64` comparison fields; `:69` ranking; `:77` normal details; `:81` comparison CSV summary; `:103` CSV serialization; `:109` XLSX summary
- `backend/app/worker.py:66` dispatch 15 seconds; `:73` scheduled sync 900 seconds; `:735` F3 uses F5 tracking link during publish
- `backend/app/models/models.py:52` TrackingObservation; `:75` TrackingLink; `:85` TrackingClick; `:457` legacy analytics; `:489` EcommerceAccount
- `tracking-provider-adapter/app/services/__init__.py:10` legacy shop providers still registered
- `frontend/src/app/(main)/tracking/page.tsx:198` MetricGrowth; `:305` comparison request with filters; `:415` unavailable note; `:464` unfiltered dashboard request; `:519` export scope; `:670` ranking request

## การตรวจสอบ

- Frontend: รัน `npm test -- "src/app/(main)/tracking/page.test.tsx" "src/hooks/useTrackingSync.test.tsx"` ผ่าน 2 files / 24 tests รวม scope comparison, export, unavailable/zero, pagination และ sync polling
- มีคำเตือน chart width/height = 0 ในสภาพแวดล้อมทดสอบ DOM จำลอง ผลนี้ไม่ใช่การตรวจ layout ของ browser จริง
- Backend: รัน `venv/Scripts/python.exe -m pytest tests/unit/test_tracking.py tests/unit/test_tracking_adapter_errors.py tests/unit/test_tracking_sync_jobs.py -q` ได้จุดผ่านกรณีแรก แล้วไม่มีความคืบหน้าต่อ จึงหยุดด้วย interrupt ไม่ได้ผลสรุปชุดทดสอบและไม่ถือว่า backend ผ่านครบ; ยังไม่ได้วินิจฉัยสาเหตุการค้าง
- การทดสอบใช้ข้อมูลจำลอง ไม่ใช่หลักฐานการเชื่อมต่อ provider จริง และไม่ได้รัน migration หรือแก้ live database

# Feature 5 — Data Tracking

อัปเดตตามโค้ดใน repository วันที่ 17 ตุลาคม 2026 เอกสารนี้อธิบายพฤติกรรมที่ implement อยู่ ไม่ใช่การยืนยันว่า provider API, worker หรือ deployment จริงพร้อมใช้งาน

ขอบเขตนี้ใช้บัญชี social จาก Feature 3 เท่านั้น ไม่มี shop OAuth/sync, Orders, revenue, commission, sales import หรือ purchase conversion ใน F5 UI/API ใหม่ ข้อมูล analytics/ecommerce เดิมยังเก็บไว้โดยไม่แปลงวันที่ที่มีความหมายไม่ชัดเจนเป็นประวัติใหม่

## กติกาที่ตกลง

- Social เป็นยอดสะสมล่าสุดที่สังเกตได้ **ภายในช่วงวันที่เลือก** ไม่ใช่กิจกรรมในช่วงนั้นหรือวันที่เผยแพร่ การซิงก์ซ้ำอัปเดต observation ของบัญชี/โพสต์/วัน Asia/Bangkok เดียวกัน (เก็บ timestamp เป็น UTC) และ dashboard เลือกเพียง observation ล่าสุดต่อ distribution
- ช่วงวันที่รายงานใช้ Asia/Bangkok โดยแปลงขอบเขตวันเป็น UTC เวลาที่เผยแพร่กับเวลาที่ซิงก์แยกกัน
- คลิกเป็น GET ที่บันทึกผ่าน ReelCast link ทุกครั้ง รวมการเข้าซ้ำ ไม่เก็บ IP/cookie และไม่อ้างว่าเป็น unique visitor ตัด HEAD, prefetch และ user-agent ที่รู้จักว่าเป็น bot/crawler/preview ออก การตรวจบอตเป็น heuristic จึงไม่รับประกันตัดบอตได้ทั้งหมด
- เก็บ affiliate destination ตรงตามที่สินค้าให้ไว้เมื่อสร้างลิงก์ ไม่เติมหรือแก้พารามิเตอร์ affiliate ลิงก์เดิมคง destination และ source distribution เดิมเมื่อแชร์ซ้ำ
- Dashboard, ranking และ detail rows เก็บค่าไม่มีข้อมูลเป็น null/Unavailable แยกจากศูนย์ ผลรวมที่มีบางค่าขาดระบุ `partial_metrics` **ยกเว้น comparison overview** ซึ่งรวม Social โดยถือค่าที่ไม่มีเป็น 0 และแสดงคำอธิบายข้อจำกัดนี้ใน UI
- YouTube engagement = likes + comments; TikTok/Instagram = likes + comments + shares; Facebook video = likes + comments; Facebook Page post = reactions + comments + shares โดยต้องมีทุกองค์ประกอบ Facebook reactions ไม่ใช่ likes และ impressions/reach ไม่ใช่ video views
- การจัดอันดับเทียบสินค้า/แคมเปญ/Reel/แพลตฟอร์มในขอบเขตเดียวกัน มีบาง social metric ที่ไม่เทียบกันได้ครบข้ามแพลตฟอร์ม
- Comparison แสดงคลิกที่เกิดในแต่ละช่วง และ Social lifetime observations ล่าสุดต่อ distribution ภายในแต่ละช่วง หน้าเว็บคำนวณ Growth = B − A และ Growth Rate = (B − A) / A × 100 สำหรับคลิกและ views/likes/comments/shares โดย baseline ศูนย์แสดง `—` ส่วน Social daily activity ยังไม่มี จึงห้ามตีความ Social Growth ว่าเป็นกิจกรรมที่เกิดภายในช่วงนั้น
- API ส่ง `difference` และ `percentage_change` ของคลิกแม้ coverage ไม่ครบหรือช่วงยังไม่จบ พร้อม `a.complete`, `b.complete`, `equal_duration` และข้อความข้อจำกัด; `social_comparison` ยังเป็น null แต่มี `a.social`/`b.social` ให้ UI คำนวณเอง Coverage ใช้เวลาสร้างลิงก์ล่าสุดใน scope และถือว่าครบเมื่อสร้างก่อนเริ่มช่วงและวันสิ้นสุดผ่านไปแล้ว Coverage นี้เป็นเงื่อนไขของคลิก ไม่ใช่หลักฐานประวัติ Social ครบ
- Comparison และ comparison export บังคับแต่ละช่วงให้ start < end (อย่างน้อย 2 วันเมื่อรวมวันต้น/ปลาย), B เริ่มหลังวันสิ้นสุด A และไม่มีวันที่เกินวันนี้ตาม Asia/Bangkok; ยอมรับช่วงที่จบวันนี้แต่ระบุ partial coverage

## การเปิดใช้งาน

1. ตรวจ schema ก่อนเริ่ม API/worker: `backend/app/main.py` เรียก `Base.metadata.create_all` เพื่อสร้างตารางที่ยังไม่มี ได้แก่ `tracking_observations`, `tracking_links`, `tracking_clicks`, `tracking_sync_runs`, `tracking_sync_jobs`, `tracking_sync_gates` แต่ไม่เพิ่มคอลัมน์ให้ตารางที่มีอยู่แล้ว `backend/scripts/f5_schema.sql` ครอบคลุมเฉพาะ 3 ตาราง observation/link/click จึงใช้แทน schema ปัจจุบันทั้งหมดไม่ได้ สำหรับ durable sync ให้รัน `python scripts/migrate_tracking_sync.py` จากโฟลเดอร์ backend ด้วย environment ของ backend; script สร้าง 3 ตาราง sync และเติม `tokens_refreshed`/`provider_cursor` ให้ schema รุ่นก่อนหน้า การอัปเดตเอกสารครั้งนี้ไม่ได้รัน migration
2. Restart tracking-provider-adapter พร้อม backend/worker ให้ใช้ contract รุ่นเดียวกัน: request มี `post_ids`, `single_page`, `page_cursor`, `timeout_seconds`; response มี nullable social fields, `warnings`, `next_cursor`
3. ใช้ค่า social adapter URL/key เดิมใน backend และ provider settings เดิมใน adapter กำหนด BACKEND_URL เป็น public HTTPS URL ที่ผู้ชมเข้าถึงได้เพื่อให้ redirect links เปิดได้จริง
4. เชื่อมบัญชีผ่าน Feature 3 แล้วเผยแพร่ Reel ที่มี provider post ID จากนั้นกด Sync Data ใน Tracking ต้องมี Redis/Celery broker, worker ที่รับ `sync-queue` และ Beat สำหรับงานตามเวลา Beat สร้างรอบ sync ทุก 900 วินาทีและ dispatch งานค้างทุก 15 วินาที การกด Sync รับงานเป็น HTTP 202 แล้วประมวลผลเบื้องหลัง ไม่ได้ยืนยันว่า worker/Beat บนเครื่องกำลังทำงาน
5. การเผยแพร่ใหม่ที่สินค้ามี affiliate URL จะสร้าง ReelCast link ต่อ distribution และแทน URL ใน caption อัตโนมัติ URL ต้องเป็น HTTP(S) ที่ถูกต้อง หากผิดให้แก้สินค้าก่อน retry หน้า Tracking ไม่มีฟอร์มสร้างลิงก์หรือปุ่ม Get link ผู้ใช้ใส่ affiliate URL ของสินค้าแล้วระบบสร้าง tracking link ระหว่าง Distribute ไม่แก้โพสต์เก่าอัตโนมัติ Instagram/TikTok caption ไม่รับประกันว่าเปิดลิงก์ได้ และ bio link ที่แชร์ร่วมกันไม่ระบุ Reel ต้นทาง
6. F5 ใหม่ไม่อ่าน legacy analytics ที่มีวันที่ไม่ชัดเจน ต้องซิงก์ใหม่เพื่อเริ่ม observations ที่ถูกต้อง

## สิ่งที่ตรวจแล้วและข้อจำกัด

- Ownership ถูกตรวจที่ account, Reel/distribution และ filter IDs; provider UUID ที่ส่งมาไม่ใช้เป็นหลักฐาน mapping post ต้องตรงกับ published distribution ของบัญชีนั้น
- PostgreSQL unique constraints และ ON CONFLICT ทำให้ observation/link creation ซ้ำไม่เพิ่มแถว Observation ที่ timestamp เก่ากว่าเขียนทับข้อมูลใหม่ไม่ได้ การ sync ปัจจุบัน commit/rollback **ต่อ batch** ผลของ batch ที่สำเร็จแล้วคงอยู่แม้ batch ถัดไปล้มเหลว ไม่ rollback ทั้งบัญชี
- Worker แบ่ง known post IDs เป็น YouTube 50, TikTok 20, Facebook/Instagram 4 IDs ต่อ batch; Meta เรียกข้อมูลตามแต่ละ post ID และ Facebook ดึงหลายโพสต์พร้อมกันภายใต้ขีดจำกัด หากไม่มี known IDs จะ discovery ทีละหน้าด้วย `single_page` และบันทึก `next_cursor` เพื่อทำหน้าถัดไปจนจบหรือครบ deadline ของ job เพดาน 10 หน้าเป็น fallback ของ adapter เมื่อไม่ได้ขอ `single_page` ไม่ใช่เพดานรวมของ durable job
- เมื่อ provider ไม่คืนโพสต์บางรายการ เก็บ observations เดิมและแจ้ง warning หาก metric ใหม่ขาดองค์ประกอบที่เคยมี จะเก็บ observation เดิมทั้งแถวพร้อม timestamp เดิม ไม่ผสมค่าเก่ากับค่าใหม่แล้วอ้างว่าเพิ่งซิงก์
- Refresh token ของ YouTube/TikTok ก่อนอ่าน metrics เมื่อมี token; YouTube ที่ไม่มี refresh token ต้อง reconnect Token ที่หมุนใหม่ถูกบันทึกก่อนเรียก metrics เพื่อไม่สูญหายเมื่อคำขอถัดไปล้มเหลว รายละเอียด retry และข้อผิดพลาดอยู่ในหัวข้อ Sync ด้านล่าง
- CSV เป็น UTF-8 BOM; XLSX เป็น Summary + Details มีหัวตาราง, freeze row, filter และจัดรูปแบบเซลล์ text เพื่อป้องกัน formula injection ข้อมูลที่ส่งออกไม่จำกัดตามหน้าตาราง UI Comparison export เรียง A/B ของ publication เดียวกันติดกัน มีค่าของทั้งสองช่วงและสรุป difference/percentage/coverage ของคลิก ไม่ได้ส่ง Social Growth ที่ UI คำนวณเป็นคอลัมน์แยก Comparison details ใช้ชื่อเนื้อหาและแพลตฟอร์มแทน internal IDs; CSV comparison เพิ่มคอลัมน์สรุปคลิก ส่วน CSV ปกติ/ranking มีคอลัมน์ metadata
- การทดสอบใช้ฐานข้อมูลจำลองและ provider responses จำลอง ไม่ได้ยิง social API จริงหรือยืนยันสิทธิ์ของบัญชีที่เชื่อมอยู่ โดยเฉพาะ Meta metrics ขึ้นกับ Graph version และ permissions ค่า configuration-only readiness ไม่ใช่หลักฐานว่า API พร้อมใช้
- Facebook Video ID ใช้ fields views/likes/comments ของ Video ส่วน Page post ID ใช้ reactions/comments/shares ไม่แทน views ด้วย impressions ส่วน Instagram ใช้ views/plays เมื่อ API ส่งให้ ไม่แทนด้วย reach
- ตารางคลิกยังไม่มี retention/archival policy Dashboard ใช้ SQL เลือก observation ล่าสุดต่อ distribution และนับคลิกแบบ group ก่อนคืน detail rows ที่ตรง filter ทั้งหมด; UI แบ่งหน้าละ 25 แถว ยังไม่มี server-side pagination ควรพิจารณาเมื่อจำนวน distribution สูง

## Sync เบื้องหลังและการกู้คืนงาน

- `tracking_sync_jobs.py` เป็นเส้นทางหลักของ manual sync และ Beat; `sync_member`/`sync_social_account` ใน `tracking_provider_service.py` ยังอยู่เป็น helper เดิม แต่ไม่ได้เป็น entry point ของ `POST /sync` ปัจจุบัน
- `tracking_sync_runs` เก็บรอบของ Member, `tracking_sync_jobs` เก็บงานต่อบัญชีพร้อม post IDs/checkpoint/cursor/warnings และ `tracking_sync_gates` เก็บเวลาพักระดับ platform กดซ้ำขณะรอบเดิมยัง active จะคืนรอบเดิม และ partial unique index กัน active job ซ้ำต่อบัญชี
- Commit งานลงฐานข้อมูลก่อนส่ง Celery message ซึ่งมีเพียง job UUID หาก broker ใช้ไม่ได้ งานยังอยู่ในฐานข้อมูลให้ dispatcher ส่งใหม่ การประมวลผลใช้ row lock และ lease token อายุ 90 วินาทีเพื่อกัน worker เก่าหรือ message ซ้ำเขียนผลหลังถูกยึดงานคืน ไม่มี DB session เปิดค้างระหว่าง provider I/O
- สถานะต่อบัญชีคือ `queued`, `running`, `retry`, `done`, `partial`, `failed`; สถานะรวมคือ `running` เมื่อยังมี active job, `done` เมื่อทุกบัญชี done มิฉะนั้น `partial` Response มี `completed_posts`, `total_posts`, จำนวน metrics, warnings และ `next_attempt_at` ของงาน retry โดย progress เป็น checkpoint การประมวลผล ไม่ใช่จำนวนโพสต์ที่มี counters ครบ
- ค่า backend: `TRACKING_SYNC_TIMEOUT_SECONDS` default 30 วินาที, `TRACKING_SYNC_PLATFORM_JOBS` default 2 งานพร้อมกันต่อ platform ข้าม Members, `TRACKING_SYNC_JOB_MAX_SECONDS` default 1800 วินาที Worker จำกัด fetch แต่ละ batch 60 วินาที และส่ง budget ให้ adapter สูงสุด 24 วินาที
- Adapter ใช้ HTTP client ร่วมในคำขอเดียว มี deadline/concurrency limit และ budget สำหรับ optional metrics; retry เฉพาะ statistics reads ที่กำหนดไว้เมื่อเจอ 502/503/504 พร้อม jitter หาก retry ของ adapter หมดแล้วจะส่งสัญญาณให้ worker ไม่คูณ retry ซ้ำ Worker เลื่อนงานที่ retry ได้โดยมีขีดจำกัด; 429 ใช้ Retry-After และ platform gate ส่วน 401/403 หรือข้อผิดพลาดที่ต้อง reauthorize จบเป็น partial/failed โดยเก็บ batch เดิม
- `last_synced_at` อัปเดตเมื่อบัญชีจบ `done` เท่านั้น งาน partial แสดง `sync_error`/warnings แม้บาง batch จะมีข้อมูลใหม่ เมื่อ job เกิน deadline จะจบ partial หากมี metrics แล้ว มิฉะนั้น failed Dispatcher ลบ run ที่เก่ากว่า 7 วันและ terminal jobs ที่ไม่ได้อัปเดตเกิน 7 วัน
- `useTrackingSync` กู้สถานะล่าสุดเมื่อเปิดหน้าใหม่ poll โดยเริ่มหลัง 500 ms แล้วทุก 2 วินาทีเมื่อสำเร็จ backoff เมื่อมีปัญหาสูงสุด 30 วินาที พักเมื่อซ่อนหน้า/offline และกลับมาตรวจเมื่อมองเห็นหน้า/online; เมื่อจบรอบเรียกโหลดรายงานใหม่ สถานะ 401/403/404 หยุด poll และแสดงข้อความให้ดำเนินการต่อ

## การใช้งานตาม 6 Use Cases

| Use case | พฤติกรรมในโค้ดปัจจุบัน |
| --- | --- |
| UC01 Sync Social Performance | Member กด Sync หรือ Beat enqueue งานต่อบัญชีของ YouTube, Facebook, Instagram, TikTok ผ่าน social accounts ของ F3; ดูสถานะผ่าน sync API |
| UC02 Track Affiliate Link Clicks | F5 รับผิดชอบสร้าง/คืน Tracking Link ต่อ distribution ให้ F3 เรียกใช้ระหว่าง publish หรือผ่าน owner-only API และบันทึกคลิกเมื่อ Viewer เปิด public redirect; การเตรียมลิงก์กับการเปิดลิงก์เป็นคนละ flow และเกิดคนละเวลา |
| UC03 View Tracking Dashboard | แสดง totals, platform charts, daily click trend, top 5 ของ product/campaign/Reel, details และ freshness/error ของบัญชี; API รองรับ date/platform/campaign/product/Reel filters |
| UC04 Analyze and Rank Content | จัดอันดับระดับ `reel`, `product`, `campaign`, `platform` ด้วย `views`, `likes`, `comments`, `shares`, `engagement`, `clicks`; API รองรับ filters แต่ปุ่ม Analyze/Export ของ ranking ใน UI ปัจจุบันส่งเพียง level/metric จึงเป็นขอบเขตทุกข้อมูลของ Member |
| UC05 Compare Periods | ใช้ scope เดียวกันกับ A/B; คลิกเป็นกิจกรรมในช่วง ส่วน Social เป็นยอดสะสมที่สังเกตในช่วง พร้อม Growth/coverage/ข้อจำกัดตามด้านบน |
| UC06 Export Tracking Data | ส่งออก details, ranking หรือ comparison เป็น CSV/XLSX; ตรวจ ownership/filter ซ้ำและคืน 404 เมื่อไม่มีแถว |

## ข้อตกลงขอบเขต Tracking Link ระหว่าง F3 และ F5

แนวทางที่เลือก: **คง Tracking Link ใน F5 แล้วให้ F3 เรียกใช้** คงทั้ง 6 Use Cases และรหัส F5 เดิม F5 เป็นเจ้าของความสามารถสร้างลิงก์ เก็บ affiliate destination บันทึกคลิก และรายงานผล ส่วน F3 รับผิดชอบเรียกเตรียมลิงก์และแนบใน caption ระหว่างเผยแพร่ การแบ่งความรับผิดชอบนี้สอดคล้องกับ worker ที่เรียก `tracking_service.ensure_tracking_link` อยู่แล้ว ไม่ต้องย้าย endpoint หรือโค้ดเพื่อเปลี่ยนขอบเขตเอกสาร

F5-UC02 มีสอง flow ที่แยก trigger และเวลา:

1. **เตรียม Tracking Link:** กระบวนการเผยแพร่ F3 เรียกใช้เมื่อสินค้ามี affiliate URL; F5 ตรวจ ownership และคืนลิงก์เดิมของ distribution หรือสร้างใหม่พร้อมตรวจ destination แล้ว F3 นำ URL ไปแนบใน caption หน้า Tracking ไม่มีขั้นตอนให้ Member กดสร้างลิงก์ แม้ backend จะมี owner-only API สำหรับสร้าง/คืนลิงก์
2. **บันทึกการเปิดลิงก์:** Viewer เปิด Tracking Link ภายหลัง; F5 ตรวจ code บันทึกคลิกตามกติกา GET/bot/prefetch และ redirect ไปยัง destination โดยไม่ต้อง login Member เป็นผู้ใช้รายงาน ไม่ใช่ผู้กระตุ้นเหตุการณ์คลิก และ flow นี้ไม่ใช่ขั้นตอนต่อเนื่องภายในรอบ publish เดียวกัน

ข้อกำหนดประกอบ: ไม่มี affiliate URL ให้ F3 เผยแพร่ต่อโดยไม่แนบ Tracking Link; การ retry distribution เดิมใช้ลิงก์และ destination เดิม; หากต้องสร้างลิงก์ใหม่แต่ URL ไม่ถูกต้องหรือสร้างลิงก์ล้มเหลว worker จบ publish เป็น Failed ตามโค้ดปัจจุบัน ลิงก์ถูกสร้างก่อนเรียกแพลตฟอร์มจึงอาจคงอยู่แม้ publish ล้มเหลว การมีลิงก์ไม่ยืนยันว่าเผยแพร่สำเร็จแล้ว

### รายการปรับเอกสาร SRS/SDD ที่เกี่ยวข้อง

รายการต่อไปนี้เป็นแผนปรับเอกสารอ้างอิง ไม่ใช่การยืนยันว่าแก้ PDF แล้ว:

- **SRS v1.7.0 — F3-UC06: Publish Reel to Platform (หน้า 91–95):** เพิ่มขั้นตอนเรียกความสามารถเตรียมลิงก์ของ F5-UC02 ก่อนส่ง caption, alternative เมื่อไม่มี affiliate URL และ exception เมื่อเตรียมลิงก์ไม่สำเร็จ พร้อม postconditions ที่แยกสถานะลิงก์จากผล publish
- **F3-URS06 และข้อกำหนดย่อย:** เพิ่มการสร้าง/ใช้ลิงก์เดิมและการแนบ caption ให้ตรงกันทั้งส่วน UC06 หน้า 95 และส่วนรวมข้อกำหนดหน้า 144–145
- **F3-UC07 / F3-UC08:** คงการเรียก UC06 เดิม ไม่คัดลอก flow เตรียมลิงก์ซ้ำ; UC07 อ้างอิงว่าการ retry ใช้ลิงก์เดิม ส่วน UC03 ยังคงเป็นการสร้างกำหนดเวลา ไม่เพิ่มการสร้างลิงก์ตอน schedule
- **SRS — F3-AD06 (หน้า 126):** เพิ่มเงื่อนไขมี affiliate URL และการเรียกเตรียมลิงก์ก่อนเผยแพร่ พร้อมเส้นทางข้อผิดพลาด
- **SDD v1.5.0 — F3-MD07 (หน้า 45–46) / F3-SD07 (หน้า 70–71):** เพิ่มการเรียก `ensure_tracking_link` แบบมีเงื่อนไข การอ่าน/สร้าง TrackingLink และประกอบ caption โดยอ้างอิงรายละเอียดความสามารถไป F5; data model/data dictionary ระบุ TrackingLink และความสัมพันธ์กับ Distribution/TrackingClick
- **Use Case Diagram:** ไม่เพิ่ม `«include»` จาก F3-UC06 ไปยัง F5-UC02 ทั้งก้อน เพราะจะสื่อว่าการ publish รวม flow ที่ Viewer เปิดลิงก์ด้วย ใช้ cross-reference ใน flow และแสดงการเรียกเตรียมลิงก์ใน Sequence Diagram

## API

Endpoints ต่อไปนี้อยู่ใต้ `/api/tracking` และต้อง login:

| Method/path | หน้าที่ |
| --- | --- |
| `POST /sync` | HTTP 202: enqueue/reuse รอบ sync และคืนสถานะ ไม่รอ provider sync จบ |
| `GET /sync/latest` | สถานะรอบล่าสุดของ Member หรือ null ถ้าไม่มี |
| `GET /sync/{run_id}` | สถานะรอบที่เป็นเจ้าของ; 404 เมื่อไม่พบ/เป็นของคนอื่น ค่า `job_id` ระดับ response รวมใช้เป็น run_id สำหรับ poll |
| `GET /dashboard` | สรุป, charts และ details |
| `GET /analysis?level=...&metric=...` | จัดอันดับตามระดับ/metric ที่รองรับ |
| `GET /comparison?a_start=...&a_end=...&b_start=...&b_end=...` | เปรียบเทียบ A/B พร้อม scope เดียวกัน |
| `GET /export?format=csv\|xlsx` | ส่งออก details; เพิ่ม level/metric สำหรับ ranking หรือวันที่ A/B สำหรับ comparison |
| `GET /filter-options` | platforms และ campaign/product/Reel/distribution ที่มาจาก published distributions ของ Member |
| `GET /readiness` | ตรวจว่าตั้งค่า adapter URL หรือไม่ พร้อม `configuration_only: true` |

Dashboard/analysis/comparison/export รองรับ `start`, `end`, `platform`, `campaign_id`, `product_id`, `reel_id`; comparison ใช้วันที่ A/B แทน start/end ของรายงานปกติ Filter ID ตรวจ ownership และ soft deletion; platform/level/metric หรือช่วงวันที่ไม่ถูกต้องคืน 422

`POST /api/tracking/links/{distribution_id}` สร้าง/คืนลิงก์ของเจ้าของเท่านั้น `GET|HEAD /api/tracking/r/{code}` เป็น public redirect HTTP 302 ที่ส่ง `Cache-Control: no-store` และ `Referrer-Policy: no-referrer`; code ที่ไม่พบคืน 404 ไม่มี endpoint ingest metric แบบ Member

## จุดอ้างอิงโค้ดและการทดสอบ

- API: `backend/app/routes/tracking_routes.py`; aggregation/links: `backend/app/services/tracking_service.py`; export: `backend/app/services/tracking_export_service.py`
- Sync: `backend/app/services/tracking_sync_jobs.py`, `backend/app/services/tracking_provider_service.py`, `backend/app/worker.py`; schema: `backend/app/models/models.py`, `backend/scripts/migrate_tracking_sync.py`
- Providers: `tracking-provider-adapter/app/services/{youtube,tiktok,facebook,instagram,base,sync_policy}.py`
- UI/contracts: `frontend/src/app/(main)/tracking/page.tsx`, `frontend/src/hooks/useTrackingSync.ts`, `frontend/src/lib/api.ts`
- Tests ที่มี: `backend/tests/unit/test_tracking.py`, `test_tracking_sync_jobs.py`, `test_tracking_adapter_errors.py` ครอบคลุม ownership, snapshots, links, comparison/export, query counts, checkpoints, stale workers, broker failures และ retry; adapter มี `test_sync_policy.py` และ `test_*_sync_resilience.py`; frontend มี `page.test.tsx` และ `frontend/src/hooks/useTrackingSync.test.tsx`
- `backend/tests/unit/test_tracking_sync_postgres.py` เป็น opt-in ผ่าน `TRACKING_SYNC_POSTGRES_TEST=1` เพื่อทดสอบ concurrency ใน PostgreSQL schema แยก การมีไฟล์ทดสอบไม่ได้ยืนยันผลรันล่าสุดหรือการเชื่อม Social API จริง

## Provider references

- [YouTube video counters](https://developers.google.com/youtube/v3/docs/videos) และ [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [TikTok Display API query videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query)
- [Meta official SDK Post fields/edges](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/post.py)

## TikTok publish ID และ public video ID

F3 เก็บ publish job ID จาก Content Posting API จึงต้องเรียก status/fetch เพื่อหา public video ID ก่อนใช้ Display API video/query และคง external_ref เป็น publish job เดิมเพื่อจับคู่ distribution ไม่เปลี่ยน privacy ของโพสต์ ถ้ายังไม่มี public ID (เช่น SELF_ONLY หรือยังไม่ผ่าน moderation) ให้แสดง counters เป็น Unavailable ไม่ใช่ศูนย์ วันที่เผยแพร่ที่ไม่รู้เป็น null

อ้างอิง: [TikTok Get Post Status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status).

## YouTube token refresh

ระบบขอ offline access และ consent ตอนเชื่อม Google และต้องได้ refresh token ก่อนบันทึกการเชื่อมใหม่ เก็บ refresh token เดิมเมื่อ Google ตอบกลับแค่ access token ใหม่ (Google ไม่ได้ออก refresh token ใหม่ทุกครั้ง) เมื่อ refresh สำเร็จจึงบันทึก token ที่เข้ารหัส; เมื่อเกิดปัญหาเครือข่าย/429/5xx ลองอีกครั้งหนึ่ง แต่ invalid_grant ไม่ retry และแสดงให้ reauthorize บัญชีเดิมโดยไม่ลบประวัติ Distribution

หาก Google คืน invalid_grant ให้กด Reconnect YouTube Shorts และอนุญาต Google ใหม่ ตรวจสถานะ OAuth consent screen และข้อกำหนดการหมดอายุของ token กับเอกสาร Google ด้านล่าง โค้ดใน repository ไม่ยืนยันสถานะโครงการหรือสิทธิ์ provider ของ deployment จริง

อ้างอิง: [Google refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration) และ [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server).

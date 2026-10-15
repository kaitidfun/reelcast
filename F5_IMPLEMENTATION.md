# Feature 5 — Data Tracking

ขอบเขตนี้ใช้บัญชี social จาก Feature 3 เท่านั้น ไม่มี shop OAuth/sync, Orders, revenue, commission, sales import หรือ purchase conversion ใน F5 UI/API ใหม่ ข้อมูล analytics/ecommerce เดิมยังเก็บไว้โดยไม่แปลงวันที่ที่มีความหมายไม่ชัดเจนเป็นประวัติใหม่

## กติกาที่ตกลง

- Social เป็นยอดสะสมล่าสุดที่สังเกตได้ **ภายในช่วงวันที่เลือก** ไม่ใช่กิจกรรมในช่วงนั้นหรือวันที่เผยแพร่ การซิงก์ซ้ำอัปเดต observation ของบัญชี/โพสต์/วัน Asia/Bangkok เดียวกัน (เก็บ timestamp เป็น UTC) และ dashboard เลือกเพียง observation ล่าสุดต่อ distribution
- ช่วงวันที่รายงานใช้ Asia/Bangkok โดยแปลงขอบเขตวันเป็น UTC เวลาที่เผยแพร่กับเวลาที่ซิงก์แยกกัน
- คลิกเป็น GET ที่บันทึกผ่าน ReelCast link ทุกครั้ง รวมการเข้าซ้ำ ไม่เก็บ IP/cookie และไม่อ้างว่าเป็น unique visitor ตัด HEAD, prefetch และ user-agent ที่รู้จักว่าเป็น bot/crawler/preview ออก การตรวจบอตเป็น heuristic จึงไม่รับประกันตัดบอตได้ทั้งหมด
- เก็บ affiliate destination ตรงตามที่สินค้าให้ไว้เมื่อสร้างลิงก์ ไม่เติมหรือแก้พารามิเตอร์ affiliate ลิงก์เดิมคง destination และ source distribution เดิมเมื่อแชร์ซ้ำ
- ค่าไม่มีข้อมูลเป็น null/Unavailable แยกจากศูนย์ ผลรวมที่มีบางค่าขาดระบุ partial metrics
- YouTube engagement = likes + comments; TikTok/Instagram = likes + comments + shares; Facebook video = likes + comments; Facebook Page post = reactions + comments + shares โดยต้องมีทุกองค์ประกอบ Facebook reactions ไม่ใช่ likes และ impressions/reach ไม่ใช่ video views
- การจัดอันดับเทียบสินค้า/แคมเปญ/Reel/แพลตฟอร์มในขอบเขตเดียวกัน มีบาง social metric ที่ไม่เทียบกันได้ครบข้ามแพลตฟอร์ม
- เปรียบเทียบช่วงเวลาได้สำหรับคลิกเท่านั้นในรอบนี้ Social daily activity ยังไม่มี จึงไม่คำนวณจากยอดสะสม ส่วนต่าง/เปอร์เซ็นต์คลิกจะแสดงเมื่อทั้งสองช่วงจบแล้วและมี coverage ครบเท่านั้น baseline ศูนย์แสดงเปอร์เซ็นต์ unavailable และแจ้งเมื่อจำนวนวันไม่เท่ากัน Coverage ใช้เวลาสร้างลิงก์ล่าสุดใน scope เพื่อไม่ถือว่าช่วงก่อนเริ่มเก็บข้อมูลเป็นศูนย์ที่วัดได้

## การเปิดใช้งาน

1. Restart backend หลังตรวจ schema: ระบบเดิมเรียก `Base.metadata.create_all` ตอนเริ่มแอป จึงเพิ่มตาราง `tracking_observations`, `tracking_links`, `tracking_clicks` ใหม่ได้ ตารางเดิมไม่ถูกแก้ หากใช้ migration แยก ให้ใช้ `backend/scripts/f5_schema.sql` แทน ก่อนเริ่ม worker
2. Restart tracking-provider-adapter พร้อม backend เพราะเพิ่ม contract `post_ids` และ nullable social fields ให้ใช้ version นี้คู่กัน
3. ใช้ค่า social adapter URL/key เดิมใน backend และ provider settings เดิมใน adapter กำหนด BACKEND_URL เป็น public HTTPS URL ที่ผู้ชมเข้าถึงได้เพื่อให้ redirect links เปิดได้จริง
4. เชื่อมบัญชีผ่าน Feature 3 แล้วเผยแพร่ Reel ที่มี provider post ID จากนั้นกด Sync Data ใน Tracking หรือใช้ worker และ beat เดิม (ทุก 900 วินาที) ไม่ได้ยืนยันว่า worker/beat บนเครื่องกำลังทำงาน
5. การเผยแพร่ใหม่ที่สินค้ามี affiliate URL จะสร้าง ReelCast link ต่อ distribution และแทน URL ใน caption อัตโนมัติ URL ต้องเป็น HTTP(S) ที่ถูกต้อง หากผิดให้แก้สินค้าก่อน retry หน้า Tracking ไม่มีฟอร์มสร้างลิงก์หรือปุ่ม Get link ผู้ใช้ใส่ affiliate URL ของสินค้าแล้วระบบสร้าง tracking link ระหว่าง Distribute ไม่แก้โพสต์เก่าอัตโนมัติ Instagram/TikTok caption ไม่รับประกันว่าเปิดลิงก์ได้ และ bio link ที่แชร์ร่วมกันไม่ระบุ Reel ต้นทาง
6. F5 ใหม่ไม่อ่าน legacy analytics ที่มีวันที่ไม่ชัดเจน ต้องซิงก์ใหม่เพื่อเริ่ม observations ที่ถูกต้อง

## สิ่งที่ตรวจแล้วและข้อจำกัด

- Ownership ถูกตรวจที่ account, Reel/distribution และ filter IDs; provider UUID ที่ส่งมาไม่ใช้เป็นหลักฐาน mapping post ต้องตรงกับ published distribution ของบัญชีนั้น
- PostgreSQL unique constraints และ ON CONFLICT ทำให้ observation/link creation ซ้ำไม่เพิ่มแถว การซิงก์แต่ละบัญชีเป็น transaction ถ้าเกิดข้อผิดพลาด rollback ข้อมูลรอบนั้นและเก็บยอดเดิม บัญชีอื่นยังทำงานต่อ
- known post IDs ถูกส่งให้ adapters จึงดึงโพสต์ ReelCast ที่เก่ากว่า discovery window ได้ YouTube แบ่ง 50 IDs/TikTok 20 IDs ต่อคำขอ Meta อ่าน known IDs ทีละโพสต์ หากไม่มี known IDs จึงใช้ discovery เดิมซึ่งมีเพดาน 10 หน้า
- Refresh token ของ YouTube/TikTok ก่อน social sync เมื่อมี token; provider rate limits/permission errors รายงานแยกบัญชี เก็บข้อมูลเดิมและให้รอบถัดไปลองใหม่ ไม่มีการ retry แบบเร่งจนชน rate limit
- CSV เป็น UTF-8 BOM ตารางเดียวพร้อมคอลัมน์ metadata; XLSX เป็น Summary + Details เก็บ text identifiers และป้องกัน formula injection ข้อมูลที่ส่งออกไม่จำกัดจำนวนแถวตามตารางบนจอ Export จาก comparison เก็บทั้งสองช่วงพร้อม values, differences, percentage และ coverage
- การทดสอบใช้ฐานข้อมูลจำลองและ provider responses จำลอง ไม่ได้ยิง social API จริงหรือยืนยันสิทธิ์ของบัญชีที่เชื่อมอยู่ โดยเฉพาะ Meta metrics ขึ้นกับ Graph version และ permissions ค่า configuration-only readiness ไม่ใช่หลักฐานว่า API พร้อมใช้
- Facebook Video ID ใช้ fields views/likes/comments ของ Video ส่วน Page post ID ใช้ reactions/comments/shares ไม่แทน views ด้วย impressions ส่วน Instagram ใช้ views/plays เมื่อ API ส่งให้ ไม่แทนด้วย reach
- ตารางคลิกยังไม่มี retention/archival policy; dashboard อ่านข้อมูลที่ตรง filter ทั้งหมด ควรเพิ่ม aggregate/retention เมื่อปริมาณ event สูง

## API

`POST /api/tracking/sync`, `GET /dashboard`, `/analysis`, `/comparison`, `/export?format=csv|xlsx`, `/filter-options`, `/readiness` อยู่ใต้ `/api/tracking` และต้อง login

`POST /api/tracking/links/{distribution_id}` สร้าง/คืนลิงก์ของเจ้าของเท่านั้น `GET|HEAD /api/tracking/r/{code}` เป็น public redirect ที่ส่ง Cache-Control: no-store ไม่มี endpoint ingest metric แบบ Member เพื่อป้องกันการปลอมข้อมูลผ่านหน้าเว็บ

## Provider references

- [YouTube video counters](https://developers.google.com/youtube/v3/docs/videos) และ [videos.list](https://developers.google.com/youtube/v3/docs/videos/list)
- [TikTok Display API query videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query)
- [Meta official SDK Post fields/edges](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/post.py)

## TikTok publish ID และ public video ID

F3 เก็บ publish job ID จาก Content Posting API จึงต้องเรียก status/fetch เพื่อหา public video ID ก่อนใช้ Display API video/query และคง external_ref เป็น publish job เดิมเพื่อจับคู่ distribution ไม่เปลี่ยน privacy ของโพสต์ ถ้ายังไม่มี public ID (เช่น SELF_ONLY หรือยังไม่ผ่าน moderation) ให้แสดง counters เป็น Unavailable ไม่ใช่ศูนย์ วันที่เผยแพร่ที่ไม่รู้เป็น null

อ้างอิง: [TikTok Get Post Status](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status).

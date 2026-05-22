# ReelCast — คู่มือการติดตั้งและรันโปรเจกต์

> **Senior Project** — AI-Powered Social Media Reel Generator  
> Stack: FastAPI · Celery · Redis · Next.js (Bun) · Cloudflare R2 · Kling 2.6 Pro · Google Gemini

---

## สิ่งที่ต้องติดตั้งก่อน

| เครื่องมือ | ขั้นต่ำ | หมายเหตุ |
|---|---|---|
| Docker Desktop | 4.x+ | ต้องเปิดทิ้งไว้ตลอดการรัน |
| Python | 3.11+ | สำหรับ backend + Celery |
| Bun | 1.x+ | สำหรับ frontend (Next.js) |
| Git | 2.x+ | |

---

## การตั้งค่า Environment Variables

### Backend — สร้างไฟล์ `backend/.env`

คัดลอกจาก `backend/.env.example` แล้วเติมค่าให้ครบ:

```bash
cp backend/.env.example backend/.env
```

| ตัวแปร | คำอธิบาย |
|---|---|
| `SECRET_KEY` | Secret key สำหรับ JWT session |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |
| `FACEBOOK_CLIENT_ID` | Facebook App ID |
| `FACEBOOK_CLIENT_SECRET` | Facebook App Secret |
| `SMTP_SERVER` | SMTP server (e.g. smtp.gmail.com) |
| `SMTP_PORT` | SMTP port (e.g. 587) |
| `SMTP_USERNAME` | Email สำหรับส่ง verification |
| `SMTP_PASSWORD` | App Password ของ email |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 Secret Access Key |
| `R2_ENDPOINT_URL` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `R2_BUCKET_NAME` | ชื่อ bucket บน Cloudflare R2 |
| `R2_PUBLIC_URL` | (Optional) Custom domain ของ R2 bucket |
| `GOOGLE_AI_API_KEY` | Google AI API key (ต้องเปิด Billing) |
| `FAL_KEY` | fal.ai API key สำหรับ Kling 2.6 Pro video generation |
| `DATABASE_URL` | PostgreSQL connection string |

> **หมายเหตุ:** `GOOGLE_AI_API_KEY` ต้องมาจาก Google Cloud Project ที่เปิด Billing  
> Free Tier จะได้ Error 429 RESOURCE_EXHAUSTED

---

## การรันโปรเจกต์ (ทีละ Step)

### ⚠️ ก่อนรัน — เปิด Docker Desktop ก่อนเสมอ!

---

### STEP 1 — Redis (Docker)

เปิด terminal ที่ **root ของโปรเจกต์** แล้วรัน:

```bash
docker-compose up -d
```

ตรวจสอบ: เห็น `reelcast_redis  Started` = สำเร็จ

---

### STEP 2 — Backend (FastAPI / uvicorn)

เปิด terminal ใหม่ เข้าไปที่ `backend`:

```bash
cd backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

ตรวจสอบ: เปิด [http://localhost:8000/docs](http://localhost:8000/docs)

---

### STEP 3 — Celery Worker

เปิด terminal ใหม่อีกตัว เข้าไปที่ `backend`:

```bash
cd backend
venv\Scripts\activate
venv\Scripts\celery -A app.worker.celery_app worker --loglevel=info --pool=solo -Q main-queue
```

ตรวจสอบ: เห็น `celery@... ready.` = สำเร็จ

---

### STEP 4 — Frontend (Next.js / bun)

เปิด terminal ใหม่ เข้าไปที่ `frontend`:

```bash
cd frontend
bun run dev
```

ตรวจสอบ: เปิด [http://localhost:3000](http://localhost:3000)

---

## สรุป Port ที่ใช้งาน

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Redis | localhost:6379 |

---

## ติดตั้ง Dependencies (ครั้งแรก)

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
bun install
```

---

## คำสั่งเสริม / ตรวจสอบระบบ

```bash
# ตรวจสอบว่า port ใดเปิดอยู่บ้าง
netstat -ano | findstr "8000 3000 6379"

# ตรวจสอบ Docker
docker ps

# อัปเดต dependencies ของ backend
venv\Scripts\pip install -r requirements.txt

# ติดตั้ง google-genai (ถ้ายังไม่มี)
venv\Scripts\pip install google-genai --upgrade
```

---

## ข้อควรระวัง

| ปัญหา | สาเหตุ / วิธีแก้ |
|---|---|
| Celery ไม่รับ task | ต้องใส่ `-Q main-queue` ทุกครั้ง |
| Celery crash บน Windows | ต้องใช้ `--pool=solo` เสมอ (ป้องกัน WinError 5) |
| Error 429 RESOURCE_EXHAUSTED | GOOGLE_AI_API_KEY ต้องเป็น Billing project ไม่ใช่ Free Tier |
| Celery ยังใช้ task เก่า | ต้อง restart Celery ทุกครั้งที่แก้ task signature |

---

## โครงสร้างโปรเจกต์

```
reelcastcast/
├── backend/                  # FastAPI + Celery
│   ├── app/
│   │   ├── main.py           # FastAPI app entry point
│   │   ├── worker.py         # Celery task (video generation pipeline)
│   │   ├── models/           # SQLAlchemy ORM models
│   │   ├── routes/           # API route handlers
│   │   └── services/
│   │       ├── ai_service.py            # Gemini caption generation
│   │       ├── video_generation_service.py  # Kling 2.6 Pro video gen
│   │       ├── overlay_service.py       # FFmpeg overlay + audio strip
│   │       ├── storage_service.py       # Cloudflare R2 upload
│   │       └── upload_service.py        # User video validation
│   ├── requirements.txt
│   └── .env.example
├── frontend/                 # Next.js 14 App Router
│   └── src/app/(main)/
│       └── create/page.tsx   # Reel creation page (Feature 2)
├── docker-compose.yml        # Redis container
└── README.md
```

---

## AI Services ที่ใช้งาน

| Service | Model | ใช้ทำอะไร |
|---|---|---|
| fal.ai | Kling 2.6 Pro | สร้าง video จากรูปสินค้า (image-to-video) |
| Google Gemini | gemini-2.5-flash | สร้าง captions + hashtags |
| Google Veo | veo-2.0-generate-001 | Fallback video generation |
| Cloudflare R2 | — | เก็บ video files + product images |

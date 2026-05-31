# -*- coding: utf-8 -*-
"""
Vertex AI Connection Verifier
==============================
Run from backend/ directory:  python verify_vertex.py

Steps:
  [1] Load service account JSON  (free)
  [2] Init Vertex AI client      (free)
  [3] Ping Gemini on Vertex AI   (free / very cheap - verify auth + network)
  [4] Test Imagen 3 generate_images (~$0.04 - uncomment to run)
"""
import os
import sys
import ssl
import certifi
import tempfile

# ── Windows SSL fix for google-auth (which uses requests, not httpx) ─────────
# httpx works fine on Windows because it accesses the Windows certificate store
# via Python's ssl module.  But requests/urllib3 uses certifi's bundle only and
# misses certificates added by the OS (e.g. corporate proxy root CA).
# Fix: extract all trusted root certs from the Windows store and append them to
# certifi's bundle so requests can verify google's OAuth2 endpoint correctly.
def _build_windows_ca_bundle() -> str:
    """Merge certifi + Windows trusted root CAs into a temp PEM file."""
    with open(certifi.where(), "r", encoding="utf-8") as f:
        base = f.read()

    win_pems = []
    if sys.platform == "win32":
        for store in ("ROOT", "CA"):
            try:
                for cert, encoding, trust in ssl.enum_certificates(store):
                    if encoding == "x509_asn":
                        try:
                            win_pems.append(ssl.DER_cert_to_PEM_cert(cert))
                        except Exception:
                            pass
            except Exception:
                pass

    combined = base + "\n" + "\n".join(win_pems)
    fd, path = tempfile.mkstemp(suffix=".pem", prefix="ca_bundle_")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(combined)
    return path

_CA_BUNDLE = _build_windows_ca_bundle()
os.environ["REQUESTS_CA_BUNDLE"] = _CA_BUNDLE
os.environ["SSL_CERT_FILE"] = _CA_BUNDLE

# ── Load .env ────────────────────────────────────────────────────────────────
try:
    from dotenv import load_dotenv
    load_dotenv()
    print("[OK] .env loaded")
except ImportError:
    print("[WARN] python-dotenv not found - reading from environment directly")

project  = os.getenv("GOOGLE_CLOUD_PROJECT", "")
location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
cred_env = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")

print()
print("   Project  :", project or "(not set)")
print("   Location :", location)
print("   Cred file:", cred_env or "(not set)")

if not project or not cred_env:
    print()
    print("[FAIL] Missing env vars - check .env for GOOGLE_CLOUD_PROJECT and GOOGLE_APPLICATION_CREDENTIALS")
    sys.exit(1)


# ── [1] Load credentials ─────────────────────────────────────────────────────
print()
print("[1/3] Loading service account credentials...")

_here     = os.path.dirname(os.path.abspath(__file__))  # backend/
cred_path = cred_env if os.path.isabs(cred_env) else os.path.join(_here, cred_env)

if not os.path.exists(cred_path):
    print("[FAIL] File not found:", cred_path)
    print("       Check that JSON is in backend/ and filename is correct")
    sys.exit(1)

from google.oauth2 import service_account
creds = service_account.Credentials.from_service_account_file(
    cred_path,
    scopes=["https://www.googleapis.com/auth/cloud-platform"],
)
print("[OK] Service account:", creds.service_account_email)


# ── [2] Init Vertex AI client ────────────────────────────────────────────────
print()
print("[2/3] Initialising Vertex AI client...")
from google import genai

client = genai.Client(
    vertexai=True,
    project=project,
    location=location,
    credentials=creds,
)
print("[OK] Client ready ->  vertexai=True, project=%s, location=%s" % (project, location))


# ── [3] Gemini on Vertex AI (free / very cheap) ──────────────────────────────
# Verify that the Gemini text model we use for captions + prompts works on Vertex AI
# before migrating away from AI Studio. Tests the exact model name used in production.
print()
print("[3/5] Testing gemini-3.5-flash on Vertex AI (text generation)...")
try:
    gr = client.models.generate_content(
        model="gemini-3.5-flash",
        contents="Say hello in one word.",
    )
    reply = gr.text.strip() if gr.text else "(empty)"
    print("[OK] gemini-3.5-flash: %r" % reply)
    print()
    print(">>> gemini-3.5-flash is available on Vertex AI! <<<")
    _gemini_ok = True
except Exception as e:
    _gemini_ok = False
    print("[FAIL] gemini-3.5-flash:", e)
    print()
    print("If 404: model name differs on Vertex AI - trying fallback names...")
    for fallback in ("gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-1.5-flash-002"):
        try:
            gr2 = client.models.generate_content(
                model=fallback,
                contents="Say hello in one word.",
            )
            reply2 = gr2.text.strip() if gr2.text else "(empty)"
            print("[OK] %s: %r  <-- use this name in production" % (fallback, reply2))
            break
        except Exception as e2:
            print("[FAIL] %s: %s" % (fallback, str(e2)[:80]))


# ── [4] Imagen 3 generate_images (~$0.04) ────────────────────────────────────
print()
print("[4/5] Testing Imagen 3 generate_images (text-only, ~$0.04)...")
from google.genai import types as t
try:
    r = client.models.generate_images(
        model="imagen-3.0-generate-002",
        prompt="A simple red circle on white background",
        config=t.GenerateImagesConfig(number_of_images=1, aspect_ratio="1:1"),
    )
    if r.generated_images:
        img_bytes = r.generated_images[0].image.image_bytes
        print("[OK] Imagen 3 generate_images: %d bytes" % len(img_bytes))
        img_bytes_text_only = img_bytes  # keep for step 4
        print()
        print(">>> Vertex AI + Imagen 3 are WORKING! Pipeline is ready. <<<")
    else:
        img_bytes_text_only = None
        print("[WARN] No images returned - model accessible but response empty")
except Exception as e:
    img_bytes_text_only = None
    print("[FAIL] Imagen 3 failed:", e)
    print()
    print("If 403 PERMISSION_DENIED: go to console.cloud.google.com")
    print("  -> APIs & Services -> Enable 'Vertex AI API'")
    print("  -> Also enable 'Cloud AI Platform API'")
    print("If 404 NOT_FOUND: check project has Imagen 3 model access")


# ── [4] edit_image + SUBJECT reference test (~$0.04) ─────────────────────────
# Tests the exact path the pipeline uses: SubjectReferenceImage + EDIT_MODE_DEFAULT
# Uses the text-only result from step 3 as the reference image (a real product-like PNG).
print()
print("[5/5] Testing edit_image + SubjectReferenceImage + EDIT_MODE_DEFAULT (~$0.04)...")

if not img_bytes_text_only:
    print("[SKIP] No reference image from step 3 - skipping")
else:
    try:
        subject_ref = t.SubjectReferenceImage(
            reference_id=1,
            reference_image=t.Image(image_bytes=img_bytes_text_only),
            config=t.SubjectReferenceConfig(
                subject_type=t.SubjectReferenceType.SUBJECT_TYPE_PRODUCT,
            ),
        )

        r2 = client.models.edit_image(
            model="imagen-3.0-capability-001",
            prompt="Product on a wooden table with soft studio lighting, 9:16 portrait",
            reference_images=[subject_ref],
            config=t.EditImageConfig(
                edit_mode=t.EditMode.EDIT_MODE_DEFAULT,
                number_of_images=1,
                aspect_ratio="9:16",
            ),
        )
        if r2.generated_images:
            result = r2.generated_images[0].image.image_bytes
            print("[OK] edit_image SUBJECT ref: %d bytes" % len(result))
            print()
            print(">>> SUBJECT reference with EDIT_MODE_DEFAULT WORKS! <<<")
            print("    Full pipeline with product-faithful first frame is ready.")
        else:
            print("[WARN] No images returned from edit_image")
    except Exception as e:
        print("[FAIL] edit_image failed:", e)
        print("       SUBJECT reference not supported - pipeline will use text-only fallback")

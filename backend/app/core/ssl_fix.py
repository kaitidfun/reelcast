"""
Windows CA bundle fix, shared by every process entry point (FastAPI app,
Celery worker) that makes outbound HTTPS calls via urllib3-based clients
(requests, botocore/boto3) — not just the Celery worker, which was the only
place this used to run.
"""

import os
import sys
import ssl
import tempfile
import certifi


def setup_windows_ssl() -> None:
    """
    Extend certifi's CA bundle with the Windows system trust store.

    WHY: requests/urllib3-based clients (google-auth's OAuth2 token exchange,
    boto3/botocore talking to Cloudflare R2, ...) use certifi's bundle, which
    does NOT include certificates added by the OS (e.g. a university/corporate
    proxy root CA). httpx accesses the Windows trust store natively via
    Python's ssl module and therefore works without this fix — but boto3 and
    requests do not, and silently hang or fail SSL verification without it.

    This function builds a temporary PEM file that merges certifi's bundle with
    all trusted root CAs from the Windows certificate store, then sets
    REQUESTS_CA_BUNDLE/SSL_CERT_FILE so those clients pick it up before any
    HTTP call is made.

    No-op on non-Windows or if the env var is already set externally.
    """
    if os.environ.get("REQUESTS_CA_BUNDLE"):
        return  # Already set externally — don't override

    with open(certifi.where(), "r", encoding="utf-8") as _f:
        pems = [_f.read()]

    if sys.platform == "win32":
        for store in ("ROOT", "CA"):
            try:
                for cert, encoding, _trust in ssl.enum_certificates(store):
                    if encoding == "x509_asn":
                        try:
                            pems.append(ssl.DER_cert_to_PEM_cert(cert))
                        except Exception:
                            pass
            except Exception:
                pass

    fd, path = tempfile.mkstemp(suffix=".pem", prefix="reelcast_ca_")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write("\n".join(pems))

    os.environ["REQUESTS_CA_BUNDLE"] = path
    os.environ["SSL_CERT_FILE"] = path

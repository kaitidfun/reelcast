# tracking-provider-adapter

FastAPI boundary for ReelCast Feature 5.  The ReelCast backend calls this service on port `9000`; the frontend never calls a shop/social provider API and this service never returns provider secrets to it.  Access tokens only appear in the backend-to-adapter request body and are not logged.

## Run locally

```powershell
cd tracking-provider-adapter
Copy-Item .env.example .env
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 9000
```

Verify with `Invoke-RestMethod http://localhost:9000/health`.

Run tests without calling external APIs:

```powershell
pytest
```

## Routes

- `GET /health` returns `{"status":"ok"}`.
- `GET /oauth/{tiktok_shop|shopee|lazada}/authorize` validates `state` and `redirect_uri`, then redirects to the configured provider consent screen.
- `POST /oauth/{platform}/token-exchange` exchanges an authorization code server-to-server and returns only the ReelCast token contract.
- `POST /sync/{platform}` accepts all seven platforms and requires that platform's `X-ReelCast-Adapter-Key`.  The key check uses constant-time comparison.

Every provider response is normalized to records with a stable `external_ref`.  Commerce adapters use an order ID; social adapters use a video/post/media ID.  Missing provider fields become zero.  Invalid requests use Pydantic validation; upstream timeouts, rejected access tokens, rate limits, and provider errors are returned as safe HTTP errors without response bodies or credential values.

## Social OAuth token reuse

Connect TikTok, YouTube, Facebook, or Instagram only from ReelCast's
**Distribute** page. The backend completes OAuth and stores the member token
encrypted in `social_accounts`; on a tracking sync it passes that token to this
adapter through a server-to-server request. Do not configure social OAuth
client IDs or secrets in this adapter — they belong exclusively in
`backend/.env.local`.

## Shop callback setup

Register these callback URLs in the matching provider console:

- TikTok Shop: `{BACKEND_URL}/api/tracking/ecommerce/tiktok_shop/callback`
- Shopee: `{BACKEND_URL}/api/tracking/ecommerce/shopee/callback`
- Lazada: `{BACKEND_URL}/api/tracking/ecommerce/lazada/callback`

For local Shop OAuth testing, use a public HTTPS backend URL such as an ngrok
domain for `BACKEND_URL`.  Set `NEXT_PUBLIC_API_URL` to the same domain plus
`/api`, so the browser starts and finishes the OAuth flow on one cookie
domain. The adapter itself can stay on `http://localhost:9000` because it is
called only by the backend. The adapter's authorize URL must receive exactly
the callback URL registered with the provider. TikTok Shop uses its v202309
HMAC signing model, Shopee uses its v2 partner signature, and Lazada uses its
Open Platform SHA-256 signature. Provider URL values are in `.env`, rather
than source code, to support changes to versions, regions, or provider
environments.

Shopee includes `shop_id` in its OAuth callback, but ReelCast's supplied token-exchange contract does not carry that field.  For that contract, set `SHOPEE_SHOP_ID` to the authorised shop ID (or extend the backend callback hand-off to pass the returned `shop_id` before production multi-shop use).

## ReelCast backend environment

After assigning non-placeholder adapter keys, add these values to `backend/.env.local`:

```env
TRACKING_TIKTOK_SHOP_SYNC_URL=http://localhost:9000/sync/tiktok_shop
TRACKING_TIKTOK_SHOP_ADAPTER_KEY=<ADAPTER_KEY_TIKTOK_SHOP>
TRACKING_TIKTOK_SHOP_AUTHORIZE_URL=http://localhost:9000/oauth/tiktok_shop/authorize?state={state}&redirect_uri={redirect_uri}
TRACKING_TIKTOK_SHOP_TOKEN_EXCHANGE_URL=http://localhost:9000/oauth/tiktok_shop/token-exchange

TRACKING_SHOPEE_SYNC_URL=http://localhost:9000/sync/shopee
TRACKING_SHOPEE_ADAPTER_KEY=<ADAPTER_KEY_SHOPEE>
TRACKING_SHOPEE_AUTHORIZE_URL=http://localhost:9000/oauth/shopee/authorize?state={state}&redirect_uri={redirect_uri}
TRACKING_SHOPEE_TOKEN_EXCHANGE_URL=http://localhost:9000/oauth/shopee/token-exchange

TRACKING_LAZADA_SYNC_URL=http://localhost:9000/sync/lazada
TRACKING_LAZADA_ADAPTER_KEY=<ADAPTER_KEY_LAZADA>
TRACKING_LAZADA_AUTHORIZE_URL=http://localhost:9000/oauth/lazada/authorize?state={state}&redirect_uri={redirect_uri}
TRACKING_LAZADA_TOKEN_EXCHANGE_URL=http://localhost:9000/oauth/lazada/token-exchange

TRACKING_TIKTOK_SYNC_URL=http://localhost:9000/sync/tiktok
TRACKING_TIKTOK_ADAPTER_KEY=<ADAPTER_KEY_TIKTOK>
TRACKING_YOUTUBE_SYNC_URL=http://localhost:9000/sync/youtube
TRACKING_YOUTUBE_ADAPTER_KEY=<ADAPTER_KEY_YOUTUBE>
TRACKING_FACEBOOK_SYNC_URL=http://localhost:9000/sync/facebook
TRACKING_FACEBOOK_ADAPTER_KEY=<ADAPTER_KEY_FACEBOOK>
TRACKING_INSTAGRAM_SYNC_URL=http://localhost:9000/sync/instagram
TRACKING_INSTAGRAM_ADAPTER_KEY=<ADAPTER_KEY_INSTAGRAM>
```

## Credentials still required

Before the adapter can contact a live provider, obtain and configure the corresponding approved app credentials, allowed redirect URLs, requested API scopes, and real adapter keys.  In particular, TikTok Shop order permissions, Shopee partner approval (and `SHOPEE_SHOP_ID`), Lazada order access, TikTok `video.list`, YouTube channel read access, and Meta Page/Instagram insights permissions must be granted by the provider.  Never commit `.env`.

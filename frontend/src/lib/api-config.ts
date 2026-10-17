// One origin for ordinary API calls and media; OAuth may use a public tunnel.
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"
).replace(/\/+$/, "");
export const BACKEND_BASE_URL = API_BASE_URL.replace(/\/api$/, "");
export const OAUTH_API_BASE_URL = (
  process.env.NEXT_PUBLIC_OAUTH_API_URL || API_BASE_URL
).replace(/\/+$/, "");
export const OAUTH_BACKEND_URL = OAUTH_API_BASE_URL.replace(/\/api$/, "");

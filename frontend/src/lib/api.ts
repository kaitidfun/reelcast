// AI Reel API
export async function inputPromptAndSelectProduct(data: {
  prompt_text: string;
  product_id: string;
}) {
  const res = await fetch(`${API_BASE_URL}/reels/generate`, {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to generate AI Reel');
  return await res.json();
}

export async function regenerateContent(
  reel_id: string,
  target: "video" | "caption" | "all" = "all",
  prompt_text?: string,
) {
  const res = await fetch(`${API_BASE_URL}/reels/${reel_id}/regenerate`, {
    method: 'POST',
    headers: getJsonHeaders(),
    body: JSON.stringify({ target, prompt_text }),
  });
  if (!res.ok) throw new Error('Failed to regenerate AI Reel');
  return await res.json();
}

export async function previewAndApproveContent(reel_id: string, decision = true) {
  const res = await fetch(`${API_BASE_URL}/reels/${reel_id}/approve`, {
    method: "POST",
    headers: getJsonHeaders(),
    body: JSON.stringify({ decision }),
  });
  if (!res.ok) throw new Error("Failed to approve Reel");
  return await res.json();
}

export async function uploadOwnReel(file: File, product_id?: string) {
  const form = new FormData();
  form.append('file', file);
  if (product_id) form.append('product_id', product_id);
  const res = await fetch(`${API_BASE_URL}/reels/upload-video`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: form,
  });
  if (!res.ok) throw new Error('Failed to upload Reel');
  return await res.json();
}
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';
// OAuth starts on the public callback domain so its session cookie is returned
// by the provider. Keep ordinary browser API requests local during ngrok-based
// development to avoid ngrok's free-tier browser interstitial.
export const OAUTH_API_BASE_URL = process.env.NEXT_PUBLIC_OAUTH_API_URL || API_BASE_URL;
// Member sign-in routes live at /auth rather than below /api.
export const OAUTH_BACKEND_URL = OAUTH_API_BASE_URL.replace(/\/api\/?$/, "");

function getAuthHeaders(): HeadersInit {
  if (typeof window === "undefined") return {};
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getJsonHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
  };
}

export async function fetchHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error("Backend connection failed:", error);
    return { status: "error", message: "Failed to connect to backend" };
  }
}

export type TrackingTotals = {
  published_distributions: number;
  views: number;
  clicks: number;
  orders: number;
  engagement: number;
  click_through_rate: number;
  revenue: number;
};

export type TrackingMetric = {
  views: number;
  clicks: number;
  orders: number;
  engagement: number;
  revenue: number;
  click_through_rate?: number;
};

export type TrackingDashboard = {
  totals: TrackingTotals;
  trend: Array<TrackingMetric & { date: string }>;
  platforms: Array<TrackingMetric & { platform: string }>;
  products: Array<TrackingMetric & { id: string; name: string }>;
  campaigns: Array<TrackingMetric & { id: string; name: string }>;
  reels: Array<TrackingMetric & { id: string; name: string }>;
  has_data: boolean;
  last_synced_at: string | null;
  generated_at: string;
};

export type TrackingFilterOptions = {
  platforms: string[];
  campaigns: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
};

export type TrackingAnalysis = {
  level: "product" | "campaign" | "reel" | "platform";
  metric: "views" | "clicks" | "orders" | "engagement" | "revenue" | "ctr";
  rows: Array<TrackingMetric & { id: string; name: string; value: number }>;
  trend: Array<{ date: string; value: number }>;
  generated_at: string;
};

export type TrackingFilters = {
  start?: string;
  end?: string;
  platform?: string;
  campaign_id?: string;
  product_id?: string;
};

export type EcommerceAccount = {
  ecommerce_account_id: string;
  platform_name: string;
  external_shop_id: string;
  shop_name?: string | null;
  last_synced_at?: string | null;
  sync_error?: string | null;
};

export type TrackingReadiness = {
  providers: Record<string, boolean>;
  oauth: Record<"tiktok_shop" | "shopee" | "lazada", boolean>;
};

async function trackingRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/tracking${path}`, {
    ...init,
    headers: { ...getJsonHeaders(), ...init?.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || "Unable to load tracking data");
  }
  return response.json() as Promise<T>;
}

function trackingQuery(filters?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  const encodedRange = params.toString();
  return encodedRange ? `?${encodedRange}` : "";
}

export function fetchTrackingDashboard(filters?: TrackingFilters) {
  return trackingRequest<TrackingDashboard>(`/dashboard${trackingQuery(filters)}`);
}

export function fetchTrackingFilterOptions() {
  return trackingRequest<TrackingFilterOptions>("/filter-options");
}

export function fetchTrackingAnalysis(
  filters: TrackingFilters & { level: TrackingAnalysis["level"]; metric: TrackingAnalysis["metric"] },
) {
  return trackingRequest<TrackingAnalysis>(`/analysis${trackingQuery(filters)}`);
}

export function fetchEcommerceAccounts() {
  return trackingRequest<EcommerceAccount[]>("/ecommerce/accounts");
}

export function fetchTrackingReadiness() {
  return trackingRequest<TrackingReadiness>("/readiness");
}

export function connectEcommerceAccount(data: {
  platform_name: "tiktok_shop" | "shopee" | "lazada";
  external_shop_id: string;
  shop_name?: string;
  access_token: string;
  refresh_token?: string;
}) {
  return trackingRequest<EcommerceAccount>("/ecommerce/accounts", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function disconnectEcommerceAccount(accountId: string) {
  const response = await fetch(`${API_BASE_URL}/tracking/ecommerce/accounts/${accountId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!response.ok) throw new Error("Unable to disconnect shop");
}

export function syncTrackingData() {
  return trackingRequest<{ ecommerce_metrics: number; social_metrics: number }>("/sync", { method: "POST" });
}

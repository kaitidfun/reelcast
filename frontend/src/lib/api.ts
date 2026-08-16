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
  reels: number;
  views: number;
  clicks: number;
  orders: number;
  revenue: number;
};

export type TrackingMetric = {
  views: number;
  clicks: number;
  orders: number;
  revenue: number;
};

export type TrackingDashboard = {
  totals: TrackingTotals;
  trend: Array<TrackingMetric & { date: string }>;
  platforms: Array<TrackingMetric & { platform: string }>;
  products: Array<TrackingMetric & { id: string; name: string }>;
  campaigns: Array<TrackingMetric & { id: string; name: string }>;
  reels: Array<TrackingMetric & { id: string; name: string }>;
  generated_at: string;
};

export type EcommerceAccount = {
  ecommerce_account_id: string;
  platform_name: string;
  external_shop_id: string;
  shop_name?: string | null;
  last_synced_at?: string | null;
  sync_error?: string | null;
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

export function fetchTrackingDashboard() {
  return trackingRequest<TrackingDashboard>("/dashboard");
}

export function fetchEcommerceAccounts() {
  return trackingRequest<EcommerceAccount[]>("/ecommerce/accounts");
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

export function syncTrackingData() {
  return trackingRequest<{ synced_accounts: number }>("/sync", { method: "POST" });
}

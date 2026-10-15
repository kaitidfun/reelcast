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

export type TrackingMetric = {
  views: number | null; likes: number | null; comments: number | null;
  shares: number | null; engagement: number | null; clicks: number;
  partial_metrics: string[];
};
export type TrackingItem = TrackingMetric & { id: string; name: string; value: number | null };
export type TrackingDashboard = {
  totals: TrackingMetric & { reels: number };
  platforms: TrackingItem[]; products: TrackingItem[]; campaigns: TrackingItem[]; reels: TrackingItem[];
  click_trend: Array<{ date: string; clicks: number; youtube: number; facebook: number; instagram: number; tiktok: number }>;
  details: Array<TrackingMetric & { distribution_id: string; reel_name: string; platform: string; observed_at: string | null }>;
  has_data: boolean; semantics: string; generated_at: string; unrelated_observations: number;
  accounts: Array<{ id: string; platform: string; last_synced_at: string | null; error: string | null }>;
};
export type TrackingFilterOptions = {
  platforms: string[]; campaigns: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>; reels: Array<{ id: string; name: string }>;
  distributions: Array<{ id: string; name: string }>;
};
export type TrackingAnalysis = {
  level: "product" | "campaign" | "reel" | "platform";
  metric: "views" | "clicks" | "engagement";
  rows: TrackingItem[]; semantics: string;
};
export type TrackingFilters = { start?: string; end?: string; platform?: string; campaign_id?: string; product_id?: string; reel_id?: string };
export type TrackingPeriods = { a_start: string; a_end: string; b_start: string; b_end: string };
export type TrackingComparison = {
  a: { start: string; end: string; clicks: number; complete: boolean };
  b: { start: string; end: string; clicks: number; complete: boolean };
  difference: number | null; percentage_change: number | null; equal_duration: boolean;
  limitation: string; coverage_start: string | null;
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

export function fetchTrackingComparison(filters: TrackingFilters & TrackingPeriods) {
  return trackingRequest<TrackingComparison>(`/comparison${trackingQuery(filters)}`);
}
export function syncTrackingData() {
  return trackingRequest<{ social_metrics: number; accounts: Array<{ success: boolean; error: string | null }> }>("/sync", { method: "POST" });
}
export async function downloadTrackingExport(format: "csv" | "xlsx", filters: TrackingFilters & Partial<TrackingPeriods> & { level?: string; metric?: string }) {
  const response = await fetch(`${API_BASE_URL}/tracking/export${trackingQuery({ ...filters, format })}`, { headers: getAuthHeaders() });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || "Export failed");
  }
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = `reelcast-tracking.${format}`;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

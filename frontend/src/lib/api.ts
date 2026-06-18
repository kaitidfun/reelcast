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

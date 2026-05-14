// AI Reel API
export async function createAIReel(data: {
  prompt_text: string;
  product_id?: string;
}) {
  const res = await fetch(`${API_BASE_URL.replace(/\/api$/, '')}/reels/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to generate AI Reel');
  return await res.json();
}

export async function regenerateAIReel(reel_id: string) {
  const res = await fetch(`${API_BASE_URL.replace(/\/api$/, '')}/reels/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reel_id }),
  });
  if (!res.ok) throw new Error('Failed to regenerate AI Reel');
  return await res.json();
}

export async function approveAIReel(reel_id: string) {
  // Placeholder: In real system, PATCH status to approved
  return { success: true };
}

export async function uploadAIReel(file: File, prompt_text?: string, product_id?: string) {
  const form = new FormData();
  form.append('file', file);
  if (prompt_text) form.append('prompt_text', prompt_text);
  if (product_id) form.append('product_id', product_id);
  const res = await fetch(`${API_BASE_URL.replace(/\/api$/, '')}/reels/upload`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Failed to upload Reel');
  return await res.json();
}
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

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

import { API_BASE_URL } from "./api-config";
import { fetchWithTimeout } from "./http";

type Options = { productId: string; platform: string; overlayPosition: string; onProgress: (value: number) => void };

function sendFile(method: string, url: string, file: Blob | FormData, progress: (loaded: number) => void,
                  headers: Record<string, string> = {}): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 600_000;
    Object.entries(headers).forEach(([key, value]) => xhr.setRequestHeader(key, value));
    xhr.upload.onprogress = event => progress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr);
      else {
        let message = "Upload failed. Please try again.";
        try { message = JSON.parse(xhr.responseText).detail || message; } catch { /* storage may return XML */ }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error("Could not upload the video. Please check your connection."));
    xhr.ontimeout = () => reject(new Error("Upload timed out. Please try again."));
    xhr.onabort = () => reject(new Error("Upload cancelled."));
    xhr.send(file);
  });
}

export async function uploadVideo(file: File, options: Options): Promise<{ reel_id: string }> {
  const auth = { Authorization: `Bearer ${localStorage.getItem("rf_token")}` };
  const headers = { ...auth, "Content-Type": "application/json" };
  const intent = await fetchWithTimeout(`${API_BASE_URL.replace(/\/api$/, "")}/api/reel-uploads/init`, {
    method: "POST", headers, body: JSON.stringify({ filename: file.name, size: file.size,
      product_id: options.productId, platform: options.platform, overlay_position: options.overlayPosition }),
  });
  if (intent.status === 409 || intent.status === 404) {
    const form = new FormData();
    form.append("file", file); form.append("product_id", options.productId);
    form.append("platform", options.platform); form.append("overlay_position", options.overlayPosition);
    const response = await sendFile("POST", `${API_BASE_URL}/reels/upload-video`, form,
      loaded => options.onProgress(Math.min(99, Math.round(loaded / file.size * 100))), auth);
    options.onProgress(100);
    return JSON.parse(response.responseText);
  }
  if (!intent.ok) {
    const error = await intent.json().catch(() => null);
    throw new Error(error?.detail || "Unable to start upload");
  }
  const upload = await intent.json() as { token: string; part_size: number; parts: Array<{ part_number: number; url: string }> };
  const base = `${API_BASE_URL.replace(/\/api$/, "")}/api/reel-uploads`;
  const parts: Array<{ part_number: number; etag: string }> = [];
  try {
    let completed = 0;
    for (const part of upload.parts) {
      const offset = (part.part_number - 1) * upload.part_size;
      const chunk = file.slice(offset, offset + upload.part_size);
      const response = await sendFile("PUT", part.url, chunk,
        loaded => options.onProgress(Math.min(99, Math.round((completed + loaded) / file.size * 100))));
      const etag = response.getResponseHeader("ETag");
      if (!etag) throw new Error("Upload could not be verified. Please try again.");
      parts.push({ part_number: part.part_number, etag });
      completed += chunk.size;
    }
  } catch (error) {
    await fetchWithTimeout(`${base}/abort`, { method: "POST", headers, body: JSON.stringify({ token: upload.token }) })
      .catch(() => undefined);
    throw error;
  }
  // Completion can take longer while the server validates the actual media.
  // Never silently upload a second copy after an uncertain completion response.
  const complete = () => fetchWithTimeout(`${base}/complete`, { method: "POST", headers,
    body: JSON.stringify({ token: upload.token, parts }) }, 600_000);
  // Only completion is retried: its token fixes the Reel ID, so a lost response
  // cannot enqueue another job or require another file transfer.
  let response: Response;
  try { response = await complete(); }
  catch { response = await complete(); }
  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.detail || "Unable to complete upload");
  }
  options.onProgress(100);
  return response.json();
}

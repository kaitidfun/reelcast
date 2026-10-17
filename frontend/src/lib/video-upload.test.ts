import { afterEach, expect, it, vi } from "vitest";
import { uploadVideo } from "./video-upload";

const sends: Array<{ method: string; url: string; body: Blob | FormData | null; headers: Record<string, string> }> = [];
class UploadXHR {
  upload: { onprogress?: (event: { loaded: number }) => void } = {};
  status = 200; responseText = '{"reel_id":"fallback"}'; timeout = 0;
  onload?: () => void; onerror?: () => void; ontimeout?: () => void; onabort?: () => void;
  request = { method: "", url: "", body: null as Blob | FormData | null, headers: {} as Record<string, string> };
  open(method: string, url: string) { this.request.method = method; this.request.url = url; }
  setRequestHeader(key: string, value: string) { this.request.headers[key] = value; }
  getResponseHeader(name: string) { return name === "ETag" ? '"part-etag"' : null; }
  send(body: Blob | FormData) { this.request.body = body; sends.push(this.request); queueMicrotask(() => this.onload?.()); }
}
const options = { productId: "product", platform: "ig", overlayPosition: "bottom-right", onProgress: vi.fn() };
afterEach(() => { vi.unstubAllGlobals(); sends.length = 0; localStorage.clear(); vi.clearAllMocks(); });

it("uploads directly in bounded parts, reports their ETags and keeps auth away from storage", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadXHR);
  localStorage.setItem("rf_token", "member-token");
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "upload-intent", part_size: 3,
    parts: [{ part_number: 1, url: "https://r2.test/one" }, { part_number: 2, url: "https://r2.test/two" }] })))
    .mockResolvedValueOnce(new Response('{"reel_id":"direct"}'));
  vi.stubGlobal("fetch", request);
  const result = await uploadVideo(new File(["abcdef"], "video.mp4"), options);
  expect(result.reel_id).toBe("direct");
  expect(sends.map(send => (send.body as Blob).size)).toEqual([3, 3]);
  expect(sends.every(send => send.method === "PUT" && !send.headers.Authorization)).toBe(true);
  const completion = JSON.parse(request.mock.calls[1][1].body);
  expect(completion.parts).toEqual([{ part_number: 1, etag: '"part-etag"' }, { part_number: 2, etag: '"part-etag"' }]);
  expect(options.onProgress).toHaveBeenLastCalledWith(100);
});

it("falls back to the existing multipart API only when direct upload is unavailable", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadXHR);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{}', { status: 409 })));
  localStorage.setItem("rf_token", "member-token");
  expect((await uploadVideo(new File(["video"], "video.mp4"), options)).reel_id).toBe("fallback");
  expect(sends[0].body).toBeInstanceOf(FormData);
  expect(sends[0].headers.Authorization).toBe("Bearer member-token");
});

it("does not upload a duplicate after completion fails", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadXHR);
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "intent", part_size: 8,
    parts: [{ part_number: 1, url: "https://r2.test/one" }] })))
    .mockResolvedValueOnce(new Response('{"detail":"Unable to validate video"}', { status: 422 }));
  vi.stubGlobal("fetch", request);
  await expect(uploadVideo(new File(["video"], "video.mp4"), options)).rejects.toThrow("Unable to validate video");
  expect(sends).toHaveLength(1);
  expect(sends[0].method).toBe("PUT");
});

it("retries only the same completion intent after a lost response", async () => {
  vi.stubGlobal("XMLHttpRequest", UploadXHR);
  const request = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ token: "fixed-intent", part_size: 8,
    parts: [{ part_number: 1, url: "https://r2.test/one" }] })))
    .mockRejectedValueOnce(new TypeError('connection lost'))
    .mockResolvedValueOnce(new Response('{"reel_id":"recovered"}'));
  vi.stubGlobal("fetch", request);
  expect((await uploadVideo(new File(["video"], "video.mp4"), options)).reel_id).toBe("recovered");
  expect(sends).toHaveLength(1);
  expect(request.mock.calls[1][1].body).toBe(request.mock.calls[2][1].body);
});

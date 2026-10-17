import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAdaptivePolling } from "./useAdaptivePolling";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it("never overlaps slow requests, stops at completion and aborts on unmount", async () => {
  vi.useFakeTimers();
  let resolve: (complete: boolean) => void = () => undefined;
  const callback = vi.fn((signal: AbortSignal) => new Promise<boolean>(done => { resolve = done; }));
  const hook = renderHook(() => useAdaptivePolling(callback, true, "reel"));
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(callback).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(callback).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(true); });
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(callback).toHaveBeenCalledTimes(1);
  hook.unmount();
  expect(callback.mock.calls[0][0].aborted).toBe(true);
});

it("pauses hidden tabs, resumes immediately, and backs off errors", async () => {
  vi.useFakeTimers();
  let hidden = true;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  const callback = vi.fn().mockRejectedValueOnce(new Error("network")).mockResolvedValue(false);
  const hook = renderHook(() => useAdaptivePolling(callback, true, "reel"));
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(callback).not.toHaveBeenCalled();
  hidden = false;
  await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
  expect(callback).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(5999); });
  expect(callback).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(callback).toHaveBeenCalledTimes(2);
  hook.unmount();
});

it("cancels the old request when the reel identity changes", async () => {
  vi.useFakeTimers();
  const callback = vi.fn((_signal: AbortSignal) => new Promise<boolean>(() => undefined));
  const hook = renderHook(({ id }) => useAdaptivePolling(callback, true, id), { initialProps: { id: "first" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  hook.rerender({ id: "second" });
  expect(callback.mock.calls[0][0].aborted).toBe(true);
  hook.unmount();
});

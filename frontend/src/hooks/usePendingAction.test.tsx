import React from "react";
import { act, renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { usePendingAction } from "./usePendingAction";

it("ignores rapid duplicate submissions and unlocks after a rejected request", async () => {
  const { result } = renderHook(() => usePendingAction());
  let rejectRequest!: (reason: Error) => void;
  const request = new Promise<void>((_, reject) => { rejectRequest = reject; });
  const submit = vi.fn(() => request);
  let failedRun!: Promise<void>;
  act(() => {
    failedRun = result.current.run("Saving…", submit);
    void result.current.run("Saving…", submit);
  });
  expect(submit).toHaveBeenCalledTimes(1);
  expect(result.current.pending).toBe("Saving…");
  await act(async () => {
    const rejection = expect(failedRun).rejects.toThrow("offline");
    rejectRequest(new Error("offline"));
    await rejection;
  });
  expect(result.current.pending).toBeNull();
  const retry = vi.fn().mockResolvedValue(undefined);
  await act(async () => { await result.current.run("Retrying…", retry); });
  expect(retry).toHaveBeenCalledOnce();
  expect(result.current.pending).toBeNull();
});

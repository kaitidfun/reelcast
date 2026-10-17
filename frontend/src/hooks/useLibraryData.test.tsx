import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { useLibraryData } from "./useLibraryData";

const member = vi.hoisted(() => ({ id: "first" }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: member.id } }) }));
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); member.id = "first"; });

it("deduplicates library readers, reuses cached data, and isolates member keys", async () => {
  const request = vi.fn().mockImplementation(() => Promise.resolve(new Response(
    JSON.stringify({ campaigns: [{ campaign_id: member.id }], products: [], total: 1 }), { status: 200 })));
  vi.stubGlobal("fetch", request); localStorage.setItem("rf_token", "token-first");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const first = renderHook(() => useLibraryData(), { wrapper });
  const second = renderHook(() => useLibraryData(), { wrapper });
  await waitFor(() => expect(first.result.current.isSuccess && second.result.current.isSuccess).toBe(true));
  expect(request).toHaveBeenCalledTimes(1);
  first.unmount(); second.unmount();
  const revisit = renderHook(() => useLibraryData(), { wrapper });
  expect(revisit.result.current.data?.campaigns[0].campaign_id).toBe("first");
  expect(request).toHaveBeenCalledTimes(1);
  member.id = "second"; localStorage.setItem("rf_token", "token-second");
  revisit.rerender();
  expect(revisit.result.current.data).toBeUndefined();
  await waitFor(() => expect(revisit.result.current.data?.campaigns[0].campaign_id).toBe("second"));
  expect(request).toHaveBeenCalledTimes(2);
  revisit.unmount(); client.clear();
});

it("preserves the backend error shown by the library", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"detail":"DatabaseRetrieveException"}', { status: 500 })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const hook = renderHook(() => useLibraryData(), { wrapper });
  await waitFor(() => expect(hook.result.current.error?.message).toBe("DatabaseRetrieveException"));
  hook.unmount(); client.clear();
});

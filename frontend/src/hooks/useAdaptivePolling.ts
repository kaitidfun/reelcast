"use client";

import { useEffect, useRef } from "react";

/** One request at a time; pause hidden/offline tabs and back off failed requests. */
export function useAdaptivePolling(callback: (signal: AbortSignal) => Promise<boolean | void>,
                                    enabled: boolean, identity: string, intervalMs = 3000) {
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let running = false;
    let delay = intervalMs;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const schedule = () => {
      if (!stopped && !document.hidden && navigator.onLine !== false) timer = setTimeout(poll, delay);
    };
    async function poll() {
      if (stopped || running || document.hidden || navigator.onLine === false) return;
      running = true;
      controller = new AbortController();
      const timeout = setTimeout(() => controller?.abort(), 20_000);
      try {
        const complete = await latest.current(controller.signal);
        if (complete) stopped = true;
        delay = intervalMs;
      } catch {
        delay = Math.min(delay * 2, 30_000);
      } finally {
        clearTimeout(timeout);
        running = false;
        schedule();
      }
    }
    const resume = () => {
      clearTimeout(timer);
      if (!document.hidden && navigator.onLine !== false) void poll();
      else controller?.abort();
    };
    schedule();
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("offline", resume);
    return () => {
      stopped = true; clearTimeout(timer); controller?.abort();
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("offline", resume);
    };
  }, [enabled, identity, intervalMs]);
}

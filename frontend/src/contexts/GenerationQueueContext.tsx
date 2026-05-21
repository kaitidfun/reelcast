"use client";

/**
 * GenerationQueueContext — global background generation tracker
 *
 * Why: When users navigate away from /create while a Reel is generating,
 * the page-level polling stops. This context keeps polling in the background
 * and shows a status bar on every page, plus fires a browser notification on completion.
 *
 * Usage:
 *   - create/page.tsx calls startGeneration(reelId, productName) when generation starts
 *   - create/page.tsx calls markDone(videoUrl) / markFailed() when its own polling completes
 *   - When user is NOT on /create, this context takes over polling independently
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { usePathname } from "next/navigation";

type QueueStatus = "idle" | "generating" | "done" | "failed";

interface GenerationQueueContextType {
  reelId: string | null;
  productName: string;
  status: QueueStatus;
  elapsedSeconds: number;
  videoUrl: string | null;
  /** Call from create/page.tsx right after receiving reel_id from the API */
  startGeneration: (reelId: string, productName: string) => void;
  /** Call from create/page.tsx when polling returns status=Completed */
  markDone: (videoUrl?: string) => void;
  /** Call from create/page.tsx when polling returns status=Failed */
  markFailed: () => void;
  /** Dismiss the status bar (user acknowledged) */
  dismiss: () => void;
}

const GenerationQueueContext = createContext<GenerationQueueContextType>({
  reelId: null,
  productName: "",
  status: "idle",
  elapsedSeconds: 0,
  videoUrl: null,
  startGeneration: () => {},
  markDone: () => {},
  markFailed: () => {},
  dismiss: () => {},
});

export function GenerationQueueProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  const [reelId, setReelId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [status, setStatus] = useState<QueueStatus>("idle");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // Track generation start time for elapsed counter
  const startTimeRef = useRef<number | null>(null);
  // Prevent firing browser notification twice
  const notifiedRef = useRef(false);

  const startGeneration = useCallback((id: string, name: string) => {
    setReelId(id);
    setProductName(name);
    setStatus("generating");
    setElapsedSeconds(0);
    setVideoUrl(null);
    startTimeRef.current = Date.now();
    notifiedRef.current = false;
  }, []);

  const markDone = useCallback((url?: string) => {
    setStatus("done");
    if (url) setVideoUrl(url);
    setElapsedSeconds(0);
  }, []);

  const markFailed = useCallback(() => {
    setStatus("failed");
    setElapsedSeconds(0);
  }, []);

  const dismiss = useCallback(() => {
    setStatus("idle");
    setReelId(null);
    setProductName("");
    setVideoUrl(null);
    setElapsedSeconds(0);
    startTimeRef.current = null;
    notifiedRef.current = false;
  }, []);

  // ── Elapsed timer — ticks every second while generating ──────────────────
  useEffect(() => {
    if (status !== "generating" || startTimeRef.current === null) return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current!) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [status]);

  // ── Background polling — only when user navigates away from /create ───────
  // When user is on /create, create/page.tsx handles polling and calls markDone/markFailed.
  // This effect only runs when the user is on another page so the banner stays updated.
  useEffect(() => {
    if (status !== "generating" || !reelId) return;
    const isOnCreatePage = pathname === "/create";
    if (isOnCreatePage) return; // create/page.tsx is already polling

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem("rf_token");
        if (!token) return;

        const res = await fetch(`http://localhost:8000/api/reels/${reelId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;

        const data = await res.json();
        if (data.status === "Completed") {
          markDone(data.final_commercial_video_url ?? undefined);
          // Browser notification — request permission if not yet granted
          if (!notifiedRef.current && typeof window !== "undefined" && "Notification" in window) {
            notifiedRef.current = true;
            const fire = () => {
              new Notification("🎬 Reel is ready!", {
                body: `${productName || "Reel"} has finished — click to view your result`,
                icon: "/favicon.ico",
              });
            };
            if (Notification.permission === "granted") {
              fire();
            } else if (Notification.permission === "default") {
              Notification.requestPermission().then((perm) => {
                if (perm === "granted") fire();
              });
            }
          }
        } else if (data.status === "Failed") {
          markFailed();
        }
      } catch (e) {
        console.error("[GenerationQueue] background poll error:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [status, reelId, pathname, productName, markDone, markFailed]);

  return (
    <GenerationQueueContext.Provider
      value={{
        reelId,
        productName,
        status,
        elapsedSeconds,
        videoUrl,
        startGeneration,
        markDone,
        markFailed,
        dismiss,
      }}
    >
      {children}
    </GenerationQueueContext.Provider>
  );
}

export function useGenerationQueue() {
  return useContext(GenerationQueueContext);
}

"use client";

/**
 * GenerationStatusBar — persistent banner shown on all pages (except /create)
 * while a Reel is being generated in the background.
 *
 * Shows:
 *   - "generating": spinner + product name + elapsed timer + "View progress" link
 *   - "done": success icon + "Reel is ready!" + navigate link
 *   - "failed": error icon + failure message
 *
 * Dismissed via X button or automatically hides when user goes back to /create.
 */

import { usePathname, useRouter } from "next/navigation";
import { Loader2, CheckCircle2, AlertCircle, X, ChevronRight } from "lucide-react";
import { useGenerationQueue } from "@/contexts/GenerationQueueContext";

export default function GenerationStatusBar() {
  const pathname = usePathname();
  const router = useRouter();
  const { status, productName, elapsedSeconds, dismiss } = useGenerationQueue();

  // Only show when user has navigated away from /create and something is happening
  if (pathname === "/create") return null;
  if (status === "idle") return null;

  const mm = Math.floor(elapsedSeconds / 60).toString().padStart(2, "0");
  const ss = (elapsedSeconds % 60).toString().padStart(2, "0");

  const bannerColors = {
    generating: "bg-primary/10 border-primary/25 text-primary",
    done: "bg-success/10 border-success/25 text-success",
    failed: "bg-destructive/10 border-destructive/25 text-destructive",
    idle: "",
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 text-sm border-b transition-all ${bannerColors[status]}`}
    >
      {/* Status icon */}
      {status === "generating" && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
      {status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0" />}
      {status === "failed" && <AlertCircle className="h-4 w-4 shrink-0" />}

      {/* Message */}
      <span className="flex-1 font-medium truncate">
        {status === "generating" && (
          <>Generating Reel{productName ? <> · <span className="opacity-80">{productName}</span></> : ""}…</>
        )}
        {status === "done" && (
          <>🎉 Reel is ready!{productName ? <> · <span className="opacity-80">{productName}</span></> : ""}</>
        )}
        {status === "failed" && (
          <>Reel generation failed{productName ? <> · <span className="opacity-80">{productName}</span></> : ""}</>
        )}
      </span>

      {/* Elapsed timer (generating only) */}
      {status === "generating" && (
        <span className="font-mono text-xs tabular-nums opacity-70 shrink-0">⏱ {mm}:{ss}</span>
      )}

      {/* Navigate to /create */}
      <button
        onClick={() => router.push("/create")}
        className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold ring-1 ring-current/30 hover:bg-current/10 transition-colors shrink-0"
      >
        {status === "done" ? "View result" : status === "failed" ? "View details" : "View progress"}
        <ChevronRight className="h-3 w-3" />
      </button>

      {/* Dismiss (only for done/failed — generating can't be dismissed) */}
      {(status === "done" || status === "failed") && (
        <button
          onClick={dismiss}
          className="rounded-full p-1 hover:bg-current/10 transition-colors shrink-0"
          aria-label="Dismiss notification"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

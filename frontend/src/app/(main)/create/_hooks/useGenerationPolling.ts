"use client";

import { BACKEND_BASE_URL } from "@/lib/api-config";
import type { MutableRefObject } from "react";
import { useAdaptivePolling } from "@/hooks/useAdaptivePolling";
import { useToast } from "@/hooks/use-toast";
import { useGenerationQueue } from "@/contexts/GenerationQueueContext";
import { resolveVideoUrl } from "@/lib/reel-status";
import type { GenerationStatus } from "../_types";

export { resolveVideoUrl };

export const formatCaptionAndHashtags = (
  captionAndHashtags: { caption?: string; hashtags?: string[] } | null | undefined
) =>
  captionAndHashtags
    ? captionAndHashtags.caption + "\n\n" + (captionAndHashtags.hashtags?.join(" ") || "")
    : "";

type Props = {
  generationStatus: GenerationStatus;
  isRegeneratingCaption: boolean;
  reelId: string | null;
  generationStartTime: number | null;
  captionOnlyRegenRef: MutableRefObject<boolean>;
  completedModeRef: MutableRefObject<"generate" | "upload">;
  onCompleted: (data: {
    isCaptionRegen: boolean;
    finalVideoUrl: string | null;
    rawVideoUrl: string | null;
    caption: string;
    generationTime: number;
    completedMode: "generate" | "upload";
  }) => void;
  onFailed: (errorMessage: string, generationTime: number) => void;
};

/**
 * Polls the reel status endpoint every 3s while generation is in progress.
 * Calls onCompleted / onFailed when the worker responds.
 */
export function useGenerationPolling({
  generationStatus,
  isRegeneratingCaption,
  reelId,
  generationStartTime,
  captionOnlyRegenRef,
  completedModeRef,
  onCompleted,
  onFailed,
}: Props) {
  const { toast } = useToast();
  const { markDone, markFailed } = useGenerationQueue();

  useAdaptivePolling(async (signal) => {
      try {
        const token = localStorage.getItem("rf_token");
        const res = await fetch(`${BACKEND_BASE_URL}/api/reels/${reelId}/status`, {
          signal, headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          toast({
            title: "Session expired",
            description: "Please log out and log in again.",
            variant: "destructive",
          });
          return true;
        }

        if (!res.ok) throw new Error("Status request failed");

        const data = await res.json();
        if (signal.aborted) return;

        if (data.status === "Completed") {
          const isCaptionRegen = captionOnlyRegenRef.current;
          captionOnlyRegenRef.current = false;

          const elapsed = generationStartTime
            ? Math.floor((Date.now() - generationStartTime) / 1000)
            : 0;

          const caption = formatCaptionAndHashtags(data.caption_and_hashtags);

          onCompleted({
            isCaptionRegen,
            finalVideoUrl: resolveVideoUrl(data.final_commercial_video_url),
            rawVideoUrl:   resolveVideoUrl(data.raw_video_url),
            caption,
            generationTime: elapsed,
            completedMode: completedModeRef.current,
          });

          if (!isCaptionRegen) {
            markDone(data.final_commercial_video_url ?? undefined);
            toast({ title: "Reel created!", description: "Ready to preview and approve" });
          } else {
            toast({ title: "Caption updated!", description: "New caption is ready." });
          }
          return true;
        } else if (data.status === "Failed") {
          const elapsed = generationStartTime
            ? Math.floor((Date.now() - generationStartTime) / 1000)
            : 0;
          markFailed();
          onFailed(data.error_message || "Something went wrong.", elapsed);
          toast({
            title: "Generation Failed",
            description: data.error_message || "Something went wrong.",
            variant: "destructive",
          });
          return true;
        }
      } catch (e) {
        throw e;
      }
  }, Boolean(reelId && (generationStatus === "generating" || isRegeneratingCaption)), `${reelId}:${generationStartTime}`);
}

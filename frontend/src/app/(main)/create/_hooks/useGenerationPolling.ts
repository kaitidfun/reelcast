"use client";

import { useEffect, MutableRefObject } from "react";
import { useToast } from "@/hooks/use-toast";
import { useGenerationQueue } from "@/contexts/GenerationQueueContext";
import type { GenerationStatus } from "../_types";

export const resolveVideoUrl = (url: string | null | undefined) => {
  if (!url) return null;
  return url.startsWith("http")
    ? url
    : `http://localhost:8000/api/upload/videos/${url}`;
};

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

  useEffect(() => {
    if ((!generationStatus || generationStatus !== "generating") && !isRegeneratingCaption) return;
    if (!reelId) return;

    const interval = setInterval(async () => {
      try {
        const token = localStorage.getItem("rf_token");
        const res = await fetch(`http://localhost:8000/api/reels/${reelId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (res.status === 401) {
          clearInterval(interval);
          toast({
            title: "Session expired",
            description: "Please log out and log in again.",
            variant: "destructive",
          });
          return;
        }

        if (!res.ok) return;

        const data = await res.json();

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

          clearInterval(interval);
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
          clearInterval(interval);
        }
      } catch (e) {
        console.error(e);
      }
    }, 3000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generationStatus, isRegeneratingCaption, reelId, generationStartTime]);
}

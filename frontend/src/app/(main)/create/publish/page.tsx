"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Save, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL, OAUTH_API_BASE_URL } from "@/lib/api";

import type { GenerationStatus } from "../_types";
import { useGenerationPolling, resolveVideoUrl, formatCaptionAndHashtags } from "../_hooks/useGenerationPolling";
import { CaptionBlock } from "../_components/CaptionBlock";
import { DistributeBlock } from "../_components/DistributeBlock";
import { ReelNameDialog } from "@/components/ReelNameDialog";

// CaptionBlock/DistributeBlock's short platform ids vs. the backend's
// SocialAccount.platform_name values.
const PLATFORM_ID_INFO: Record<string, { name: string; label: string }> = {
  yt: { name: "youtube", label: "YouTube Shorts" },
  tt: { name: "tiktok", label: "TikTok" },
  fb: { name: "facebook", label: "Facebook" },
  ig: { name: "instagram", label: "Instagram" },
};

type SocialAccount = { account_id: string; platform_name: string };

const PublishReelContent = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { toast } = useToast();

  const [reelId, setReelId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [rawVideoUrl, setRawVideoUrl] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const captionTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isRegeneratingCaption, setIsRegeneratingCaption] = useState(false);
  const [regenStartTime, setRegenStartTime] = useState<number | null>(null);
  const captionOnlyRegenRef = useRef(true);
  const completedModeRef = useRef<"generate" | "upload">("generate");

  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const namePromptedRef = useRef(false);
  const nameResolveRef = useRef<((name: string | undefined) => void) | null>(null);

  const [selectedPlatforms, setSelectedPlatforms] = useState(["yt", "tt", "fb", "ig"]);
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [platformReady, setPlatformReady] = useState<Record<string, boolean>>({});
  const [scheduledTime, setScheduledTime] = useState("");
  const [isPublishing, setIsPublishing] = useState(false);

  const loadAccounts = async () => {
    const token = localStorage.getItem("rf_token");
    if (!token) return;
    try {
      const [accountsRes, readinessRes] = await Promise.all([
        fetch(`${API_BASE_URL}/social/accounts`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/social/readiness`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts ?? []);
      if (readinessRes.ok) setPlatformReady((await readinessRes.json()).platforms ?? {});
    } catch (e) {
      console.error("Failed to load connected accounts:", e);
    }
  };

  useEffect(() => {
    const id = searchParams?.get("reelId");
    if (!id) {
      setLoading(false);
      setNotFound(true);
      return;
    }
    setReelId(id);

    const load = async () => {
      const token = localStorage.getItem("rf_token");
      if (!token) { setNotFound(true); return; }
      try {
        const res = await fetch(`http://localhost:8000/api/reels/${id}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) { setNotFound(true); return; }
        const data = await res.json();

        setCaption(formatCaptionAndHashtags(data.caption_and_hashtags));
        setIsSaved(Boolean(data.is_saved));
        // Already saved before — the name prompt only fires on the first save.
        if (data.is_saved) namePromptedRef.current = true;
        setVideoUrl(resolveVideoUrl(data.final_commercial_video_url));
        setRawVideoUrl(resolveVideoUrl(data.raw_video_url));

        if (data.status !== "Completed") {
          toast({ title: "This reel isn't ready to publish yet", description: "Finish generating it first." });
          router.replace(`/create?reelId=${id}`);
        }
      } catch (e) {
        console.error("Failed to load reel:", e);
        setNotFound(true);
      }
    };

    Promise.all([load(), loadAccounts()]).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Caption-only regeneration polling — video is fixed on this page, only
  // the caption can be regenerated here.
  useGenerationPolling({
    generationStatus: "idle" as GenerationStatus,
    isRegeneratingCaption,
    reelId,
    generationStartTime: regenStartTime,
    captionOnlyRegenRef,
    completedModeRef,
    onCompleted: ({ caption: newCaption }) => {
      setIsRegeneratingCaption(false);
      if (newCaption) setCaption(newCaption);
    },
    onFailed: () => setIsRegeneratingCaption(false),
  });

  const regenerateCaption = async () => {
    if (!reelId) return;
    captionOnlyRegenRef.current = true;
    setIsRegeneratingCaption(true);
    setRegenStartTime(Date.now());
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch(`http://localhost:8000/api/reels/${reelId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          target: "caption",
          overlay_position: "top-right",
          duration: 6,
          with_audio: true,
        }),
      });
      if (!res.ok) {
        let msg = "Failed to start regeneration";
        try { msg = (await res.json()).detail || msg; } catch {
          // ignore JSON parsing failures
        }
        throw new Error(msg);
      }
      toast({ title: "Regenerating...", description: "Regenerating caption now." });
    } catch (e: unknown) {
      setIsRegeneratingCaption(false);
      const message = e instanceof Error ? e.message : "Failed to start regeneration";
      toast({ title: "Error", description: message, variant: "destructive" });
    }
  };

  const performSave = async (name?: string): Promise<boolean> => {
    if (!reelId) return false;
    setIsSaving(true);
    try {
      const token = localStorage.getItem("rf_token");
      const res = await fetch(`http://localhost:8000/api/reels/${reelId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ decision: true, caption, ...(name ? { name } : {}) }),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => null);
        throw new Error(error?.detail || "Could not save Reel");
      }
      setIsSaved(true);
      return true;
    } catch (error) {
      toast({
        title: "Save failed",
        description: error instanceof Error ? error.message : "Could not save Reel",
        variant: "destructive",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  /**
   * Snapshots the current caption/video into saved_*. Returns whether it
   * worked. On this reel's very first save, pauses for the name dialog
   * (skippable) before actually saving — used by both the standalone Save
   * button and handlePublish (publish always saves first).
   */
  const doSave = async (): Promise<boolean> => {
    if (!isSaved && !namePromptedRef.current) {
      namePromptedRef.current = true;
      setNameDialogOpen(true);
      const name = await new Promise<string | undefined>((resolve) => {
        nameResolveRef.current = resolve;
      });
      return performSave(name);
    }
    return performSave();
  };

  const saveReel = async () => {
    const ok = await doSave();
    if (ok) toast({ title: "Saved!", description: "This reel now appears in your Library." });
  };

  const togglePlatform = (id: string) =>
    setSelectedPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));

  const handleConnect = (platform: string) => {
    const token = localStorage.getItem("rf_token");
    if (!token) return;
    window.location.href = `${OAUTH_API_BASE_URL}/social/${platform}/connect?token=${encodeURIComponent(token)}`;
  };

  const handleDisconnect = async (accountId: string) => {
    const token = localStorage.getItem("rf_token");
    const res = await fetch(`${API_BASE_URL}/social/accounts/${accountId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      toast({ title: "Disconnected" });
      loadAccounts();
    }
  };

  const handlePublish = async () => {
    if (!reelId || selectedPlatforms.length === 0) return;
    setIsPublishing(true);

    // Publish always targets the saved_* snapshot (see worker.py), so the
    // current caption must be saved first — otherwise a manual edit here
    // would never actually reach what gets posted.
    const saved = await doSave();
    if (!saved) { setIsPublishing(false); return; }

    const token = localStorage.getItem("rf_token");
    const isScheduled = scheduledTime.trim().length > 0;
    const succeeded: string[] = [];
    const failed: string[] = [];

    for (const platformId of selectedPlatforms) {
      const info = PLATFORM_ID_INFO[platformId];
      const account = accounts.find((a) => a.platform_name === info?.name);
      if (!info || !account) continue; // DistributeBlock only offers connected platforms, but guard anyway

      try {
        const res = await fetch(`${API_BASE_URL}/distributions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            reel_id: reelId,
            account_id: account.account_id,
            scheduled_time: isScheduled ? new Date(scheduledTime).toISOString() : null,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.detail || `Could not queue ${info.label}`);
        }
        const distribution = await res.json();

        // createDistribution only ever sets status "Pending" — without a
        // scheduled_time that just sits until Celery Beat's next sweep (up
        // to 60s later). "Publish Now" means now, so trigger the same
        // publish-now call the Distribute page's list button uses.
        if (!isScheduled) {
          const publishRes = await fetch(
            `${API_BASE_URL}/distributions/${distribution.distribution_id}/publish-now`,
            { method: "POST", headers: { Authorization: `Bearer ${token}` } },
          );
          if (!publishRes.ok) {
            const err = await publishRes.json().catch(() => ({}));
            throw new Error(err.detail || `Could not publish ${info.label}`);
          }
        }
        succeeded.push(info.label);
      } catch {
        failed.push(info.label);
      }
    }

    setIsPublishing(false);
    if (succeeded.length) {
      setScheduledTime("");
      toast({
        title: isScheduled ? "Scheduled!" : "Publishing now",
        description: `${succeeded.join(", ")} — check the Distribute page for status.`,
      });
    }
    if (failed.length) {
      toast({ title: "Some platforms failed to queue", description: failed.join(", "), variant: "destructive" });
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  if (notFound || !reelId) {
    return (
      <div className="space-y-3 p-12 text-center text-muted-foreground">
        <p>No reel selected to publish.</p>
        <Link href="/create" className="text-primary underline underline-offset-2">
          Go back to Create
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push(`/create?reelId=${reelId}`)} aria-label="Back to Create">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl">Publish</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">Write a caption and share this reel to your connected accounts.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {/* LEFT: read-only video preview */}
        <div className="lg:col-span-2">
          <div className="rounded-3xl border border-border bg-gradient-to-b from-card to-card/60 p-3 shadow-elevated lg:sticky lg:top-4">
            <div className="relative mx-auto aspect-[9/16] max-w-[300px] overflow-hidden rounded-[28px] border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 ring-1 ring-inset ring-white/5">
              {videoUrl ? (
                <video
                  src={rawVideoUrl ?? videoUrl}
                  className="absolute inset-0 h-full w-full object-cover"
                  controls
                  loop
                  playsInline
                />
              ) : (
                <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
                  No video for this reel yet.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: caption + save + distribute */}
        <div className="space-y-3 lg:col-span-3">
          <CaptionBlock
            caption={caption}
            onCaptionChange={setCaption}
            captionTextareaRef={captionTextareaRef}
            isRegeneratingCaption={isRegeneratingCaption}
            onRegenCaption={regenerateCaption}
          />

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between rounded-2xl border border-border bg-card px-3 py-2.5"
          >
            {isSaved ? (
              <span className="flex items-center gap-1.5 text-xs font-medium text-success">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved to Library
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Not saved yet</span>
            )}
            <Button variant="outline" size="sm" onClick={saveReel} disabled={isSaving} className="h-8 gap-1.5 text-xs">
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {isSaving ? "Saving…" : "Save"}
            </Button>
          </motion.div>

          <DistributeBlock
            selectedPlatforms={selectedPlatforms}
            accounts={accounts}
            platformReady={platformReady}
            onTogglePlatform={togglePlatform}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            scheduledTime={scheduledTime}
            onScheduledTimeChange={setScheduledTime}
            onPublish={handlePublish}
            isPublishing={isPublishing}
          />
        </div>
      </div>

      <ReelNameDialog
        open={nameDialogOpen}
        onOpenChange={setNameDialogOpen}
        mode="first-save"
        onConfirm={(name) => { setNameDialogOpen(false); nameResolveRef.current?.(name); }}
        onSkip={() => { setNameDialogOpen(false); nameResolveRef.current?.(undefined); }}
        saving={isSaving}
      />
    </div>
  );
};

export default function CreatePublish() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-muted-foreground">Loading...</div>}>
      <PublishReelContent />
    </Suspense>
  );
}

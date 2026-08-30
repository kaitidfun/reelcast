"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, CheckCircle2, XCircle, Clock, ExternalLink,
  Send, Pencil, X as XIcon, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { API_BASE_URL } from "@/lib/api";
import { resolveVideoUrl } from "@/lib/reel-status";
import { PlatformIcon } from "@/components/PlatformIcon";
import { platformLabel } from "@/lib/platforms";

type DistributionItem = {
  distribution_id: string;
  reel_id: string | null;
  account_id: string | null;
  scheduled_time: string | null;
  status: string;
  error_message: string | null;
  post_url: string | null;
  platform_name: string | null;
  reel_prompt: string | null;
  reel_name: string | null;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return null;
  }
};

// datetime-local's value format (no timezone, minute precision) from an ISO string.
const toDatetimeLocalValue = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const DistributionCard = ({ item, onChanged }: { item: DistributionItem; onChanged: () => void }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [draftTime, setDraftTime] = useState(toDatetimeLocalValue(item.scheduled_time));

  const isFutureSchedule = item.scheduled_time && new Date(item.scheduled_time).getTime() > Date.now();
  const inProgress = item.status === "Uploading" || (item.status === "Pending" && !isFutureSchedule);

  const publishNow = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/distributions/${item.distribution_id}/publish-now`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not publish now");
      }
      onChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Could not publish now", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveReschedule = async () => {
    if (!draftTime) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/distributions/${item.distribution_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ scheduled_time: new Date(draftTime).toISOString() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not reschedule");
      }
      setEditingTime(false);
      onChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Could not reschedule", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE_URL}/distributions/${item.distribution_id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not cancel");
      }
      onChanged();
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Could not cancel", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-4 space-y-3"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted/50 ring-1 ring-border">
          <PlatformIcon platform={item.platform_name ?? ""} className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">{platformLabel(item.platform_name)}</p>
        </div>

        {item.status === "Published" && (
          <span className="flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-medium text-success ring-1 ring-success/20">
            <CheckCircle2 className="h-3 w-3" /> Published
          </span>
        )}
        {item.status === "Failed" && (
          <span className="flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[11px] font-medium text-destructive ring-1 ring-destructive/20">
            <XCircle className="h-3 w-3" /> Failed
          </span>
        )}
        {inProgress && (
          <span className="flex items-center gap-1 rounded-full bg-info/10 px-2.5 py-1 text-[11px] font-medium text-info ring-1 ring-info/20">
            <Loader2 className="h-3 w-3 animate-spin" /> Publishing…
          </span>
        )}
        {item.status === "Pending" && isFutureSchedule && (
          <span className="flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-[11px] font-medium text-warning ring-1 ring-warning/20">
            <Clock className="h-3 w-3" /> Scheduled
          </span>
        )}
      </div>

      {/* Published — link once we have one, else a fallback note */}
      {item.status === "Published" && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {item.post_url ? (
            <a href={item.post_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-primary hover:underline underline-offset-2">
              <ExternalLink className="h-3.5 w-3.5" /> View post
            </a>
          ) : (
            <span>Posted — check the {platformLabel(item.platform_name)} app to view it</span>
          )}
        </div>
      )}

      {/* Failed — error + retry */}
      {item.status === "Failed" && (
        <div className="space-y-2">
          {item.error_message && <p className="text-xs text-destructive/90">{item.error_message}</p>}
          <Button size="sm" variant="outline" onClick={publishNow} disabled={busy} className="h-8 gap-1.5 text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Retry
          </Button>
        </div>
      )}

      {/* Pending — scheduled time (editable) + publish-now override + cancel */}
      {item.status === "Pending" && (
        <div className="space-y-2">
          {editingTime ? (
            <div className="flex items-center gap-2">
              <Input
                type="datetime-local"
                value={draftTime}
                onChange={(e) => setDraftTime(e.target.value)}
                onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
                className="h-8 flex-1 text-xs cursor-pointer [&::selection]:bg-transparent"
              />
              <Button size="sm" onClick={saveReschedule} disabled={busy || !draftTime} className="h-8 gap-1 text-xs">
                Save
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditingTime(false)} disabled={busy} className="h-8 w-8">
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {isFutureSchedule ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {formatDateTime(item.scheduled_time)}
                </span>
              ) : (
                <span>Queued to publish shortly</span>
              )}
              <button
                type="button"
                onClick={() => { setDraftTime(toDatetimeLocalValue(item.scheduled_time)); setEditingTime(true); }}
                className="flex items-center gap-1 text-primary hover:underline underline-offset-2"
              >
                <Pencil className="h-3 w-3" /> Edit time
              </button>
              <button type="button" onClick={publishNow} disabled={busy} className="flex items-center gap-1 text-primary hover:underline underline-offset-2 disabled:opacity-50">
                <Send className="h-3 w-3" /> Publish now
              </button>
              <button type="button" onClick={cancel} disabled={busy} className="flex items-center gap-1 text-destructive hover:underline underline-offset-2 disabled:opacity-50">
                <XIcon className="h-3 w-3" /> Cancel
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

const DistributeStatusContent = () => {
  const params = useParams();
  const router = useRouter();
  const reelId = Array.isArray(params?.reelId) ? params.reelId[0] : (params?.reelId as string | undefined) ?? "";

  const [items, setItems] = useState<DistributionItem[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!reelId) return;
    try {
      const [distRes, reelRes] = await Promise.all([
        fetch(`${API_BASE_URL}/distributions?reel_id=${reelId}&limit=50`, { headers: authHeaders() }),
        fetch(`http://localhost:8000/api/reels/${reelId}/status`, { headers: authHeaders() }),
      ]);
      if (distRes.ok) setItems((await distRes.json()).distributions ?? []);
      if (reelRes.ok) {
        const reel = await reelRes.json();
        setVideoUrl(resolveVideoUrl(reel.raw_video_url) ?? resolveVideoUrl(reel.final_commercial_video_url));
      }
    } catch (e) {
      console.error("Failed to load distribution status:", e);
    } finally {
      setLoading(false);
    }
  }, [reelId]);

  useEffect(() => { load(); }, [load]);

  // Real-time-ish polling while anything is actively publishing or due any moment.
  useEffect(() => {
    const anyLive = items.some((d) => {
      if (d.status === "Uploading") return true;
      if (d.status === "Pending") {
        const future = d.scheduled_time && new Date(d.scheduled_time).getTime() > Date.now();
        return !future || new Date(d.scheduled_time as string).getTime() - Date.now() < 65_000;
      }
      return false;
    });
    if (pollRef.current) clearInterval(pollRef.current);
    if (anyLive) {
      pollRef.current = setInterval(load, 4000);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [items, load]);

  const reelTitle = items[0]?.reel_name || items[0]?.reel_prompt || "Reel";

  if (loading) {
    return <div className="p-12 text-center text-muted-foreground">Loading…</div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.push("/distribute")} aria-label="Back to Distribute">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="font-display text-xl font-bold text-foreground sm:text-2xl truncate">{reelTitle}</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">Distribution status across your connected platforms.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_1fr]">
        {videoUrl && (
          <div className="mx-auto w-full max-w-[140px] overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
            <video src={videoUrl} className="aspect-[9/16] w-full object-cover" controls loop playsInline muted />
          </div>
        )}

        <div className="space-y-3">
          {items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No distributions found for this reel.{" "}
              <Link href="/distribute" className="text-primary underline underline-offset-2">Go to Distribute</Link>.
            </div>
          ) : (
            items.map((item) => (
              <DistributionCard key={item.distribution_id} item={item} onChanged={load} />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default function DistributeStatusPage() {
  return <DistributeStatusContent />;
}

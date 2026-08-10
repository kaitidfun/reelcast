"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Send, Clock, Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useReels } from "@/hooks/useReels";

const PLATFORMS = [
  { key: "tiktok", label: "TikTok" },
  { key: "youtube", label: "YouTube Shorts" },
  { key: "facebook", label: "Facebook" },
  { key: "instagram", label: "Instagram" },
];

const STATUS_BADGE: Record<string, string> = {
  Pending: "bg-warning/10 text-warning ring-1 ring-warning/20",
  Uploading: "bg-info/10 text-info ring-1 ring-info/20",
  Published: "bg-success/10 text-success ring-1 ring-success/20",
  Failed: "bg-destructive/10 text-destructive ring-1 ring-destructive/20",
};

type SocialAccount = { account_id: string; platform_name: string };
type DistributionItem = {
  distribution_id: string;
  reel_id: string | null;
  account_id: string | null;
  scheduled_time: string | null;
  status: string;
  error_message: string | null;
  reel_prompt: string | null;
  platform_name: string | null;
};

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const Distribution = () => {
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { reels } = useReels({ limit: 100 });
  const completedReels = reels.filter((r) => r.status === "Completed");

  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [distributions, setDistributions] = useState<DistributionItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedReelId, setSelectedReelId] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const headers = authHeaders();
      if (!headers.Authorization) return;
      const [accountsRes, distRes] = await Promise.all([
        fetch("http://localhost:8000/api/social/accounts", { headers }),
        fetch("http://localhost:8000/api/distributions", { headers }),
      ]);
      if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts ?? []);
      if (distRes.ok) setDistributions((await distRes.json()).distributions ?? []);
    } catch (e) {
      console.error("Failed to load distribution data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // The OAuth connect flow (backend redirect, not fetch) lands back here
  // with ?connected=<platform> or ?error=<message> — surface it once, then
  // strip the query param so a refresh doesn't re-show the toast.
  useEffect(() => {
    const connected = searchParams?.get("connected");
    const error = searchParams?.get("error");
    if (connected) {
      toast({ title: `${connected} connected!` });
      loadAll();
      router.replace("/distribute");
    } else if (error) {
      toast({ title: "Connection failed", description: error, variant: "destructive" });
      router.replace("/distribute");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleConnect = (platform: string) => {
    const token = localStorage.getItem("rf_token");
    if (!token) return;
    // Full navigation, not fetch — the browser needs to actually land on
    // the platform's own consent screen, so this can't go through a normal
    // authenticated XHR. The token rides along as a query param instead
    // (see backend/app/routes/social_routes.py for why).
    window.location.href = `http://localhost:8000/api/social/${platform}/connect?token=${encodeURIComponent(token)}`;
  };

  const handleDisconnect = async (accountId: string) => {
    const res = await fetch(`http://localhost:8000/api/social/accounts/${accountId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      toast({ title: "Disconnected" });
      loadAll();
    }
  };

  const resetCreateForm = () => {
    setSelectedReelId("");
    setSelectedAccountId("");
    setScheduledTime("");
  };

  const handleCreateDistribution = async () => {
    if (!selectedReelId || !selectedAccountId) {
      toast({ title: "Pick a reel and an account first", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("http://localhost:8000/api/distributions", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          reel_id: selectedReelId,
          account_id: selectedAccountId,
          scheduled_time: scheduledTime ? new Date(scheduledTime).toISOString() : null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Could not schedule distribution");
      }
      toast({ title: scheduledTime ? "Scheduled!" : "Queued to publish" });
      setCreateOpen(false);
      resetCreateForm();
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (distributionId: string) => {
    const res = await fetch(`http://localhost:8000/api/distributions/${distributionId}`, {
      method: "DELETE",
      headers: authHeaders(),
    });
    if (res.ok) {
      toast({ title: "Cancelled" });
      loadAll();
    }
  };

  const handlePublishNow = async (distributionId: string) => {
    const res = await fetch(`http://localhost:8000/api/distributions/${distributionId}/publish-now`, {
      method: "POST",
      headers: authHeaders(),
    });
    if (res.ok) {
      toast({ title: "Publishing…" });
      loadAll();
    } else {
      const err = await res.json().catch(() => ({}));
      toast({ title: "Could not publish", description: err.detail, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Distribution</h1>
          <p className="mt-1 text-muted-foreground">Publish Reels to YouTube Shorts, TikTok, Facebook, and Instagram</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          disabled={accounts.length === 0 || completedReels.length === 0}
          title={accounts.length === 0 ? "Connect an account first" : completedReels.length === 0 ? "No completed reels yet" : undefined}
          className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Schedule Distribution
        </Button>
      </div>

      {/* Connected Accounts */}
      <div>
        <h2 className="font-display text-lg font-semibold text-foreground mb-3">Connected Accounts</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {PLATFORMS.map((p) => {
            const account = accounts.find((a) => a.platform_name === p.key);
            return (
              <div key={p.key} className="rounded-2xl border border-border bg-card p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">{p.label}</span>
                  {account && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                </div>
                {account ? (
                  <Button variant="outline" size="sm" onClick={() => handleDisconnect(account.account_id)}>
                    Disconnect
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => handleConnect(p.key)} className="gradient-primary text-primary-foreground">
                    Connect
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Distributions */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-info" />
          <h2 className="font-display text-lg font-semibold text-foreground">Distributions</h2>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-border bg-card p-12 text-center text-muted-foreground">Loading…</div>
        ) : distributions.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
            No distributions yet — schedule one above once you have a connected account and a completed reel.
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card shadow-card overflow-hidden">
            <div className="divide-y divide-border">
              {distributions.map((d, i) => (
                <motion.div
                  key={d.distribution_id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-4"
                >
                  <div className="flex items-center gap-3 sm:gap-4 flex-1 min-w-0">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${
                      d.status === "Published" ? "bg-success/10 ring-success/20" : "bg-info/10 ring-info/20"
                    }`}>
                      <Send className={`h-4 w-4 ${d.status === "Published" ? "text-success" : "text-info"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{d.reel_prompt || "(reel)"}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {d.platform_name || "unknown platform"}
                        {d.error_message ? ` — ${d.error_message}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${STATUS_BADGE[d.status] ?? "bg-muted text-muted-foreground ring-1 ring-border"}`}>
                      {d.status}
                    </span>
                    {d.scheduled_time && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        {new Date(d.scheduled_time).toLocaleString()}
                      </span>
                    )}
                    {(d.status === "Pending" || d.status === "Failed") && (
                      <Button variant="outline" size="sm" onClick={() => handlePublishNow(d.distribution_id)}>
                        Publish now
                      </Button>
                    )}
                    {d.status !== "Uploading" && d.status !== "Published" && (
                      <Button variant="ghost" size="icon" onClick={() => handleCancel(d.distribution_id)} title="Cancel">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </motion.div>

      {/* Schedule dialog */}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreateForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Schedule Distribution</DialogTitle>
            <DialogDescription>Pick a finished Reel and a connected account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="mb-2 block">Reel</Label>
              <Select value={selectedReelId} onValueChange={setSelectedReelId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a completed reel" />
                </SelectTrigger>
                <SelectContent>
                  {completedReels.map((r) => (
                    <SelectItem key={r.id} value={r.id}>{r.title.slice(0, 60)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Account</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a connected account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.account_id} value={a.account_id} className="capitalize">{a.platform_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="mb-2 block">Schedule for (optional — leave blank to publish ASAP)</Label>
              <Input type="datetime-local" value={scheduledTime} onChange={(e) => setScheduledTime(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateDistribution} disabled={submitting} className="gradient-primary text-primary-foreground gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Distribution;

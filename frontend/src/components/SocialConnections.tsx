"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Radio, CheckCircle2, Link2, Settings2, Unplug, Loader2, Music2, Youtube, Facebook, Instagram } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { API_BASE_URL } from "@/lib/api";
import { connectSocialPlatform } from "@/lib/platforms";

const PLATFORMS = [
  { key: "tiktok", label: "TikTok", icon: Music2, iconClassName: "bg-foreground/10 text-foreground" },
  { key: "youtube", label: "YouTube Shorts", icon: Youtube, iconClassName: "bg-destructive/10 text-destructive" },
  { key: "facebook", label: "Facebook", icon: Facebook, iconClassName: "bg-info/10 text-info" },
  { key: "instagram", label: "Instagram", icon: Instagram, iconClassName: "bg-pink-500/10 text-pink-500" },
];

type SocialAccount = { account_id: string; platform_name: string };

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Self-contained "Connected accounts" card — fetches and manages its own state. */
export function SocialConnections() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [platformReady, setPlatformReady] = useState<Record<string, boolean>>({});
  const [disconnectAccount, setDisconnectAccount] = useState<SocialAccount | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  const load = useCallback(async () => {
    const headers = authHeaders();
    if (!headers.Authorization) return;
    try {
      const [accountsRes, readinessRes] = await Promise.all([
        fetch(`${API_BASE_URL}/social/accounts`, { headers }),
        fetch(`${API_BASE_URL}/social/readiness`, { headers }),
      ]);
      if (accountsRes.ok) setAccounts((await accountsRes.json()).accounts ?? []);
      if (readinessRes.ok) setPlatformReady((await readinessRes.json()).platforms ?? {});
    } catch (e) {
      console.error("Failed to load social connections:", e);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // The OAuth connect flow (backend redirect, not fetch) lands back here
  // with ?connected=<platform> or ?error=<message> — surface it once, then
  // strip the query param so a refresh doesn't re-show the toast.
  useEffect(() => {
    const connected = searchParams?.get("connected");
    const error = searchParams?.get("error");
    if (connected) {
      toast.success(`${connected} connected!`);
      load();
      router.replace("/account");
    } else if (error) {
      toast.error("Connection failed", { description: error });
      router.replace("/account");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleDisconnect = async () => {
    if (!disconnectAccount) return;
    setDisconnecting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/social/accounts/${disconnectAccount.account_id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.detail || "Could not disconnect account");
      }
      toast.success("Disconnected");
      setDisconnectAccount(null);
      load();
    } catch (error) {
      toast.error("Could not disconnect", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  return (
    <>
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Radio className="h-4 w-4 text-primary" /> Connected accounts
          </CardTitle>
          <CardDescription>Connect accounts securely to publish completed Reels.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {PLATFORMS.map((p) => {
              const account = accounts.find((a) => a.platform_name === p.key);
              const configured = platformReady[p.key] ?? false;
              const Icon = p.icon;
              return (
                <div key={p.key} className="min-w-0 rounded-xl border border-border bg-muted/30 p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${p.iconClassName}`}>
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{p.label}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {account ? "Connected" : configured ? "Not connected" : "Needs setup"}
                      </p>
                    </div>
                    {account && <CheckCircle2 className="h-4 w-4 text-success shrink-0" />}
                    {account ? (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setDisconnectAccount(account)}
                        title={`Disconnect ${p.label}`}
                        aria-label={`Disconnect ${p.label}`}
                        className="h-9 w-9 shrink-0"
                      >
                        <Unplug className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="icon"
                        disabled={!configured}
                        title={configured ? `Connect ${p.label}` : "Add this platform's OAuth credentials to backend/.env.local and restart the backend"}
                        aria-label={configured ? `Connect ${p.label}` : `${p.label} needs setup`}
                        onClick={() => connectSocialPlatform(p.key)}
                        className="gradient-primary h-9 w-9 shrink-0 text-primary-foreground"
                      >
                        {configured ? <Link2 className="h-4 w-4" /> : <Settings2 className="h-4 w-4" />}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(disconnectAccount)}
        onOpenChange={(open) => {
          if (!open && !disconnecting) setDisconnectAccount(null);
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto p-4 sm:p-6">
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {disconnectAccount?.platform_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Disconnecting this social media platform will permanently delete its Distribution history.
              This action cannot be undone or recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:space-x-0">
            <AlertDialogCancel disabled={disconnecting} className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <Button variant="destructive" onClick={() => void handleDisconnect()} disabled={disconnecting} className="w-full sm:w-auto">
              {disconnecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Disconnect permanently
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

"use client";

import { motion } from "framer-motion";
import { Send, Check, Loader2, Clock, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PLATFORM_OPTIONS = [
  { id: "yt", name: "youtube",   label: "YouTube Shorts", shortLabel: "YT Shorts",  color: "text-red-500",    activeBg: "bg-red-500/10 border-red-500/40 ring-red-500/20"      },
  { id: "tt", name: "tiktok",    label: "TikTok",         shortLabel: "TikTok",     color: "text-foreground", activeBg: "bg-foreground/10 border-foreground/30 ring-foreground/20" },
  { id: "fb", name: "facebook",  label: "Facebook",       shortLabel: "Facebook",   color: "text-blue-500",   activeBg: "bg-blue-500/10 border-blue-500/40 ring-blue-500/20"   },
  { id: "ig", name: "instagram", label: "Instagram",      shortLabel: "Instagram",  color: "text-pink-500",   activeBg: "bg-pink-500/10 border-pink-500/40 ring-pink-500/20"   },
];

const PlatformIcon = ({ id }: { id: string }) => {
  switch (id) {
    case "yt": return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14C4.46 20.5 12 20.5 12 20.5s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.52V8.48L15.5 12l-5.75 3.52z"/></svg>;
    case "tt": return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.73a4.85 4.85 0 0 1-1.01-.04z"/></svg>;
    case "fb": return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><path d="M24 12.07C24 5.41 18.63 0 12 0S0 5.41 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.04V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.95.93-1.95 1.88v2.27h3.32l-.53 3.49h-2.79V24C19.62 23.1 24 18.1 24 12.07z"/></svg>;
    case "ig": return <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg>;
    default: return null;
  }
};

type SocialAccount = { account_id: string; platform_name: string };

type Props = {
  selectedPlatforms: string[];
  accounts: SocialAccount[];
  platformReady: Record<string, boolean>;
  onTogglePlatform: (id: string) => void;
  onConnect: (platform: string) => void;
  onDisconnect: (accountId: string) => void;
  scheduledTime: string;
  onScheduledTimeChange: (val: string) => void;
  onPublish: () => void;
  isPublishing: boolean;
};

export function DistributeBlock({
  selectedPlatforms,
  accounts,
  platformReady,
  onTogglePlatform,
  onConnect,
  onDisconnect,
  scheduledTime,
  onScheduledTimeChange,
  onPublish,
  isPublishing,
}: Props) {
  const selectedConnected = selectedPlatforms.filter((id) =>
    accounts.some((a) => a.platform_name === PLATFORM_OPTIONS.find((p) => p.id === id)?.name)
  );
  const isScheduled = scheduledTime.trim().length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-3 shadow-card space-y-2.5"
    >
      <div className="flex items-center gap-1.5">
        <Send className="h-3 w-3 text-primary" />
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Distribute
        </label>
      </div>

      {/* Each card is both the account's Connect/Disconnect control and,
          once connected, a toggle for whether this publish targets it —
          keeps account management and platform selection in one place. */}
      <div className="grid grid-cols-2 gap-2">
        {PLATFORM_OPTIONS.map((p) => {
          const account = accounts.find((a) => a.platform_name === p.name);
          const configured = platformReady[p.name] ?? false;
          const isActive = Boolean(account) && selectedPlatforms.includes(p.id);
          return (
            <div
              key={p.id}
              className={`relative flex flex-col items-center gap-1.5 rounded-xl border py-2.5 transition-all select-none ${
                isActive ? `${p.activeBg} ring-1` : "border-border/50"
              } ${account ? "" : "opacity-70"}`}
            >
              <div
                onClick={() => account && onTogglePlatform(p.id)}
                className={`flex flex-col items-center gap-1.5 ${account ? "cursor-pointer" : ""}`}
              >
                <span className={`transition-colors ${isActive ? p.color : "text-muted-foreground/35"}`}>
                  <PlatformIcon id={p.id} />
                </span>
                <span className={`text-[10px] font-medium text-center leading-tight transition-colors ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}>
                  {p.shortLabel}
                </span>
              </div>
              {isActive && (
                <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2 w-2 text-primary-foreground" />
                </span>
              )}
              {account ? (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDisconnect(account.account_id); }}
                  className="text-[9px] text-muted-foreground underline underline-offset-2 hover:text-destructive"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  type="button"
                  disabled={!configured}
                  title={configured ? undefined : "Add this platform's OAuth credentials to backend/.env.local and restart the backend"}
                  onClick={() => onConnect(p.name)}
                  className="flex items-center gap-1 text-[9px] font-semibold text-primary disabled:text-muted-foreground/50 disabled:cursor-not-allowed"
                >
                  <Link2 className="h-2.5 w-2.5" />
                  {configured ? "Connect" : "Needs setup"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {accounts.length > 0 && selectedConnected.length === 0 && (
        <p className="text-[11px] text-amber-500/80">⚠ Select at least one platform before publishing</p>
      )}
      {accounts.length === 0 && (
        <p className="text-[11px] text-muted-foreground">Connect an account above to publish this reel.</p>
      )}

      <div>
        <Label className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          <Clock className="h-3 w-3" />
          Schedule for (optional — leave blank to publish now)
        </Label>
        <Input
          type="datetime-local"
          value={scheduledTime}
          onChange={(e) => onScheduledTimeChange(e.target.value)}
          onClick={(e) => (e.currentTarget as HTMLInputElement).showPicker?.()}
          className="h-9 text-xs cursor-pointer [&::selection]:bg-transparent"
        />
      </div>

      <Button
        onClick={onPublish}
        disabled={selectedConnected.length === 0 || isPublishing}
        size="sm"
        className="gradient-primary text-primary-foreground shadow-glow h-9 w-full text-xs gap-1.5"
      >
        {isPublishing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
        {isPublishing
          ? (isScheduled ? "Scheduling…" : "Publishing…")
          : (isScheduled ? `Schedule · ${selectedConnected.length}` : `Publish Now · ${selectedConnected.length}`)}
      </Button>
    </motion.div>
  );
}

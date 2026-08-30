"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Send, Check, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlatformIcon } from "@/components/PlatformIcon";
import { PLATFORM_OPTIONS } from "@/lib/platforms";

type SocialAccount = { account_id: string; platform_name: string };

type Props = {
  selectedPlatforms: string[];
  accounts: SocialAccount[];
  onTogglePlatform: (id: string) => void;
  scheduledTime: string;
  onScheduledTimeChange: (val: string) => void;
  onPublish: () => void;
  isPublishing: boolean;
};

export function DistributeBlock({
  selectedPlatforms,
  accounts,
  onTogglePlatform,
  scheduledTime,
  onScheduledTimeChange,
  onPublish,
  isPublishing,
}: Props) {
  const isConnected = (name: string) => accounts.some((a) => a.platform_name === name);
  const selectedConnected = selectedPlatforms.filter((id) =>
    isConnected(PLATFORM_OPTIONS.find((p) => p.id === id)?.name ?? "")
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

      <div className="grid grid-cols-4 gap-2">
        {PLATFORM_OPTIONS.map((p) => {
          const connected = isConnected(p.name);
          const isActive = connected && selectedPlatforms.includes(p.id);
          return (
            <button
              type="button"
              key={p.id}
              onClick={() => connected && onTogglePlatform(p.id)}
              disabled={!connected}
              title={connected ? undefined : `${p.label} not connected — connect it from the Distribute page`}
              className={`relative flex flex-col items-center gap-1 rounded-xl border py-2.5 transition-all select-none ${
                isActive ? `${p.activeBg} ring-1` : "border-border/50 hover:border-border hover:bg-muted/20"
              } ${connected ? "cursor-pointer" : "opacity-40 cursor-not-allowed"}`}
            >
              <span className={`transition-colors ${isActive ? p.color : "text-muted-foreground/35"}`}>
                <PlatformIcon platform={p.name} />
              </span>
              <span className={`text-[10px] font-medium text-center leading-tight transition-colors ${isActive ? "text-foreground" : "text-muted-foreground/50"}`}>
                {p.shortLabel}
              </span>
              {isActive && (
                <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary">
                  <Check className="h-2 w-2 text-primary-foreground" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      {accounts.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          No connected accounts yet.{" "}
          <Link href="/distribute" className="text-primary underline underline-offset-2">
            Connect a platform
          </Link>{" "}
          to publish this reel.
        </p>
      ) : selectedConnected.length === 0 ? (
        <p className="text-[11px] text-amber-500/80">⚠ Select at least one platform before publishing</p>
      ) : null}

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

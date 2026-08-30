"use client";

import { RefObject } from "react";
import { motion } from "framer-motion";
import { Brain, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  caption: string;
  onCaptionChange: (val: string) => void;
  captionTextareaRef: RefObject<HTMLTextAreaElement>;
  isRegeneratingCaption: boolean;
  onRegenCaption: () => void;
};

export function CaptionBlock({
  caption,
  onCaptionChange,
  captionTextareaRef,
  isRegeneratingCaption,
  onRegenCaption,
}: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-border bg-card p-3 shadow-card space-y-2.5"
    >
      <div className="flex items-center gap-1.5">
        <Brain className="h-3 w-3 text-primary" />
        <label className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Caption · Gemini
        </label>
        {isRegeneratingCaption && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
      </div>

      <Textarea
        ref={captionTextareaRef}
        value={caption}
        onChange={(e) => onCaptionChange(e.target.value)}
        rows={3}
        disabled={isRegeneratingCaption}
        className={`bg-muted/40 border-border resize-none text-[11px] leading-relaxed h-40 overflow-y-auto transition-opacity ${
          isRegeneratingCaption ? "opacity-40" : ""
        }`}
      />

      <Button variant="outline" onClick={onRegenCaption} size="sm" className="gap-1.5 h-9 text-xs w-full">
        <RefreshCw className="h-3 w-3" />
        Retry AI Text
      </Button>
    </motion.div>
  );
}

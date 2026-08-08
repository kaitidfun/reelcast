"use client";

import { Film, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { REEL_STATUS_BADGE } from "@/lib/reel-status";

export type ReelCardData = {
  id: string;
  title: string;
  status: string;
  thumbnail: string | null;
  createdAt: string | null;
};

const formatDate = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
};

export function ReelCard({ reel, onClick }: { reel: ReelCardData; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className="group rounded-2xl border border-border bg-card overflow-hidden card-shine hover:border-primary/30 hover:shadow-elevated transition-all duration-300 cursor-pointer"
    >
      <div className="relative aspect-[9/16] bg-muted flex items-center justify-center">
        {reel.thumbnail ? (
          <img src={reel.thumbnail} alt="" className="h-full w-full object-cover" />
        ) : (
          <Film className="h-10 w-10 text-muted-foreground/30" />
        )}
        <div className="absolute top-2 right-2">
          <Badge
            variant="outline"
            className={"text-[10px] " + (REEL_STATUS_BADGE[reel.status] ?? "bg-muted text-muted-foreground border-border")}
          >
            {reel.status}
          </Badge>
        </div>
        {reel.thumbnail && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="h-12 w-12 rounded-full bg-background/80 backdrop-blur flex items-center justify-center">
              <Play className="h-5 w-5 text-foreground fill-foreground ml-0.5" />
            </div>
          </div>
        )}
      </div>
      <div className="p-3 space-y-1.5">
        <h3 className="text-sm font-medium text-foreground line-clamp-2 min-h-[2.5rem]">{reel.title}</h3>
        <p className="text-[11px] text-muted-foreground">{formatDate(reel.createdAt)}</p>
      </div>
    </div>
  );
}

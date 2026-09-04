"use client";

import { useState } from "react";
import { Film, Pencil, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { REEL_STATUS_BADGE } from "@/lib/reel-status";
import { ReelNameDialog } from "@/components/ReelNameDialog";
import { useToast } from "@/hooks/use-toast";

export type ReelCardData = {
  id: string;
  title: string;
  // Raw name field (null if never named) — used to pre-fill the edit
  // dialog. `title` above is the display fallback (name || prompt text).
  name: string | null;
  status: string;
  // Whether this reel has ever been distributed to any platform — drives
  // the "Not published" badge and where clicking the card goes (see
  // lib/reel-status.ts's reelClickTarget).
  hasDistribution: boolean;
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

const authHeaders = (): Record<string, string> => {
  const token = localStorage.getItem("rf_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** onChanged: called after a successful rename or delete so the parent list can refetch. */
export function ReelCard({ reel, onClick, onChanged }: { reel: ReelCardData; onClick?: () => void; onChanged?: () => void }) {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleRename = async (name: string) => {
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:8000/api/reels/${reel.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Could not rename reel");
      setDialogOpen(false);
      onChanged?.();
    } catch {
      toast({ title: "Rename failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`http://localhost:8000/api/reels/${reel.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Could not delete reel");
      setDialogOpen(false);
      toast({ title: "Reel deleted" });
      onChanged?.();
    } catch {
      toast({ title: "Delete failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={onClick}
      className="group relative rounded-2xl border border-border bg-card overflow-hidden card-shine hover:border-primary/30 hover:shadow-elevated transition-all duration-300 cursor-pointer"
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
        className="absolute top-2 left-2 z-10 flex h-7 w-7 items-center justify-center rounded-md bg-black/50 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
        aria-label="Edit reel"
      >
        <Pencil className="h-3.5 w-3.5 text-white" />
      </button>
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
        {reel.status === "Completed" && (
          <span
            className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
              reel.hasDistribution
                ? "bg-success/15 text-success"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {reel.hasDistribution ? "Published" : "Not published"}
          </span>
        )}
        <p className="text-[11px] text-muted-foreground">{formatDate(reel.createdAt)}</p>
      </div>

      <ReelNameDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        initialName={reel.name ?? ""}
        mode="edit"
        onConfirm={handleRename}
        onDelete={handleDelete}
        saving={saving}
      />
    </div>
  );
}

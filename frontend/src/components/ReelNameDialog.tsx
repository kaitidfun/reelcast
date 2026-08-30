"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
  // "first-save": prompted once, right when a reel is first saved — skippable,
  // no delete (nothing to delete yet). "edit": reached later from the card's
  // edit button — always has a name to change, and can delete the reel too.
  mode: "first-save" | "edit";
  onConfirm: (name: string) => void;
  onSkip?: () => void;
  onDelete?: () => void;
  saving?: boolean;
};

export function ReelNameDialog({
  open,
  onOpenChange,
  initialName = "",
  mode,
  onConfirm,
  onSkip,
  onDelete,
  saving,
}: Props) {
  const [name, setName] = useState(initialName);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setConfirmDelete(false);
    }
  }, [open, initialName]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{mode === "first-save" ? "Name this reel" : "Edit reel"}</DialogTitle>
          <DialogDescription>
            {mode === "first-save"
              ? "Give this project a name so it's easy to find in your Library — or skip and it'll use the prompt instead."
              : "Rename this project, or delete it from your Library."}
          </DialogDescription>
        </DialogHeader>

        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Summer Sale Teaser"
          maxLength={200}
          onKeyDown={(e) => {
            if (e.key === "Enter" && name.trim() && !saving) onConfirm(name.trim());
          }}
        />

        {mode === "edit" && (
          confirmDelete ? (
            <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
              <p className="text-xs text-destructive">Delete this reel permanently? This can't be undone.</p>
              <div className="flex gap-2">
                <Button size="sm" variant="destructive" onClick={onDelete} disabled={saving} className="flex-1">
                  Yes, delete
                </Button>
                <Button size="sm" variant="outline" onClick={() => setConfirmDelete(false)} disabled={saving} className="flex-1">
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 text-xs text-destructive hover:underline underline-offset-2 w-fit"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete this reel
            </button>
          )
        )}

        {!confirmDelete && (
          <DialogFooter>
            {mode === "first-save" && (
              <Button variant="ghost" onClick={onSkip} disabled={saving}>
                Skip
              </Button>
            )}
            <Button
              onClick={() => onConfirm(name.trim())}
              disabled={saving || !name.trim()}
              className="gradient-primary text-primary-foreground"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

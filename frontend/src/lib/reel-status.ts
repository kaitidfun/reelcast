// Reel.status values from the backend (Pending/Generating/Completed/Failed) —
// distinct from Distribution's publish status (Published/Scheduled), which
// doesn't exist yet (Feature 3).
export const REEL_STATUS_BADGE: Record<string, string> = {
  Completed: "bg-success/15 text-success border-success/30",
  Generating: "bg-warning/15 text-warning border-warning/30",
  Pending: "bg-warning/15 text-warning border-warning/30",
  Failed: "bg-destructive/15 text-destructive border-destructive/30",
};

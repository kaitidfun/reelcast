import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Loading…", className = "" }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={`flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground ${className}`}>
      <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />
      <span>{label}</span>
    </div>
  );
}

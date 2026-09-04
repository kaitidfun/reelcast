"use client";

import { X } from "lucide-react";

type SearchClearButtonProps = {
  onClear: () => void;
  label?: string;
};

export const SearchClearButton = ({ onClear, label = "Clear search" }: SearchClearButtonProps) => (
  <button
    type="button"
    onClick={onClear}
    aria-label={label}
    className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
  >
    <X className="h-3.5 w-3.5" aria-hidden="true" />
  </button>
);

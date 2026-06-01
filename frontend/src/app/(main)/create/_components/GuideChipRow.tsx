"use client";

import type { GuideOption } from "../_types";

type Props = {
  label: string;
  options: GuideOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  onHover: (opt: GuideOption | null, pos?: { x: number; y: number }) => void;
};

/**
 * One row of Guide Me chips — reused for Mood, Target, Style, Focus, Lighting, Camera.
 * Toggling a chip sets the value; clicking the same chip again deselects it.
 */
export function GuideChipRow({ label, options, selected, onSelect, onHover }: Props) {
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.label}
            type="button"
            onClick={() => onSelect(selected === opt.label ? null : opt.label)}
            onMouseEnter={(e) => onHover(opt, { x: e.clientX, y: e.clientY })}
            onMouseMove={(e)  => onHover(opt, { x: e.clientX, y: e.clientY })}
            onMouseLeave={() => onHover(null)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
              selected === opt.label
                ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30"
                : "border border-border bg-muted/40 text-muted-foreground hover:border-primary/30 hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

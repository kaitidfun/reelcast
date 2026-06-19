import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { GuideChipRow } from "./GuideChipRow";

const options = [
  { label: "Cafe morning", description: "A calm cafe scene" },
  { label: "Studio", description: "A controlled studio scene" },
];

describe("GuideChipRow", () => {
  it("selects a Guide Me option", () => {
    const onSelect = vi.fn();
    render(
      <GuideChipRow
        label="Scene Focus"
        options={options}
        selected={null}
        onSelect={onSelect}
        onHover={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cafe morning" }));

    expect(onSelect).toHaveBeenCalledWith("Cafe morning");
  });

  it("deselects the selected option when clicked again", () => {
    const onSelect = vi.fn();
    render(
      <GuideChipRow
        label="Scene Focus"
        options={options}
        selected="Cafe morning"
        onSelect={onSelect}
        onHover={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Cafe morning" }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it("reports hover state for the floating guide tooltip", () => {
    const onHover = vi.fn();
    render(
      <GuideChipRow
        label="Scene Focus"
        options={options}
        selected={null}
        onSelect={vi.fn()}
        onHover={onHover}
      />,
    );

    fireEvent.mouseEnter(
      screen.getByRole("button", { name: "Cafe morning" }),
      { clientX: 10, clientY: 20 },
    );

    expect(onHover).toHaveBeenCalledWith(
      options[0],
      expect.objectContaining({ x: 10, y: 20 }),
    );
  });
});

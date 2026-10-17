import React, { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LoadingImage, LoadingVideo } from "./LoadingMedia";

it("preserves video refs and callbacks, shows buffering, and resets for a new source", () => {
  const ref = createRef<HTMLVideoElement>();
  const onLoadedData = vi.fn();
  const { rerender } = render(<LoadingVideo ref={ref} src="first.mp4" onLoadedData={onLoadedData} />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading video…");
  expect(ref.current?.tagName).toBe("VIDEO");
  fireEvent.loadedData(ref.current!);
  expect(onLoadedData).toHaveBeenCalledOnce();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  fireEvent.waiting(ref.current!);
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.playing(ref.current!);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  rerender(<LoadingVideo ref={ref} src="second.mp4" />);
  expect(screen.getByRole("status")).toBeInTheDocument();
  fireEvent.error(ref.current!);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load video");
});

it("clears image placeholders on completion and failure without losing caller handlers", () => {
  const onLoad = vi.fn();
  const onError = vi.fn();
  const { rerender } = render(<LoadingImage src="first.jpg" alt="Product" onLoad={onLoad} />);
  expect(screen.getByRole("img")).toHaveAttribute("aria-busy", "true");
  fireEvent.load(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("aria-busy", "false");
  expect(onLoad).toHaveBeenCalledOnce();
  rerender(<LoadingImage src="second.jpg" alt="Product" onError={onError} />);
  expect(screen.getByRole("img")).toHaveAttribute("aria-busy", "true");
  fireEvent.error(screen.getByRole("img"));
  expect(screen.getByRole("img")).toHaveAttribute("aria-busy", "false");
  expect(onError).toHaveBeenCalledOnce();
});

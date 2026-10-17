"use client";

import { forwardRef, useCallback, useState, type ComponentPropsWithoutRef } from "react";
import { LoadingState } from "@/components/LoadingState";

function ImageContent({ onLoad, onError, className = "", alt, loading: strategy = "lazy", decoding = "async", ...props }: ComponentPropsWithoutRef<"img">) {
  const [loading, setLoading] = useState(true);
  const checkCachedImage = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoading(false);
  }, []);
  return <img {...props} alt={alt} loading={strategy} decoding={decoding} aria-busy={loading}
    ref={checkCachedImage}
    className={`${className} ${loading ? "animate-pulse bg-muted motion-reduce:animate-none" : ""}`}
    onLoad={event => { setLoading(false); onLoad?.(event); }}
    onError={event => { setLoading(false); onError?.(event); }} />;
}

export function LoadingImage(props: ComponentPropsWithoutRef<"img">) {
  return <ImageContent key={props.src} {...props} />;
}

const VideoContent = forwardRef<HTMLVideoElement, ComponentPropsWithoutRef<"video">>(function VideoContent(
  { onLoadedData, onCanPlay, onPlaying, onWaiting, onError, controls, preload = controls ? "auto" : "metadata", ...props }, ref,
) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  return <>
    <video {...props} controls={controls && status === "ready"} preload={preload} ref={ref} aria-busy={status === "loading"}
      onLoadedData={event => { setStatus("ready"); onLoadedData?.(event); }}
      onCanPlay={event => { setStatus("ready"); onCanPlay?.(event); }}
      onPlaying={event => { setStatus("ready"); onPlaying?.(event); }}
      onWaiting={event => { setStatus("loading"); onWaiting?.(event); }}
      onError={event => { setStatus("error"); onError?.(event); }} />
    {/* An opaque placeholder masks the browser spinner; controls return when ready. */}
    {status !== "ready" && <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#10151f]">
      {status === "loading" ? <LoadingState label="Loading video…" className="text-white" />
        : <p role="alert" className="p-4 text-center text-sm text-white">Unable to load video. Please try again.</p>}
    </div>}
  </>;
});

/** Place inside the preview's existing relative container to preserve its layout. */
export const LoadingVideo = forwardRef<HTMLVideoElement, ComponentPropsWithoutRef<"video">>(function LoadingVideo(props, ref) {
  return <VideoContent key={props.src} {...props} ref={ref} />;
});

"use client";

import { MutableRefObject } from "react";
import { Play, Pause, Volume2, VolumeX, Download, Sparkles, ShoppingBag } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LibraryProduct } from "../_types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string | null;
  rawVideoUrl: string | null;
  videoMuted: boolean;
  isPlaying: boolean;
  showLogo: boolean;
  showProduct: boolean;
  videoCurrentTime: number;
  videoDuration: number;
  duration: number;
  selectedProduct: LibraryProduct | null;
  videoRefFullscreen: MutableRefObject<HTMLVideoElement | null>;
  videoRef: MutableRefObject<HTMLVideoElement | null>;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onDownload: () => void;
  onSeek: (time: number) => void;
  showPlayIcon: boolean;
  formatTime: (s: number) => string;
};

export function FullscreenVideoDialog({
  open,
  onOpenChange,
  videoUrl,
  rawVideoUrl,
  videoMuted,
  isPlaying,
  showLogo,
  showProduct,
  videoCurrentTime,
  videoDuration,
  duration,
  selectedProduct,
  videoRefFullscreen,
  videoRef,
  onTogglePlay,
  onToggleMute,
  onDownload,
  onSeek,
  showPlayIcon,
  formatTime,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-0 bg-black border-border overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Fullscreen Reel preview</DialogTitle>
          <DialogDescription>Watch the generated Reel in fullscreen</DialogDescription>
        </DialogHeader>
        <div className="relative aspect-[9/16] w-full overflow-hidden bg-black">
          {videoUrl ? (
            <video
              ref={videoRefFullscreen}
              src={rawVideoUrl ?? videoUrl}
              className="absolute inset-0 w-full h-full object-cover"
              loop
              playsInline
              muted={videoMuted}
              onTimeUpdate={() => {
                const t = videoRefFullscreen.current?.currentTime ?? 0;
                onSeek(t);
              }}
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.45), transparent 55%), radial-gradient(circle at 70% 75%, hsl(var(--accent) / 0.4), transparent 55%)",
              }}
            />
          )}

          {showLogo && (
            <div className="absolute top-4 right-4 flex items-center gap-1.5 rounded-lg bg-black/40 backdrop-blur-md border border-white/10 px-2.5 py-1.5 shadow-lg">
              {selectedProduct?.brandLogoUrl ? (
                <img
                  src={selectedProduct.brandLogoUrl}
                  alt="Brand logo"
                  className="h-7 w-auto max-w-[80px] object-contain"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              ) : (
                <>
                  <div className="h-5 w-5 rounded-md gradient-primary flex items-center justify-center">
                    <Sparkles className="h-3 w-3 text-primary-foreground" />
                  </div>
                  <span className="text-[11px] font-bold text-white">REELCAST</span>
                </>
              )}
            </div>
          )}

          {showProduct && (
            <div className="absolute bottom-20 left-4 right-4 flex items-center gap-3 rounded-xl bg-black/55 backdrop-blur-md border border-white/10 p-3 shadow-2xl">
              <div className="h-14 w-14 shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-pink-400 to-orange-400 flex items-center justify-center text-3xl">
                {selectedProduct?.primaryImageUrl ? (
                  <img
                    src={selectedProduct.primaryImageUrl}
                    alt={selectedProduct.name}
                    className="h-full w-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                ) : (
                  <span>{selectedProduct?.thumbnail ?? <ShoppingBag className="h-6 w-6 text-white" />}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{selectedProduct?.name ?? "Product Name"}</p>
                <p className="text-xs text-white/70">Tap to shop</p>
              </div>
              <Button size="sm" className="gradient-primary text-primary-foreground h-8 px-3 text-xs">Shop</Button>
            </div>
          )}

          <button onClick={onTogglePlay} className="absolute inset-0" aria-label={isPlaying ? "Pause" : "Play"} />
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-opacity duration-500 ${showPlayIcon ? "opacity-100" : "opacity-0"}`}>
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 backdrop-blur-md ring-1 ring-white/25">
              {isPlaying
                ? <Pause className="h-7 w-7 text-white" />
                : <Play className="h-7 w-7 text-white ml-1" />}
            </div>
          </div>

          <div className="absolute top-4 left-4 flex items-center gap-2 z-10">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMute();
                if (videoRefFullscreen.current) videoRefFullscreen.current.muted = !videoMuted;
                if (videoRef.current) videoRef.current.muted = !videoMuted;
              }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/15 hover:bg-black/70 transition-all"
              aria-label={videoMuted ? "Unmute" : "Mute"}
            >
              {videoMuted
                ? <VolumeX className="h-4 w-4 text-white/70" />
                : <Volume2 className="h-4 w-4 text-white" />}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDownload(); }}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-black/50 backdrop-blur-md ring-1 ring-white/15 hover:bg-black/70 transition-all"
              aria-label="Download video"
            >
              <Download className="h-4 w-4 text-white" />
            </button>
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/80 font-mono w-8">{formatTime(videoCurrentTime)}</span>
              <div
                className="flex-1 h-1 rounded-full bg-white/20 overflow-hidden cursor-pointer"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const newTime = ((e.clientX - rect.left) / rect.width) * (videoDuration || duration);
                  if (videoRef.current) videoRef.current.currentTime = newTime;
                  if (videoRefFullscreen.current) videoRefFullscreen.current.currentTime = newTime;
                  onSeek(newTime);
                }}
              >
                <div
                  className="h-full rounded-full bg-white"
                  style={{ width: `${videoDuration > 0 ? (videoCurrentTime / videoDuration) * 100 : 0}%` }}
                />
              </div>
              <span className="text-xs text-white/80 font-mono w-8 text-right">{formatTime(videoDuration || duration)}</span>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

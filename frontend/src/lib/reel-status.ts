// Reel.status values from the backend (Pending/Generating/Completed/Failed) —
// distinct from Distribution's publish status (Published/Scheduled), which
// doesn't exist yet (Feature 3).
export const REEL_STATUS_BADGE: Record<string, string> = {
  Completed: "bg-success/15 text-success border-success/30",
  Generating: "bg-warning/15 text-warning border-warning/30",
  Pending: "bg-warning/15 text-warning border-warning/30",
  Failed: "bg-destructive/15 text-destructive border-destructive/30",
};

// Reel media fields (final_commercial_video_url, raw_video_url, first_frame_url)
// come back from the backend as either a full URL (e.g. Gemini's fal.media CDN
// URL for AI-generated first frames) or a bare R2 object key (e.g. an uploaded
// reel's FFmpeg-extracted thumbnail). Bare keys need to go through the backend's
// /api/upload/videos/{key} proxy since the R2 bucket isn't publicly accessible.
export const resolveVideoUrl = (url: string | null | undefined) => {
  if (!url) return null;
  return url.startsWith("http")
    ? url
    : `http://localhost:8000/api/upload/videos/${url}`;
};

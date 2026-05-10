import os
import asyncio
import ffmpeg

async def overlay_watermark(video_path: str, overlay_path: str, position: str, output_path: str) -> str:
    """
    Overlay an image (logo or product) onto a video using FFmpeg.
    Position can be 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'.
    """
    # Calculate position coordinates
    if position == 'top-left':
        overlay_x = '10'
        overlay_y = '10'
    elif position == 'top-right':
        overlay_x = 'main_w-overlay_w-10'
        overlay_y = '10'
    elif position == 'bottom-left':
        overlay_x = '10'
        overlay_y = 'main_h-overlay_h-10'
    elif position == 'bottom-right':
        overlay_x = 'main_w-overlay_w-10'
        overlay_y = 'main_h-overlay_h-10'
    elif position == 'center':
        overlay_x = '(main_w-overlay_w)/2'
        overlay_y = '(main_h-overlay_h)/2'
    else:
        # Default to bottom-right
        overlay_x = 'main_w-overlay_w-10'
        overlay_y = 'main_h-overlay_h-10'

    def _process():
        try:
            input_video = ffmpeg.input(video_path)
            input_overlay = ffmpeg.input(overlay_path)
            
            # Scale overlay (e.g., max width 150px, keep aspect ratio)
            input_overlay = ffmpeg.filter(input_overlay, 'scale', 150, -1)
            
            # Apply overlay
            overlaid = ffmpeg.overlay(input_video, input_overlay, x=overlay_x, y=overlay_y)
            
            # Output as H.264 MP4 to meet broad compatibility requirements
            out = ffmpeg.output(
                overlaid,
                input_video.audio, # Preserve audio if any
                output_path,
                vcodec='libx264',
                acodec='aac',
                strict='experimental'
            )
            
            ffmpeg.run(out, overwrite_output=True, quiet=True)
            return output_path
        except ffmpeg.Error as e:
            print(f"FFmpeg error: {e.stderr.decode('utf8')}")
            raise

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _process)
    return output_path

import { ImageResponse } from 'next/og';

export const alt = 'ReelCast — Create, publish and track product Reels';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', height: '100%', padding: 80, background: 'linear-gradient(135deg, #101218, #28172e)', color: '#fff' }}>
      <div style={{ fontSize: 36, color: '#fb7185', marginBottom: 36 }}>ReelCast</div>
      <div style={{ fontSize: 70, fontWeight: 700, lineHeight: 1.15 }}>Create. Publish. Track.</div>
      <div style={{ fontSize: 30, marginTop: 32, color: '#cbd5e1' }}>AI product Reels & social media tracking</div>
    </div>, size,
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Allows an isolated build check while the local dev server uses .next.
  distDir: process.env.REELCAST_BUILD_DIR || ".next",
};

export default nextConfig;

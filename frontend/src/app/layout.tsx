import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { canIndex, siteDescription, siteName, siteUrl } from "@/lib/seo";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: "ReelCast — AI Product Reels & Social Media Tracking", template: "%s | ReelCast" },
  description: siteDescription,
  applicationName: siteName,
  robots: { index: canIndex, follow: true },
  verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined },
  openGraph: { type: "website", siteName, title: "ReelCast — AI Product Reels & Social Media Tracking", description: siteDescription, locale: "en_US" },
  twitter: { card: "summary_large_image", title: "ReelCast — AI Product Reels & Social Media Tracking", description: siteDescription },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}




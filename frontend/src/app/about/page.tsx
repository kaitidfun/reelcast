import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Clapperboard, Send, Sparkles } from "lucide-react";
import { canIndex, siteDescription, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "AI Product Reels & Social Media Tracking",
  description: siteDescription,
  robots: { index: canIndex, follow: true },
  ...(siteUrl ? { alternates: { canonical: '/about' }, openGraph: { type: 'website', siteName: 'ReelCast', title: 'ReelCast — AI Product Reels & Social Media Tracking', description: siteDescription, url: '/about' } } : {}),
};

const features = [
  { icon: Clapperboard, title: 'Create product Reels with AI', description: 'Turn product ideas and prompts into short videos. Organize your Reels, products and campaigns in one workspace.' },
  { icon: Send, title: 'Publish across social platforms', description: 'Connect YouTube, Facebook, Instagram and TikTok to prepare and distribute your short videos through supported publishing flows.' },
  { icon: BarChart3, title: 'Track content performance', description: 'Review available views, likes, comments and shares alongside affiliate link visits. Compare platforms, rank content and export reports.' },
];

export default function AboutPage() {
  const structuredData = siteUrl ? {
    '@context': 'https://schema.org', '@type': 'WebSite', name: 'ReelCast',
    url: new URL('/about', siteUrl).href, description: siteDescription, inLanguage: 'en',
  } : null;
  return (
    <div className="min-h-screen bg-background text-foreground">
      {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
        <Link href="/about" className="flex items-center gap-2 text-xl font-bold"><Sparkles className="h-6 w-6 text-primary" aria-hidden="true" />ReelCast</Link>
        <nav aria-label="Main navigation" className="flex items-center gap-4 text-sm"><a href="#features" className="hover:text-primary">Features</a><Link href="/login" className="rounded-lg border border-border px-4 py-2 hover:bg-muted">Sign in</Link></nav>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-20">
        <section className="py-16 sm:py-24">
          <p className="mb-5 text-sm font-medium text-primary">AI-powered product video workspace</p>
          <h1 className="max-w-4xl font-display text-4xl font-bold leading-tight tracking-tight sm:text-6xl">Create, publish and track your product Reels with ReelCast.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">Bring AI video creation, social publishing and content performance into one workflow. Spend more time shaping your next idea with your products and campaigns organized together.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link href="/register" className="gradient-primary rounded-xl px-6 py-3 font-semibold text-primary-foreground">Get started</Link><a href="#features" className="rounded-xl border border-border px-6 py-3 font-semibold hover:bg-muted">Explore features</a></div>
        </section>
        <section id="features" aria-labelledby="features-heading">
          <h2 id="features-heading" className="mb-8 font-display text-2xl font-bold">From product idea to performance insights</h2>
          <div className="grid gap-5 md:grid-cols-3">{features.map(({ icon: Icon, title, description }) => <article key={title} className="rounded-2xl border border-border bg-card p-6"><Icon className="mb-5 h-7 w-7 text-primary" aria-hidden="true" /><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 text-sm leading-relaxed text-muted-foreground">{description}</p></article>)}</div>
          <p className="mt-6 text-sm text-muted-foreground">Social metrics depend on each platform’s permissions and data availability. Affiliate link clicks measure link visits.</p>
        </section>
      </main>
      <footer className="border-t border-border px-6 py-6 text-center text-sm text-muted-foreground">ReelCast · AI product Reels and social media tracking</footer>
    </div>
  );
}

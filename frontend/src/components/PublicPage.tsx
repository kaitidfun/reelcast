import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Sparkles } from "lucide-react";

const publicLinks = [
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/support", label: "Support" },
];

export function PublicFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-7 text-xs text-muted-foreground sm:flex-row">
        <p>© 2026 ReelCast · Create. Publish. Grow.</p>
        <nav aria-label="Footer navigation" className="flex flex-wrap justify-center gap-6">
          <Link href="/about" className="transition-colors hover:text-foreground">About</Link>
          {publicLinks.map(({ href, label }) => <Link key={href} href={href} className="transition-colors hover:text-foreground">{label}</Link>)}
        </nav>
      </div>
    </footer>
  );
}

export default function PublicPage({ active, eyebrow, title, description, children }: {
  active: "/privacy" | "/terms" | "/support";
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <a href="#main-content" className="sr-only z-50 rounded-lg bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5 px-6 py-5">
          <Link href="/about" className="flex items-center gap-3 font-display text-xl font-bold tracking-tight">
            <span className="gradient-primary flex h-9 w-9 items-center justify-center rounded-xl shadow-glow"><Sparkles className="h-5 w-5 text-primary-foreground" aria-hidden="true" /></span>
            ReelCast
          </Link>
          <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-5 text-sm">
            {publicLinks.map(({ href, label }) => <Link key={href} href={href} aria-current={active === href ? "page" : undefined} className={active === href ? "font-medium text-primary" : "text-muted-foreground transition-colors hover:text-foreground"}>{label}</Link>)}
            <Link href="/login" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 hover:bg-muted">Sign in <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></Link>
          </nav>
        </div>
      </header>
      <main id="main-content" className="relative flex-1">
        <div className="gradient-glow pointer-events-none absolute inset-x-0 top-0 h-[440px]" />
        <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-8 sm:pt-12">
          <Link href="/about" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Back to ReelCast</Link>
          <div className="pb-10 pt-10 sm:pb-14">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-primary">{eyebrow}</p>
            <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">{description}</p>
          </div>
          {children}
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}

export type PolicySection = { id: string; title: string; content: ReactNode };

export function PolicyContent({ sections }: { sections: PolicySection[] }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-14">
      <aside className="rounded-2xl border border-border bg-card p-6 lg:sticky lg:top-8">
        <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">On this page</p>
        <nav aria-label="Table of contents" className="flex flex-col gap-3">
          {sections.map((section, index) => <a key={section.id} href={`#${section.id}`} className="flex gap-3 text-sm leading-relaxed text-muted-foreground hover:text-primary"><span className="text-primary/70">{String(index + 1).padStart(2, "0")}</span>{section.title}</a>)}
        </nav>
        <p className="mt-6 border-t border-border pt-5 text-xs leading-relaxed text-muted-foreground">Last updated<br /><time dateTime="2026-10-17">October 17, 2026</time></p>
      </aside>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card px-6 sm:px-9">
        {sections.map((section, index) => (
          <section key={section.id} id={section.id} aria-labelledby={`${section.id}-heading`} className="scroll-mt-8 py-8">
            <h2 id={`${section.id}-heading`} className="mb-4 font-display text-xl font-semibold"><span className="mr-3 text-sm text-primary">{String(index + 1).padStart(2, "0")}</span>{section.title}</h2>
            <div className="space-y-4 text-sm leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">{section.content}</div>
          </section>
        ))}
      </div>
    </div>
  );
}

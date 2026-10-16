import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, BarChart3, ChevronDown, Clapperboard, KeyRound, Mail, Send, ShieldCheck } from "lucide-react";
import PublicPage from "@/components/PublicPage";
import { siteUrl } from "@/lib/seo";
import { supportContacts, supportMailto } from "@/lib/support";

export const metadata: Metadata = {
  title: "Support",
  description: "Find help with your ReelCast account, video generation, publishing and performance tracking, or contact the team.",
  ...(siteUrl ? { alternates: { canonical: "/support" } } : {}),
};

const topics = [
  { icon: KeyRound, title: "Account & sign-in", description: "Passwords, verification and account access.", href: "#account-help" },
  { icon: Clapperboard, title: "Creating Reels", description: "Generation, previews and your media library.", href: "#creation-help" },
  { icon: Send, title: "Social publishing", description: "Connected accounts and publishing issues.", href: "#publishing-help" },
  { icon: BarChart3, title: "Tracking & reports", description: "Understand your metrics and exports.", href: "#tracking-help" },
];

const faqs = [
  { id: "account-help", question: "I cannot sign in. What should I check?", answer: <p>Use the same sign-in method you used when registering. For an email-and-password account, check that you verified your email and use <Link href="/forgot-password">Reset password</Link> if needed. Check spam or junk folders for account emails. If two-factor authentication is enabled, use the current code from your authenticator app. Contact us if you have lost access.</p> },
  { id: "creation-help", question: "My Reel is still generating or has failed.", answer: <p>Generation time varies with the request and the services involved. Check the generation status in your workspace before starting another job. If it fails, note the error message and Reel name, check your input media and try again. For repeated failures, email us the approximate time and steps that led to the issue.</p> },
  { id: "publishing-help", question: "Why can I not connect or publish to a social account?", answer: <p>Check Connected accounts in <Link href="/account">Account</Link> and review the permissions granted by the platform. A platform marked “Needs setup” is not yet available in this installation. If publishing fails, check the error and confirm that your account is eligible to publish on that platform. Before disconnecting, note that doing so permanently removes its Distribution history. Disconnecting does not delete posts already on the platform.</p> },
  { id: "tracking-help", question: "Why do my metrics differ from the social platform?", answer: <p>Metrics depend on the platform’s permissions, update timing and available data. Social figures are the latest lifetime totals observed in the selected dates, rather than activity only within those dates. Affiliate clicks are visits during the selected period in Asia/Bangkok time; repeat visits count. Clicks do not measure purchases or unique visitors. Period comparisons are available for affiliate clicks.</p> },
  { id: "export-help", question: "How do I export a performance report?", answer: <p>Open <Link href="/tracking">Tracking</Link>, choose the period and filters you need, then use the export control to download CSV or XLSX. If there is no matching data, broaden the filters or check that the selected content has published successfully.</p> },
  { id: "privacy-help", question: "How do I request account or data deletion?", answer: <p>Email the team from the address associated with your ReelCast account and describe the data you want removed. We may ask you to verify account ownership. Do not include passwords or verification codes. Read the <Link href="/privacy">Privacy Policy</Link> for more on stored data and connected accounts.</p> },
];

export default function SupportPage() {
  return (
    <PublicPage active="/support" eyebrow="ReelCast help center" title="How can we help?" description="Find a quick answer, get back to creating, or reach out to the people behind ReelCast.">
      <section aria-label="Help topics" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {topics.map(({ icon: Icon, title, description, href }) => <a key={href} href={href} className="group rounded-2xl border border-border bg-card p-6 transition-colors hover:border-primary/50 hover:bg-muted/50"><Icon className="mb-5 h-6 w-6 text-primary" aria-hidden="true" /><h2 className="flex items-center justify-between gap-2 text-base font-semibold">{title}<ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" /></h2><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p></a>)}
      </section>
      <div className="mt-12 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section aria-labelledby="faq-heading">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-primary">A little guidance</p>
          <h2 id="faq-heading" className="mb-6 font-display text-2xl font-semibold">Frequently asked questions</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {faqs.map(({ id, question, answer }) => <details key={id} id={id} className="group scroll-mt-6 open:bg-muted/30"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 text-sm font-medium [&::-webkit-details-marker]:hidden"><span>{question}</span><ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" /></summary><div className="px-6 pb-6 text-sm leading-7 text-muted-foreground [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4">{answer}</div></details>)}
          </div>
        </section>
        <aside id="contact" className="scroll-mt-8 space-y-5 lg:sticky lg:top-8">
          <section className="rounded-2xl border border-primary/25 bg-primary/5 p-6" aria-labelledby="contact-heading">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10"><Mail className="h-5 w-5 text-primary" aria-hidden="true" /></div>
            <h2 id="contact-heading" className="font-display text-xl font-semibold">Talk to our team</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">Still stuck? Tell us what happened and what you were trying to do.</p>
            <div className="my-5 space-y-3">{supportContacts.map((email) => <a key={email} href={`mailto:${email}?subject=ReelCast%20support`} className="block break-all text-sm text-primary underline-offset-4 hover:underline">{email}</a>)}</div>
            <a href={supportMailto("ReelCast support request")} className="gradient-primary flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-primary-foreground">Email the team<ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Opens your email app. You can also copy either address above.</p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-6" aria-labelledby="report-heading">
            <h2 id="report-heading" className="mb-3 text-sm font-semibold">What to include</h2>
            <ul className="list-disc space-y-2 pl-4 text-sm leading-relaxed text-muted-foreground"><li>The email associated with your account</li><li>The page or Reel you were working on</li><li>Steps to reproduce the issue</li><li>The error message and approximate time</li><li>A screenshot with private details hidden</li></ul>
            <p className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />Never share passwords, verification codes or access tokens.</p>
          </section>
          <a href={supportMailto("ReelCast privacy and data deletion request")} className="block text-center text-sm text-muted-foreground hover:text-primary">Need help with your data? Contact us →</a>
        </aside>
      </div>
    </PublicPage>
  );
}

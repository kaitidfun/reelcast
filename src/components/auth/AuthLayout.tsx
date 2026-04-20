import { ReactNode } from "react";
import { Sparkles, Wand2, Share2, TrendingUp, Quote } from "lucide-react";
import { motion } from "framer-motion";

interface AuthLayoutProps {
  children: ReactNode;
}

const valueProps = [
  {
    icon: Wand2,
    title: "AI-generated scripts & B-roll",
    desc: "Veo + Gemini craft on-brand Reels from a product link.",
  },
  {
    icon: Share2,
    title: "One-click distribution",
    desc: "Publish to TikTok, Reels, Shorts and 4 more in seconds.",
  },
  {
    icon: TrendingUp,
    title: "Sales & engagement in one view",
    desc: "Track conversions across social and e-commerce platforms.",
  },
];

const trustBadges = ["TikTok", "YouTube", "Instagram", "Shopee", "Lazada", "Meta"];

export const AuthLayout = ({ children }: AuthLayoutProps) => {
  return (
    <div className="flex min-h-screen bg-background">
      {/* LEFT PANEL */}
      <aside className="relative hidden lg:flex lg:w-[55%] flex-col justify-between overflow-hidden border-r border-border/50 p-12 xl:p-16">
        {/* Background layers */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle, hsl(var(--foreground)) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />
        <div className="gradient-glow pointer-events-none absolute inset-0" />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2 }}
          className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/20 blur-3xl"
        />
        <motion.div
          aria-hidden
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.3 }}
          className="absolute bottom-0 right-0 h-[28rem] w-[28rem] rounded-full bg-accent/20 blur-3xl"
        />

        {/* Content */}
        <div className="relative z-10">
          {/* Logo lockup */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary shadow-glow">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <p className="font-display text-lg font-bold text-foreground tracking-tight leading-none">
                ReelCast
              </p>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-1">
                AI Commercial Studio
              </p>
            </div>
          </motion.div>
        </div>

        <div className="relative z-10 max-w-xl">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="font-display text-4xl xl:text-5xl font-bold tracking-tight text-foreground leading-[1.1]"
          >
            Turn products into{" "}
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              viral Reels
            </span>{" "}
            in minutes.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-4 text-base text-muted-foreground max-w-md"
          >
            The AI commercial studio for merchants, affiliates, and brand owners.
          </motion.p>

          {/* Value props */}
          <div className="mt-10 space-y-5">
            {valueProps.map((vp, i) => {
              const Icon = vp.icon;
              return (
                <motion.div
                  key={vp.title}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  className="flex items-start gap-3"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card/60 backdrop-blur">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{vp.title}</p>
                    <p className="text-sm text-muted-foreground">{vp.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Testimonial */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7 }}
            className="mt-10 rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-5 shadow-elevated"
          >
            <Quote className="h-5 w-5 text-primary mb-3" />
            <p className="text-sm text-foreground leading-relaxed">
              "We replaced our entire video team with ReelCast. We now ship 30 Reels
              a week and our affiliate revenue is up 4x."
            </p>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-primary text-xs font-semibold text-primary-foreground">
                MK
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">Maya Kanya</p>
                <p className="text-[11px] text-muted-foreground">
                  Head of Growth · Lumen Skincare
                </p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="relative z-10"
        >
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
            Publishes & syncs with
          </p>
          <div className="flex flex-wrap gap-2">
            {trustBadges.map((b) => (
              <span
                key={b}
                className="rounded-md border border-border/60 bg-card/40 backdrop-blur px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              >
                {b}
              </span>
            ))}
          </div>
        </motion.div>
      </aside>

      {/* RIGHT PANEL */}
      <main className="relative flex w-full lg:w-[45%] flex-col">
        {/* Mobile glow */}
        <div className="gradient-glow pointer-events-none absolute inset-0 lg:hidden" />

        <div className="relative z-10 flex flex-1 flex-col items-center justify-center p-6 sm:p-10">
          {/* Mobile logo */}
          <div className="mb-8 flex flex-col items-center gap-3 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-glow-lg">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="text-center">
              <h1 className="font-display text-xl font-bold text-foreground tracking-tight">
                ReelCast
              </h1>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-1">
                AI Commercial Studio
              </p>
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-[420px]"
          >
            {children}
          </motion.div>

          {/* Footer */}
          <footer className="relative z-10 mt-10 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">
              Terms
            </a>
            <span aria-hidden>·</span>
            <a href="#" className="hover:text-foreground transition-colors">
              Privacy
            </a>
            <span aria-hidden>·</span>
            <span>© {new Date().getFullYear()} ReelCast</span>
          </footer>
        </div>
      </main>
    </div>
  );
};

export default AuthLayout;

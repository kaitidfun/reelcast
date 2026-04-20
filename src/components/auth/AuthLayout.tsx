import { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Zap, TrendingUp, ShieldCheck, Quote } from "lucide-react";
import { motion } from "framer-motion";

interface AuthLayoutProps {
  children: ReactNode;
  /** Optional eyebrow text shown above the headline on the brand panel */
  eyebrow?: string;
  /** Headline shown on the brand panel */
  headline?: string;
  /** Subheadline shown on the brand panel */
  subheadline?: string;
}

const features = [
  {
    icon: Zap,
    title: "AI-Powered Studio",
    desc: "Generate vertical Reels in minutes with Veo & Gemini.",
  },
  {
    icon: TrendingUp,
    title: "Multi-Channel Distribution",
    desc: "Publish to TikTok, Instagram, YouTube & Facebook at once.",
  },
  {
    icon: ShieldCheck,
    title: "Trusted by Creators",
    desc: "Enterprise-grade security with full data ownership.",
  },
];

const AuthLayout = ({
  children,
  eyebrow = "AI Commercial Studio",
  headline = "Turn ideas into scroll-stopping Reels.",
  subheadline = "The all-in-one platform for merchants, affiliates and brands to create, distribute and monetize short-form video at scale.",
}: AuthLayoutProps) => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background">
      {/* Ambient glow */}
      <div className="gradient-glow pointer-events-none fixed inset-0" />
      <div className="dot-pattern pointer-events-none fixed inset-0 opacity-[0.15]" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-8 lg:px-8">
        <div className="grid w-full grid-cols-1 overflow-hidden rounded-3xl border border-border/60 bg-card/40 shadow-elevated backdrop-blur-xl lg:grid-cols-2">
          {/* Brand Panel — hidden on mobile */}
          <div className="relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
            <div className="absolute inset-0 gradient-subtle" />
            <div
              className="absolute -top-24 -left-24 h-72 w-72 rounded-full opacity-30 blur-3xl"
              style={{ background: "var(--gradient-primary)" }}
            />
            <div
              className="absolute -bottom-32 -right-20 h-80 w-80 rounded-full opacity-20 blur-3xl"
              style={{ background: "var(--gradient-primary)" }}
            />

            {/* Top: Logo */}
            <div className="relative z-10">
              <Link to="/" className="inline-flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary shadow-glow">
                  <Sparkles className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="font-display text-xl font-bold tracking-tight text-foreground">
                    ReelCast
                  </p>
                  <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {eyebrow}
                  </p>
                </div>
              </Link>
            </div>

            {/* Middle: Headline + Features */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="relative z-10 my-10 space-y-8"
            >
              <div className="space-y-4">
                <h2 className="font-display text-4xl font-bold leading-tight tracking-tight text-foreground xl:text-[2.75rem]">
                  {headline.split(" ").slice(0, -2).join(" ")}{" "}
                  <span className="text-gradient">
                    {headline.split(" ").slice(-2).join(" ")}
                  </span>
                </h2>
                <p className="max-w-md text-base leading-relaxed text-muted-foreground">
                  {subheadline}
                </p>
              </div>

              <div className="space-y-4">
                {features.map((f, i) => {
                  const Icon = f.icon;
                  return (
                    <motion.div
                      key={f.title}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.2 + i * 0.08 }}
                      className="flex items-start gap-3"
                    >
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary/60">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          {f.title}
                        </p>
                        <p className="text-xs text-muted-foreground">{f.desc}</p>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>

            {/* Bottom: Testimonial */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="relative z-10 rounded-2xl border border-border/60 bg-secondary/40 p-5 backdrop-blur-sm"
            >
              <Quote className="h-5 w-5 text-primary/60" />
              <p className="mt-2 text-sm leading-relaxed text-foreground">
                "ReelCast cut our content production time by 80%. We ship 5x more
                campaigns and revenue is up 3x."
              </p>
              <div className="mt-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full gradient-primary text-xs font-bold text-primary-foreground">
                  SK
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Sarah Kim
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Head of Growth, Lumio Beauty
                  </p>
                </div>
              </div>
            </motion.div>
          </div>

          {/* Form Panel */}
          <div className="relative flex items-center justify-center bg-background/40 p-6 sm:p-10 lg:p-12">
            {/* Mobile-only logo */}
            <div className="absolute left-0 right-0 top-6 flex justify-center lg:hidden">
              <Link to="/" className="inline-flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow">
                  <Sparkles className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-display text-lg font-bold tracking-tight text-foreground">
                  ReelCast
                </span>
              </Link>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="w-full max-w-md pt-16 lg:pt-0"
            >
              {children}
            </motion.div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 pb-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ReelCast. All rights reserved. ·{" "}
        <a href="#" className="hover:text-foreground transition-colors">
          Terms
        </a>{" "}
        ·{" "}
        <a href="#" className="hover:text-foreground transition-colors">
          Privacy
        </a>
      </div>
    </div>
  );
};

export default AuthLayout;

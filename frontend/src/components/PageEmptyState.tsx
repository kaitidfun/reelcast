"use client";

import { useId, type ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, type LucideIcon } from "lucide-react";

type EmptyStateItem = { title: string; description: string };

export function PageEmptyState({ icon: Icon, secondaryIcon: SecondaryIcon, kicker, title, description, actions, steps, stepsLabel, features = [], motionStyle = "standard" }: {
  icon: LucideIcon;
  secondaryIcon: LucideIcon;
  kicker: string;
  title: string;
  description: string;
  actions: ReactNode;
  steps: (EmptyStateItem & { complete?: boolean })[];
  stepsLabel: string;
  features?: (EmptyStateItem & { icon: LucideIcon })[];
  motionStyle?: "standard" | "tracking";
}) {
  const titleId = useId();
  const reduceMotion = useReducedMotion();
  const trackingMotion = motionStyle === "tracking";
  const entrance = {
    initial: reduceMotion ? false as const : { opacity: 0, y: trackingMotion ? 8 : 20 },
    animate: { opacity: 1, y: 0 },
  };
  const transition = (delay: number) => ({
    duration: reduceMotion ? 0 : trackingMotion ? 0.22 : 0.4,
    delay: reduceMotion ? 0 : delay,
    ease: "easeOut" as const,
  });
  return <div className="min-w-0">
    <motion.section {...entrance} transition={transition(trackingMotion ? 0.02 : 0.1)} aria-labelledby={titleId} className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="relative isolate px-6 py-12 text-center sm:px-10 sm:py-16">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary/[0.06] to-transparent" />
        <div
          aria-hidden="true"
          className="relative mx-auto mb-7 flex h-20 w-20 items-center justify-center rounded-3xl border border-primary/15 bg-primary/5"
        >
          <Icon className="h-9 w-9 text-primary" strokeWidth={1.5} />
          <span className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"><SecondaryIcon className="h-4 w-4" /></span>
        </div>
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">{kicker}</p>
        <h2 id={titleId} className="mt-3 font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
        <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">{actions}</div>
      </div>
      <ol aria-label={stepsLabel} className="grid border-t border-border/70 md:grid-cols-3">
        {steps.map((step, index) => <li key={step.title}
          className="flex gap-3 p-5 md:p-6 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-border/70 md:[&:not(:first-child)]:border-l md:[&:not(:first-child)]:border-t-0">
          <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${step.complete ? "bg-emerald-500/10 text-emerald-500" : "bg-muted text-muted-foreground"}`}>
            {step.complete ? <Check aria-label="Completed" className="h-3.5 w-3.5" /> : <span aria-hidden="true">{index + 1}</span>}
          </span>
          <div><h3 className="text-sm font-medium text-foreground">{step.title}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.description}</p></div>
        </li>)}
      </ol>
    </motion.section>
    {features.length > 0 && <motion.div {...entrance} transition={transition(trackingMotion ? 0.04 : 0.2)} className="mt-5 grid gap-4 sm:grid-cols-3">
      {features.map(({ icon: FeatureIcon, title: featureTitle, description: featureDescription }) => <div key={featureTitle}
        className="flex items-start gap-3 px-2 py-3 sm:px-3">
        <FeatureIcon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div><h3 className="text-sm font-medium text-foreground">{featureTitle}</h3><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{featureDescription}</p></div>
      </div>)}
    </motion.div>}
  </div>;
}

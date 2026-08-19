import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
  delay?: number;
  compact?: boolean;
  className?: string;
}

const StatCard = ({ icon: Icon, label, value, change, positive, delay = 0, compact = false, className = "" }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay, duration: 0.4, ease: "easeOut" }}
    className={`group relative rounded-xl border border-border bg-card shadow-card card-shine transition-all duration-300 hover:border-primary/20 hover:shadow-elevated ${compact ? "min-h-[148px] p-4 sm:p-5" : "p-6"} ${className}`}
  >
    <div className="absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ background: 'var(--gradient-card-hover)' }} />
    <div className="relative z-10">
      <div className="flex items-center justify-between">
        <div className={`flex items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/20 transition-all duration-300 group-hover:bg-primary/15 group-hover:ring-primary/30 group-hover:shadow-glow ${compact ? "h-9 w-9" : "h-11 w-11"}`}>
          <Icon className="h-5 w-5 text-primary" />
        </div>
        {change && (
          <span className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            positive 
              ? "bg-success/10 text-success ring-1 ring-success/20" 
              : "bg-destructive/10 text-destructive ring-1 ring-destructive/20"
          }`}>
            {change}
          </span>
        )}
      </div>
      <p className={`mt-4 font-display font-bold tracking-tight text-foreground ${compact ? "text-2xl" : "text-3xl"}`}>{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
    </div>
  </motion.div>
);

export default StatCard;



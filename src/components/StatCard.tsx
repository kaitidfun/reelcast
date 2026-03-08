import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  change?: string;
  positive?: boolean;
}

const StatCard = ({ icon: Icon, label, value, change, positive }: StatCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-xl border border-border bg-card p-6 shadow-card"
  >
    <div className="flex items-center justify-between">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      {change && (
        <span className={`text-xs font-medium ${positive ? "text-success" : "text-destructive"}`}>
          {change}
        </span>
      )}
    </div>
    <p className="mt-4 font-display text-2xl font-bold text-foreground">{value}</p>
    <p className="mt-1 text-sm text-muted-foreground">{label}</p>
  </motion.div>
);

export default StatCard;

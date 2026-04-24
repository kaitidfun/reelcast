import { motion } from "framer-motion";
import { Link2, Plus, Copy, ExternalLink, TrendingUp, MousePointerClick, BarChart3, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import StatCard from "@/components/StatCard";

const mockLinks = [
  { id: 1, name: "Summer Dress — Shopee", original: "https://shopee.co.th/product/123456", short: "reel.link/summer01", clicks: 2340, conversions: 89, revenue: "฿12,450" },
  { id: 2, name: "Minimal Watch — Lazada", original: "https://lazada.co.th/products/789", short: "reel.link/watch01", clicks: 1856, conversions: 67, revenue: "฿8,920" },
  { id: 3, name: "Skincare Set — Brand Site", original: "https://brand.com/skincare-bundle", short: "reel.link/skin01", clicks: 3210, conversions: 142, revenue: "฿21,300" },
  { id: 4, name: "Tech Gadget — Amazon", original: "https://amazon.co.th/dp/B09XYZ", short: "reel.link/tech01", clicks: 987, conversions: 31, revenue: "฿4,650" },
];

const AffiliateLinks = () => {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-foreground">Affiliate Links</h1>
          <p className="mt-1 text-muted-foreground">Manage product links and track performance</p>
        </div>
        <Button className="gradient-primary gap-2 text-primary-foreground shadow-glow hover:shadow-glow-lg transition-all duration-300 w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Add Link
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
        <StatCard icon={MousePointerClick} label="Total Clicks" value="8,393" change="+18%" positive delay={0.05} />
        <StatCard icon={TrendingUp} label="Total Conversions" value="329" change="+12%" positive delay={0.1} />
        <StatCard icon={BarChart3} label="Total Revenue" value="฿47,320" change="+22%" positive delay={0.15} />
      </div>

      {/* Links */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {/* Mobile Cards */}
        <div className="space-y-4 sm:hidden">
          {mockLinks.map((link, i) => (
            <motion.div
              key={link.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 + i * 0.05 }}
              className="rounded-2xl border border-border bg-card p-5 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{link.name}</p>
                  <span className="inline-block mt-1.5 rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
                    {link.short}
                  </span>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <Copy className="h-4 w-4" />
                  </button>
                  <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <ExternalLink className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Clicks</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{link.clicks.toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-muted/50 p-3 text-center">
                  <p className="text-xs text-muted-foreground">Conv.</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{link.conversions}</p>
                </div>
                <div className="rounded-xl bg-success/5 p-3 text-center ring-1 ring-success/10">
                  <p className="text-xs text-muted-foreground">Revenue</p>
                  <p className="mt-1 text-sm font-semibold text-success">{link.revenue}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Desktop Table */}
        <div className="hidden sm:block rounded-2xl border border-border bg-card shadow-card overflow-hidden">
          <div className="border-b border-border px-6 py-4">
            <Input placeholder="Search links..." className="max-w-xs bg-muted/50 border-border" />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="px-6 py-3.5 font-medium">Name</th>
                  <th className="px-6 py-3.5 font-medium">Short Link</th>
                  <th className="px-6 py-3.5 font-medium">Clicks</th>
                  <th className="px-6 py-3.5 font-medium">Conversions</th>
                  <th className="px-6 py-3.5 font-medium">Revenue</th>
                  <th className="px-6 py-3.5 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {mockLinks.map((link) => (
                  <tr key={link.id} className="transition-colors hover:bg-muted/30 group">
                    <td className="px-6 py-4">
                      <div>
                        <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors">{link.name}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-[200px]">{link.original}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary ring-1 ring-primary/20">
                        {link.short}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-foreground">{link.clicks.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-foreground">{link.conversions}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-success">{link.revenue}</td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1.5">
                        <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Copy link">
                          <Copy className="h-4 w-4" />
                        </button>
                        <button className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" title="Open link">
                          <ArrowUpRight className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AffiliateLinks;
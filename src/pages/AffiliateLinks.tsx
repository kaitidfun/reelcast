import { motion } from "framer-motion";
import { Link2, Plus, Copy, ExternalLink, TrendingUp, MousePointerClick, BarChart3 } from "lucide-react";
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
          <p className="mt-1 text-muted-foreground">จัดการลิงก์สินค้าและติดตามผลลัพธ์</p>
        </div>
        <Button className="gradient-primary gap-2 text-primary-foreground shadow-glow w-full sm:w-auto">
          <Plus className="h-4 w-4" />
          Add Link
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <StatCard icon={MousePointerClick} label="Total Clicks" value="8,393" change="+18%" positive />
        <StatCard icon={TrendingUp} label="Total Conversions" value="329" change="+12%" positive />
        <StatCard icon={BarChart3} label="Total Revenue" value="฿47,320" change="+22%" positive />
      </div>

      {/* Links Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border bg-card shadow-card"
      >
        <div className="border-b border-border px-6 py-4">
          <Input placeholder="ค้นหาลิงก์..." className="max-w-xs bg-muted" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Short Link</th>
                <th className="px-6 py-3 font-medium">Clicks</th>
                <th className="px-6 py-3 font-medium">Conversions</th>
                <th className="px-6 py-3 font-medium">Revenue</th>
                <th className="px-6 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockLinks.map((link) => (
                <tr key={link.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{link.name}</p>
                      <p className="text-xs text-muted-foreground">{link.original}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                      {link.short}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{link.clicks.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-foreground">{link.conversions}</td>
                  <td className="px-6 py-4 text-sm font-medium text-success">{link.revenue}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <Copy className="h-4 w-4" />
                      </button>
                      <button className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                        <ExternalLink className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>
    </div>
  );
};

export default AffiliateLinks;

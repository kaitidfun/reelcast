import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Video, Library, Link2, Send, Sparkles, Menu, X } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useState } from "react";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/create", icon: Video, label: "Create Reel" },
  { to: "/library", icon: Library, label: "Content Library" },
  { to: "/links", icon: Link2, label: "Affiliate Links" },
  { to: "/distribute", icon: Send, label: "Distribution" },
];

const SidebarContent = ({ onNavigate }: { onNavigate?: () => void }) => {
  const location = useLocation();

  return (
    <>
      {/* Logo */}
      <div className="flex items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-foreground">ReelForge</h1>
          <p className="text-xs text-muted-foreground">AI Content Studio</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          return (
            <NavLink
              key={to}
              to={to}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="border-t border-border p-4">
        <div className="rounded-lg bg-muted p-4">
          <p className="text-xs font-medium text-foreground">AI Credits</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-border">
            <div className="h-full w-3/4 rounded-full gradient-primary" />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">750 / 1,000 remaining</p>
        </div>
      </div>
    </>
  );
};

export const MobileHeader = () => {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-sidebar px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="rounded-lg p-2 text-foreground hover:bg-muted">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-sidebar p-0 border-border [&>button]:hidden">
          <div className="flex h-full flex-col">
            <SidebarContent onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary shadow-glow">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-display text-sm font-bold text-foreground">ReelForge</span>
      </div>
    </header>
  );
};

const AppSidebar = () => {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-sidebar md:flex">
      <SidebarContent />
    </aside>
  );
};

export default AppSidebar;

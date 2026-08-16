import { usePathname, useRouter } from "next/navigation";
import { NavLink } from "./NavLink";
import { ChartNoAxesCombined, Video, Library, Send, Sparkles, Menu, LogOut } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const navItems = [
  { href: "/create", icon: Video, label: "Create" },
  { href: "/distribute", icon: Send, label: "Distribute" },
  { href: "/library", icon: Library, label: "Library" },
  { href: "/tracking", icon: ChartNoAxesCombined, label: "Tracking" },
];

/* ---------- Desktop narrow rail ---------- */
const RailContent = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  const handleLogout = () => {
    logout();
    router.replace("/login");
  };

  return (
    <>
      {/* Logo (icon only) → Home */}
      <div className="flex items-center justify-center px-2 py-5">
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              href="/"
              className={`flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow transition-transform duration-200 hover:scale-105 ${
                pathname === "/" ? "ring-2 ring-primary/50 ring-offset-2 ring-offset-sidebar" : ""
              }`}
              aria-label="Home"
            >
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right">ReelCast — AI Commercial Studio</TooltipContent>
        </Tooltip>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1 px-2 py-2">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href;
          return (
            <NavLink
              key={href}
              href={href}
              className={`group flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2.5 transition-all duration-200 ${
                isActive
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 transition-transform duration-200 ${!isActive ? "group-hover:scale-110" : ""}`} />
              <span className="text-[10px] font-medium leading-none">{label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Bottom — minimal profile + logout */}
      <div className="p-3 flex flex-col items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              href="/account"
              className={`rounded-full transition-all duration-200 ${
                pathname === "/account" ? "ring-2 ring-primary ring-offset-2 ring-offset-sidebar" : "hover:opacity-80"
              }`}
            >
              <Avatar className="h-9 w-9">
                {user?.profileImage ? (
                  <AvatarImage src={user.profileImage} alt={user?.displayName ?? "Profile"} className="object-cover" />
                ) : null}
                <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </NavLink>
          </TooltipTrigger>
          <TooltipContent side="right">{user?.displayName ?? "Account"}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleLogout}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-sidebar-accent hover:text-destructive transition-all duration-200"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Sign out</TooltipContent>
        </Tooltip>
      </div>
    </>
  );
};

/* ---------- Mobile drawer (full labels) ---------- */
const DrawerContent = ({ onNavigate }: { onNavigate: () => void }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const initials = user?.displayName
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "U";

  const handleLogout = () => {
    onNavigate();
    logout();
    router.replace("/login");
  };

  return (
    <>
      <NavLink
        href="/"
        onClick={onNavigate}
        className="flex items-center gap-3 px-6 py-6 hover:opacity-80 transition-opacity"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow">
          <Sparkles className="h-5 w-5 text-primary-foreground" />
        </div>
        <div>
          <h1 className="font-display text-lg font-bold text-foreground tracking-tight">ReelCast</h1>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AI Commercial Studio</p>
        </div>
      </NavLink>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href;
          return (
            <NavLink
              key={href}
              href={href}
              onClick={onNavigate}
              className={`group flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "gradient-primary text-primary-foreground shadow-glow"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {label}
            </NavLink>
          );
        })}
      </nav>
      <div className="p-3 space-y-1">
        <NavLink
          href="/account"
          onClick={onNavigate}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
            pathname === "/account"
              ? "gradient-primary text-primary-foreground shadow-glow"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          }`}
        >
          <Avatar className="h-7 w-7">
            {user?.profileImage ? (
              <AvatarImage src={user.profileImage} alt={user?.displayName ?? "Profile"} className="object-cover" />
            ) : null}
            <AvatarFallback className="bg-secondary text-secondary-foreground text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate">{user?.displayName ?? "Account"}</span>
        </NavLink>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-destructive transition-all duration-200"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Sign Out
        </button>
      </div>
    </>
  );
};

export const MobileHeader = () => {
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-sidebar/95 backdrop-blur-md px-4 md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button className="rounded-lg p-2 text-foreground hover:bg-muted transition-colors">
            <Menu className="h-5 w-5" />
          </button>
        </SheetTrigger>
        <SheetContent side="left" className="w-64 bg-sidebar p-0 border-border [&>button]:hidden">
          <SheetTitle className="sr-only">Navigation menu</SheetTitle>
          <div className="flex h-full flex-col">
            <DrawerContent onNavigate={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
      <NavLink href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary shadow-glow">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </div>
        <span className="font-display text-sm font-bold text-foreground tracking-tight">ReelCast</span>
      </NavLink>
    </header>
  );
};

const AppSidebar = () => {
  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-screen w-20 flex-col bg-sidebar md:flex">
      <RailContent />
    </aside>
  );
};

export default AppSidebar;









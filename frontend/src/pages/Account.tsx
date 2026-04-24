import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { User, Mail, Shield, Calendar, LogOut, Save, Crown, ToggleLeft, ToggleRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";

interface PlatformToggle {
  id: string;
  name: string;
  icon: string;
  active: boolean;
}

const Account = () => {
  const { user, updateProfile, logout } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  const [socialPlatforms, setSocialPlatforms] = useState<PlatformToggle[]>([
    { id: "youtube", name: "YouTube", icon: "🎬", active: true },
    { id: "facebook", name: "Facebook", icon: "📘", active: true },
    { id: "instagram", name: "Instagram", icon: "📸", active: false },
    { id: "tiktok", name: "TikTok", icon: "🎵", active: true },
  ]);

  const [ecommercePlatforms, setEcommercePlatforms] = useState<PlatformToggle[]>([
    { id: "tiktok-shop", name: "TikTok Shop", icon: "🛒", active: true },
    { id: "lazada", name: "Lazada", icon: "🛍️", active: false },
    { id: "shopee", name: "Shopee", icon: "🧡", active: false },
  ]);

  if (!user) return null;

  const initials = user.displayName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  const handleSave = () => {
    updateProfile({ displayName, email });
    toast.success("Profile saved successfully");
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const toggleSocial = (id: string) => {
    setSocialPlatforms((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p))
    );
    const platform = socialPlatforms.find((p) => p.id === id);
    if (platform) {
      toast.success(`${platform.name} ${platform.active ? "deactivated" : "activated"}`);
    }
  };

  const toggleEcommerce = (id: string) => {
    setEcommercePlatforms((prev) =>
      prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p))
    );
    const platform = ecommercePlatforms.find((p) => p.id === id);
    if (platform) {
      toast.success(`${platform.name} ${platform.active ? "deactivated" : "activated"}`);
    }
  };

  const planColors: Record<string, string> = {
    free: "bg-muted text-muted-foreground",
    pro: "gradient-primary text-primary-foreground",
    enterprise: "bg-accent text-accent-foreground",
  };

  const PlatformRow = ({ platform, onToggle }: { platform: PlatformToggle; onToggle: (id: string) => void }) => (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition-all ${
          platform.active ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted ring-1 ring-border"
        }`}>
          {platform.icon}
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{platform.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {platform.active ? "Active" : "Inactive"}
          </p>
        </div>
      </div>
      <button onClick={() => onToggle(platform.id)} className="transition-transform hover:scale-110">
        {platform.active ? (
          <ToggleRight className="h-7 w-7 text-primary" />
        ) : (
          <ToggleLeft className="h-7 w-7 text-muted-foreground" />
        )}
      </button>
    </div>
  );

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Account Management</h1>
        <p className="text-sm text-muted-foreground mt-1">Edit your profile and manage account settings</p>
      </div>

      {/* Profile Card */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <Card className="border-border bg-card">
          <CardHeader>
            <div className="flex items-center gap-4">
              <Avatar className="h-16 w-16 ring-2 ring-primary/30">
                <AvatarFallback className="gradient-primary text-primary-foreground text-lg font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-lg">{user.displayName}</CardTitle>
                <CardDescription>{user.email}</CardDescription>
                <div className="mt-2 flex items-center gap-2">
                  <Badge className={`${planColors[user.plan]} text-xs`}>
                    <Crown className="mr-1 h-3 w-3" />
                    {user.plan.toUpperCase()}
                  </Badge>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    Joined {new Date(user.joinedAt).toLocaleDateString("en-US")}
                  </span>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      </motion.div>

      {/* Edit Profile */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <User className="h-4 w-4 text-primary" />
              Profile Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Display Name</Label>
              <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="acc-email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="acc-email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" />
              </div>
            </div>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground shadow-glow">
              <Save className="h-4 w-4" />
              Save
            </Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Activate Platforms */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">🔗 Connect Platforms</CardTitle>
            <CardDescription>Enable or disable platforms for publishing and data tracking</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Social Media */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Social Media Platforms</h3>
              <div className="divide-y divide-border rounded-xl border border-border px-4">
                {socialPlatforms.map((p) => (
                  <PlatformRow key={p.id} platform={p} onToggle={toggleSocial} />
                ))}
              </div>
            </div>

            {/* E-Commerce */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">E-Commerce Platforms</h3>
              <div className="divide-y divide-border rounded-xl border border-border px-4">
                {ecommercePlatforms.map((p) => (
                  <PlatformRow key={p.id} platform={p} onToggle={toggleEcommerce} />
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Security */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-primary" />
              Security
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Password</p>
                <p className="text-xs text-muted-foreground">Change your account password</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => toast.info("Mock mode — cannot change password")}>
                Change Password
              </Button>
            </div>

            <Separator />

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Two-Factor Auth</p>
                <p className="text-xs text-muted-foreground">Add an extra layer of security with 2FA</p>
              </div>
              <Badge variant="outline" className="text-xs">Not enabled</Badge>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logout */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleLogout}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </motion.div>
    </div>
  );
};

export default Account;
"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { User, Mail, Shield, Calendar, LogOut, Save, ToggleLeft, ToggleRight, ShieldCheck, ShieldOff, Copy, Check, Loader2, Lock, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";

const API_URL = "http://localhost:8000";

interface PlatformToggle {
  id: string; name: string; icon: string; active: boolean;
}

const Account = () => {
  const { user, updateProfile, logout, refreshUser } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");

  // 2FA Setup State
  const [showSetupDialog, setShowSetupDialog] = useState(false);
  const [setupStep, setSetupStep] = useState<"loading" | "qr" | "verify" | "done">("loading");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  // 2FA Disable State
  const [showDisableDialog, setShowDisableDialog] = useState(false);
  const [disableOtp, setDisableOtp] = useState("");
  const [disablePassword, setDisablePassword] = useState("");
  const [showDisablePassword, setShowDisablePassword] = useState(false);
  const [disabling, setDisabling] = useState(false);

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

  const initials = user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const is2faEnabled = user.is2faEnabled ?? false;

  const getToken = () => localStorage.getItem("rf_token") || "";

  const handleSave = () => { updateProfile({ displayName, email }); toast.success("Profile saved successfully"); };
  const handleLogout = () => { logout(); router.replace("/login"); };

  const toggleSocial = (id: string) => {
    setSocialPlatforms((prev) => prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));
    const platform = socialPlatforms.find((p) => p.id === id);
    if (platform) toast.success(`${platform.name} ${platform.active ? "deactivated" : "activated"}`);
  };
  const toggleEcommerce = (id: string) => {
    setEcommercePlatforms((prev) => prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));
    const platform = ecommercePlatforms.find((p) => p.id === id);
    if (platform) toast.success(`${platform.name} ${platform.active ? "deactivated" : "activated"}`);
  };

  // ===== 2FA Enable Flow =====
  const startEnable2fa = async () => {
    setShowSetupDialog(true);
    setSetupStep("loading");
    setOtpCode("");
    setCopied(false);
    try {
      const res = await fetch(`${API_URL}/api/2fa/enable`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        const data = await res.json();
        setQrCode(data.qr_code);
        setSecret(data.secret);
        setSetupStep("qr");
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to start 2FA setup" }));
        toast.error(err.detail);
        setShowSetupDialog(false);
      }
    } catch {
      toast.error("Failed to connect to server");
      setShowSetupDialog(false);
    }
  };

  const verifySetup = async () => {
    if (otpCode.length !== 6) return;
    setVerifying(true);
    try {
      const res = await fetch(`${API_URL}/api/2fa/verify-setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: otpCode }),
      });
      if (res.ok) {
        setSetupStep("done");
        await refreshUser();
        toast.success("Two-factor authentication enabled!");
      } else {
        const err = await res.json().catch(() => ({ detail: "Invalid code" }));
        toast.error(err.detail);
        setOtpCode("");
      }
    } catch { toast.error("Verification failed"); }
    setVerifying(false);
  };

  const copySecret = () => {
    navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ===== 2FA Disable Flow =====
  const handleDisable2fa = async () => {
    if (disableOtp.length !== 6 || !disablePassword) return;
    setDisabling(true);
    try {
      const res = await fetch(`${API_URL}/api/2fa/disable`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code: disableOtp, password: disablePassword }),
      });
      if (res.ok) {
        await refreshUser();
        toast.success("Two-factor authentication disabled");
        setShowDisableDialog(false);
        setDisableOtp(""); setDisablePassword("");
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to disable" }));
        toast.error(err.detail);
        setDisableOtp("");
      }
    } catch { toast.error("Failed to connect"); }
    setDisabling(false);
  };

  const PlatformRow = ({ platform, onToggle }: { platform: PlatformToggle; onToggle: (id: string) => void }) => (
    <div className="flex items-center justify-between py-2.5">
      <div className="flex items-center gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl text-base transition-all ${platform.active ? "bg-primary/10 ring-1 ring-primary/20" : "bg-muted ring-1 ring-border"}`}>{platform.icon}</div>
        <div>
          <p className="text-sm font-medium text-foreground">{platform.name}</p>
          <p className="text-[11px] text-muted-foreground">{platform.active ? "Active" : "Inactive"}</p>
        </div>
      </div>
      <button onClick={() => onToggle(platform.id)} className="transition-transform hover:scale-110">
        {platform.active ? <ToggleRight className="h-7 w-7 text-primary" /> : <ToggleLeft className="h-7 w-7 text-muted-foreground" />}
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
                <AvatarFallback className="gradient-primary text-primary-foreground text-lg font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle className="text-lg">{user.displayName}</CardTitle>
                <CardDescription>{user.email}</CardDescription>
                <div className="mt-2 flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" /> Joined {new Date(user.joinedAt).toLocaleDateString("en-US")}
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
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4 text-primary" /> Profile Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label htmlFor="name">Display Name</Label><Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="acc-email">Email</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id="acc-email" value={email} onChange={(e) => setEmail(e.target.value)} className="pl-10" /></div></div>
            <Button onClick={handleSave} className="gradient-primary text-primary-foreground shadow-glow"><Save className="h-4 w-4" /> Save</Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Activate Platforms */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="text-base">🔗 Connect Platforms</CardTitle><CardDescription>Enable or disable platforms for publishing and data tracking</CardDescription></CardHeader>
          <CardContent className="space-y-5">
            <div><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Social Media Platforms</h3><div className="divide-y divide-border rounded-xl border border-border px-4">{socialPlatforms.map((p) => <PlatformRow key={p.id} platform={p} onToggle={toggleSocial} />)}</div></div>
            <div><h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">E-Commerce Platforms</h3><div className="divide-y divide-border rounded-xl border border-border px-4">{ecommercePlatforms.map((p) => <PlatformRow key={p.id} platform={p} onToggle={toggleEcommerce} />)}</div></div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Security - 2FA Section */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-primary" /> Security</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-foreground">Password</p><p className="text-xs text-muted-foreground">Change your account password</p></div>
              <Button variant="outline" size="sm" onClick={() => toast.info("Mock mode — cannot change password")}>Change Password</Button>
            </div>
            <Separator />
            {/* 2FA Row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${is2faEnabled ? "bg-green-500/10 ring-1 ring-green-500/30" : "bg-muted ring-1 ring-border"}`}>
                  {is2faEnabled ? <ShieldCheck className="h-5 w-5 text-green-500" /> : <Shield className="h-5 w-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">Two-Factor Authentication</p>
                  <p className="text-xs text-muted-foreground">
                    {is2faEnabled ? "Your account is protected with TOTP-based 2FA" : "Add an extra layer of security with 2FA"}
                  </p>
                </div>
              </div>
              {is2faEnabled ? (
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500/10 text-green-500 border-green-500/30 text-xs">Enabled</Badge>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => { setShowDisableDialog(true); setDisableOtp(""); setDisablePassword(""); }}>
                    <ShieldOff className="h-3.5 w-3.5" /> Disable
                  </Button>
                </div>
              ) : (
                <Button size="sm" className="gradient-primary text-primary-foreground shadow-glow" onClick={startEnable2fa}>
                  <ShieldCheck className="h-3.5 w-3.5" /> Enable 2FA
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Logout */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <Button variant="outline" className="w-full border-destructive/30 text-destructive hover:bg-destructive/10" onClick={handleLogout}><LogOut className="h-4 w-4" /> Sign Out</Button>
      </motion.div>

      {/* ===== 2FA SETUP DIALOG ===== */}
      <Dialog open={showSetupDialog} onOpenChange={(open) => { if (!open && setupStep !== "done") { setShowSetupDialog(false); } else if (!open) { setShowSetupDialog(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Set Up Two-Factor Authentication</DialogTitle>
            <DialogDescription>Secure your account with time-based one-time passwords (TOTP)</DialogDescription>
          </DialogHeader>

          {setupStep === "loading" && (
            <div className="flex flex-col items-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground mt-3">Generating your secret key...</p>
            </div>
          )}

          {setupStep === "qr" && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-4">
                  Scan this QR code with your authenticator app<br />
                  <span className="text-xs">(Google Authenticator, Authy, 1Password, etc.)</span>
                </p>
                <div className="flex justify-center">
                  <div className="rounded-xl border border-border bg-white p-3">
                    <img src={qrCode} alt="2FA QR Code" className="h-48 w-48" />
                  </div>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-2 text-center">Or enter this secret key manually:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-xs font-mono text-foreground tracking-wider text-center break-all">{secret}</code>
                  <Button variant="outline" size="sm" onClick={copySecret} className="shrink-0">
                    {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
              <Button className="w-full gradient-primary text-primary-foreground shadow-glow" onClick={() => setSetupStep("verify")}>
                I've scanned the QR code <ShieldCheck className="h-4 w-4" />
              </Button>
            </div>
          )}

          {setupStep === "verify" && (
            <div className="space-y-5">
              <p className="text-sm text-muted-foreground text-center">Enter the 6-digit code shown in your authenticator app to verify setup.</p>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={otpCode} onChange={(val) => { setOtpCode(val); if (val.length === 6) setTimeout(() => verifySetup(), 100); }} disabled={verifying}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={1} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={2} className="h-12 w-12 text-lg font-semibold" />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={4} className="h-12 w-12 text-lg font-semibold" />
                    <InputOTPSlot index={5} className="h-12 w-12 text-lg font-semibold" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
              <Button className="w-full gradient-primary text-primary-foreground shadow-glow" onClick={verifySetup} disabled={verifying || otpCode.length !== 6}>
                {verifying ? <><Loader2 className="h-4 w-4 animate-spin" /> Verifying...</> : "Verify & Enable 2FA"}
              </Button>
              <button type="button" onClick={() => { setSetupStep("qr"); setOtpCode(""); }} className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors text-center">
                ← Back to QR code
              </button>
            </div>
          )}

          {setupStep === "done" && (
            <div className="flex flex-col items-center py-4 space-y-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <ShieldCheck className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="font-display text-lg font-bold text-foreground">2FA Enabled!</h3>
              <p className="text-sm text-muted-foreground text-center max-w-xs">
                Your account is now protected with two-factor authentication. You'll need your authenticator app code each time you sign in.
              </p>
              <Button className="w-full gradient-primary text-primary-foreground shadow-glow" onClick={() => setShowSetupDialog(false)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ===== 2FA DISABLE DIALOG ===== */}
      <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ShieldOff className="h-5 w-5 text-destructive" /> Disable Two-Factor Authentication</DialogTitle>
            <DialogDescription>For security, enter your password and a current authenticator code.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Account Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type={showDisablePassword ? "text" : "password"} value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="pl-10 pr-10" placeholder="Enter your password" />
                <button type="button" onClick={() => setShowDisablePassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showDisablePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Authenticator Code</Label>
              <div className="flex justify-center">
                <InputOTP maxLength={6} value={disableOtp} onChange={setDisableOtp} disabled={disabling}>
                  <InputOTPGroup>
                    <InputOTPSlot index={0} className="h-11 w-11 text-base font-semibold" />
                    <InputOTPSlot index={1} className="h-11 w-11 text-base font-semibold" />
                    <InputOTPSlot index={2} className="h-11 w-11 text-base font-semibold" />
                  </InputOTPGroup>
                  <InputOTPSeparator />
                  <InputOTPGroup>
                    <InputOTPSlot index={3} className="h-11 w-11 text-base font-semibold" />
                    <InputOTPSlot index={4} className="h-11 w-11 text-base font-semibold" />
                    <InputOTPSlot index={5} className="h-11 w-11 text-base font-semibold" />
                  </InputOTPGroup>
                </InputOTP>
              </div>
            </div>
            <Button className="w-full" variant="destructive" onClick={handleDisable2fa} disabled={disabling || disableOtp.length !== 6 || !disablePassword}>
              {disabling ? <><Loader2 className="h-4 w-4 animate-spin" /> Disabling...</> : "Disable 2FA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Account;

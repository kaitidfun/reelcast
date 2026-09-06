"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import { User, Mail, Shield, Calendar, LogOut, Save, ShieldCheck, ShieldOff, Copy, Check, Loader2, Lock, Eye, EyeOff, CheckCircle2, KeyRound, Camera } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { MAX_DISPLAY_NAME_LENGTH, validateDisplayName, validateProfileImage } from "@/lib/test-plan";
import { SocialConnections } from "@/components/SocialConnections";

const API_URL = "http://localhost:8000";

const Account = () => {
  const {
    user,
    updateAccountProfile: syncAccountProfile,
    logout,
    refreshUser,
  } = useAuth();
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Change Password State
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [changePasswordError, setChangePasswordError] = useState("");

  if (!user) return null;

  const initials = user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  const is2faEnabled = user.is2faEnabled ?? false;
  const hasPassword = user.hasPassword ?? true;
  const displayNameError = validateDisplayName(displayName);

  const getToken = () => localStorage.getItem("rf_token") || "";

  const updateAccountProfile = async () => {
    if (displayNameError) {
      toast.error(displayNameError);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ display_name: displayName }),
      });
      if (res.ok) {
        syncAccountProfile({ displayName });
        await refreshUser();
        toast.success("Profile saved successfully");
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to save profile" }));
        toast.error(err.detail);
      }
    } catch {
      toast.error("Failed to connect to server");
    }
  };
  const handleLogout = () => { logout(); router.replace("/login"); };

  const updateAccountProfileImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validationError = validateProfileImage(file);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`${API_URL}/api/upload/profile-image`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: formData,
      });

      if (res.ok) {
        // Refresh user from /me to update profileImage in context (with new cache-busting)
        await refreshUser();
        toast.success("Profile image updated!");
      } else {
        const err = await res.json().catch(() => ({ detail: "Upload failed" }));
        toast.error(err.detail);
      }
    } catch {
      toast.error("Failed to upload image");
    } finally {
      setUploadingAvatar(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

  const manage2FA = async (code = otpCode) => {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      const res = await fetch(`${API_URL}/api/2fa/verify-setup`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
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
    if (disableOtp.length !== 6 || (hasPassword && !disablePassword)) return;
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

  // ===== Change Password Flow =====
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, label: "", color: "" };
    let score = 0;
    if (pass.length >= 6) score++;
    if (pass.length >= 8) score++;
    if (/[A-Z]/.test(pass)) score++;
    if (/[0-9]/.test(pass)) score++;
    if (/[^A-Za-z0-9]/.test(pass)) score++;
    if (score <= 1) return { score: 1, label: "Weak", color: "bg-red-500" };
    if (score <= 2) return { score: 2, label: "Fair", color: "bg-orange-500" };
    if (score <= 3) return { score: 3, label: "Good", color: "bg-yellow-500" };
    if (score <= 4) return { score: 4, label: "Strong", color: "bg-green-400" };
    return { score: 5, label: "Excellent", color: "bg-emerald-500" };
  };
  const pwStrength = getPasswordStrength(newPassword);

  const openChangePassword = () => {
    setShowChangePasswordDialog(true);
    setCurrentPassword(""); setNewPassword(""); setConfirmNewPassword("");
    setChangePasswordError("");
    setShowCurrentPw(false); setShowNewPw(false); setShowConfirmPw(false);
  };

  const handleChangePassword = async () => {
    setChangePasswordError("");
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setChangePasswordError("Please fill in all fields"); return;
    }
    if (newPassword.length < 6) {
      setChangePasswordError("New password must be at least 6 characters"); return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangePasswordError("New passwords do not match"); return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch(`${API_URL}/api/change-password`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (res.ok) {
        toast.success("Password changed successfully!");
        setShowChangePasswordDialog(false);
      } else {
        const err = await res.json().catch(() => ({ detail: "Failed to change password" }));
        setChangePasswordError(err.detail);
        toast.error(err.detail);
      }
    } catch {
      setChangePasswordError("Failed to connect to server");
      toast.error("Failed to connect to server");
    }
    setChangingPassword(false);
  };

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
              {/* Clickable Avatar with Upload */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                onChange={updateAccountProfileImage}
                id="avatar-upload"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="group relative cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-full"
                aria-label="Change profile picture"
              >
                <Avatar className="h-16 w-16 ring-2 ring-primary/30 transition-all group-hover:ring-primary/60">
                  {user.profileImage ? (
                    <AvatarImage src={user.profileImage} alt={user.displayName} className="object-cover" />
                  ) : null}
                  <AvatarFallback className="gradient-primary text-primary-foreground text-lg font-bold">{initials}</AvatarFallback>
                </Avatar>
                {/* Hover overlay */}
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/0 transition-all duration-200 group-hover:bg-black/50">
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 animate-spin text-white" />
                  ) : (
                    <div className="flex flex-col items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <Camera className="h-4 w-4 text-white" />
                      <span className="text-[9px] font-medium text-white mt-0.5">Update</span>
                    </div>
                  )}
                </div>
              </button>
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
            <div className="space-y-2"><Label htmlFor="name">Display Name</Label><Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={MAX_DISPLAY_NAME_LENGTH} aria-invalid={Boolean(displayNameError)} aria-describedby="display-name-help" /><p id="display-name-help" className="text-xs text-muted-foreground">{displayName.trim().length}/{MAX_DISPLAY_NAME_LENGTH} characters</p>{displayNameError && <p className="text-xs text-destructive">{displayNameError}</p>}</div>
            <div className="space-y-2"><Label htmlFor="acc-email">Email</Label><div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input id="acc-email" value={email} disabled className="pl-10" /></div></div>
            <Button onClick={updateAccountProfile} disabled={Boolean(displayNameError)} className="gradient-primary text-primary-foreground shadow-glow"><Save className="h-4 w-4" /> Save</Button>
          </CardContent>
        </Card>
      </motion.div>

      {/* Security - 2FA Section */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
        <Card className="border-border bg-card">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Shield className="h-4 w-4 text-primary" /> Security</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div><p className="text-sm font-medium text-foreground">Password</p><p className="text-xs text-muted-foreground">Change your account password</p></div>
              <Button variant="outline" size="sm" onClick={openChangePassword}><KeyRound className="h-3.5 w-3.5" /> Change Password</Button>
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

      {/* Connected social accounts */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 }}>
        <SocialConnections />
      </motion.div>

      {/* Logout */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
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
                <InputOTP maxLength={6} value={otpCode} onChange={(val) => { setOtpCode(val); if (val.length === 6) setTimeout(() => manage2FA(val), 100); }} disabled={verifying}>
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
              <Button className="w-full gradient-primary text-primary-foreground shadow-glow" onClick={() => manage2FA()} disabled={verifying || otpCode.length !== 6}>
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
            <DialogDescription>{hasPassword
              ? "For security, enter your password and a current authenticator code."
              : "Enter a current authenticator code to disable two-factor authentication."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {hasPassword && <div className="space-y-2">
              <Label htmlFor="disable-password">Account Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input id="disable-password" type={showDisablePassword ? "text" : "password"} value={disablePassword} onChange={(e) => setDisablePassword(e.target.value)} className="pl-10 pr-10" placeholder="Enter your password" />
                <button type="button" onClick={() => setShowDisablePassword((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showDisablePassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>}
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
            <Button className="w-full" variant="destructive" onClick={handleDisable2fa} disabled={disabling || disableOtp.length !== 6 || (hasPassword && !disablePassword)}>
              {disabling ? <><Loader2 className="h-4 w-4 animate-spin" /> Disabling...</> : "Disable 2FA"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ===== CHANGE PASSWORD DIALOG ===== */}
      <Dialog open={showChangePasswordDialog} onOpenChange={setShowChangePasswordDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Change Password</DialogTitle>
            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type={showCurrentPw ? "text" : "password"} value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setChangePasswordError(""); }} className="pl-10 pr-10" placeholder="Enter current password" disabled={changingPassword} />
                <button type="button" onClick={() => setShowCurrentPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showCurrentPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type={showNewPw ? "text" : "password"} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setChangePasswordError(""); }} className="pl-10 pr-10" placeholder="Enter new password" disabled={changingPassword} />
                <button type="button" onClick={() => setShowNewPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showNewPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {newPassword && (
                <div className="space-y-1.5">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <div key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= pwStrength.score ? pwStrength.color : "bg-muted"}`} />
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">Strength: <span className="font-medium text-foreground">{pwStrength.label}</span></p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input type={showConfirmPw ? "text" : "password"} value={confirmNewPassword} onChange={(e) => { setConfirmNewPassword(e.target.value); setChangePasswordError(""); }} className="pl-10 pr-10" placeholder="Confirm new password" disabled={changingPassword} />
                <button type="button" onClick={() => setShowConfirmPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                  {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              {confirmNewPassword && newPassword && confirmNewPassword !== newPassword && (
                <p className="text-xs text-destructive">Passwords do not match</p>
              )}
              {confirmNewPassword && newPassword && confirmNewPassword === newPassword && (
                <p className="text-xs text-green-500 flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Passwords match</p>
              )}
            </div>
            {changePasswordError && <p className="text-sm text-destructive">{changePasswordError}</p>}
            <Button className="w-full gradient-primary text-primary-foreground shadow-glow" onClick={handleChangePassword} disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}>
              {changingPassword ? <><Loader2 className="h-4 w-4 animate-spin" /> Changing...</> : "Change Password"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Account;

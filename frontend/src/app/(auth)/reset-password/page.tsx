"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Lock,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

const API_URL = "http://localhost:8000";

const ResetPasswordContent = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [tokenValid, setTokenValid] = useState(true);

  // Password strength
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

  const strength = getPasswordStrength(newPassword);

  useEffect(() => {
    if (!token) {
      setTokenValid(false);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("Please fill in all fields");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });

      if (res.ok) {
        setSuccess(true);
        toast.success("Password reset successfully!");
      } else {
        const data = await res.json().catch(() => ({ detail: "Something went wrong" }));
        if (data.detail?.includes("expired")) {
          setTokenValid(false);
          setError("This reset link has expired. Please request a new one.");
        } else {
          setError(data.detail || "Failed to reset password");
        }
        toast.error(data.detail || "Failed to reset password");
      }
    } catch {
      setError("Failed to connect to server");
      toast.error("Failed to connect to server");
    }
    setLoading(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 sm:p-6">
      <div className="gradient-glow pointer-events-none fixed inset-0" />
      <div className="dot-pattern pointer-events-none fixed inset-0 opacity-40" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md"
      >
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl gradient-primary shadow-glow-lg">
            <Sparkles className="h-7 w-7 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="font-display text-2xl font-bold text-foreground tracking-tight">
              ReelCast
            </h1>
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mt-1">
              Password Reset
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border glass-strong p-7 shadow-elevated">
          <AnimatePresence mode="wait">
            {!tokenValid ? (
              /* ===== INVALID / EXPIRED TOKEN ===== */
              <motion.div
                key="invalid"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 mb-4">
                  <AlertTriangle className="h-7 w-7 text-destructive" />
                </div>
                <h2 className="font-display text-xl font-bold text-foreground mb-2">
                  Invalid or expired link
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  This password reset link is no longer valid. It may have expired or already been used.
                </p>
                <Button
                  asChild
                  className="w-full gradient-primary text-primary-foreground shadow-glow"
                >
                  <Link href="/forgot-password">Request a new link</Link>
                </Button>
              </motion.div>
            ) : success ? (
              /* ===== SUCCESS ===== */
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center text-center"
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-500/10 mb-4">
                  <CheckCircle2 className="h-7 w-7 text-green-500" />
                </div>
                <h2 className="font-display text-xl font-bold text-foreground mb-2">
                  Password reset successful!
                </h2>
                <p className="text-sm text-muted-foreground mb-6">
                  Your password has been updated. You can now sign in with your new password.
                </p>
                <Button
                  className="w-full gradient-primary text-primary-foreground shadow-glow"
                  onClick={() => router.push("/login")}
                >
                  <ShieldCheck className="h-4 w-4" />
                  Go to Sign In
                </Button>
              </motion.div>
            ) : (
              /* ===== RESET FORM ===== */
              <motion.div
                key="form"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <div className="mb-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/60">
                    <KeyRound className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-foreground leading-tight">
                      Set new password
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      Choose a strong, unique password
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">New password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                        className="pl-10 pr-10"
                        placeholder="••••••••"
                        autoFocus
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {/* Password strength meter */}
                    {newPassword && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        className="space-y-1.5"
                      >
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
                                i <= strength.score ? strength.color : "bg-muted"
                              }`}
                            />
                          ))}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Password strength: <span className="font-medium text-foreground">{strength.label}</span>
                        </p>
                      </motion.div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm new password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                        className="pl-10 pr-10"
                        placeholder="••••••••"
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((s) => !s)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {confirmPassword && newPassword && confirmPassword !== newPassword && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-destructive"
                      >
                        Passwords do not match
                      </motion.p>
                    )}
                    {confirmPassword && newPassword && confirmPassword === newPassword && (
                      <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-xs text-green-500 flex items-center gap-1"
                      >
                        <CheckCircle2 className="h-3 w-3" /> Passwords match
                      </motion.p>
                    )}
                  </div>

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <Button
                    type="submit"
                    className="w-full gradient-primary text-primary-foreground shadow-glow"
                    disabled={loading || !newPassword || !confirmPassword}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Resetting password...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" />
                        Reset password
                      </>
                    )}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-6 border-t border-border pt-4">
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground hover:text-foreground"
            >
              <Link href="/login">
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to Sign In
              </Link>
            </Button>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © 2026 ReelCast ·{" "}
          <a href="#" className="hover:text-foreground transition-colors">
            Privacy
          </a>{" "}
          ·{" "}
          <a href="#" className="hover:text-foreground transition-colors">
            Terms
          </a>{" "}
          ·{" "}
          <a href="#" className="hover:text-foreground transition-colors">
            Support
          </a>
        </p>
      </motion.div>
    </div>
  );
};

const ResetPassword = () => {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
};

export default ResetPassword;

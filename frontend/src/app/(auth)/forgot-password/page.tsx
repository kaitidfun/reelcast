"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  Mail,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { motion } from "framer-motion";
import { toast } from "sonner";

const API_URL = "http://localhost:8000";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const sendResetEmail = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_URL}/api/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setSubmitted(true);
        setCooldown(60);
        toast.success("Reset link sent! Check your email.");
      } else {
        const data = await res.json().catch(() => ({ detail: "Something went wrong" }));
        setError(data.detail || "Failed to send reset link");
        toast.error(data.detail || "Failed to send reset link");
      }
    } catch {
      setError("Failed to connect to server");
      toast.error("Failed to connect to server");
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError("Please enter your email address");
      return;
    }
    await sendResetEmail();
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    await sendResetEmail();
  };

  const handleTryDifferent = () => {
    setSubmitted(false);
    setEmail("");
    setCooldown(0);
    setError("");
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
              Account recovery
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border glass-strong p-7 shadow-elevated">
          {!submitted ? (
            <>
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background/60">
                  <KeyRound className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="font-display text-xl font-bold text-foreground leading-tight">
                    Forgot your password?
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    We'll email you a secure reset link.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Work email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => { setEmail(e.target.value); setError(""); }}
                      className="pl-10"
                      placeholder="you@company.com"
                      autoFocus
                      disabled={loading}
                    />
                  </div>
                </div>

                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}

                <Button
                  type="submit"
                  className="w-full gradient-primary text-primary-foreground shadow-glow"
                  disabled={loading || !email}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    "Send reset link"
                  )}
                </Button>
              </form>
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center text-center"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
                <CheckCircle2 className="h-7 w-7 text-primary" />
              </div>
              <h2 className="font-display text-xl font-bold text-foreground mb-2">
                Check your inbox
              </h2>
              <p className="text-sm text-muted-foreground">
                If{" "}
                <span className="text-foreground font-medium">{email}</span> is
                registered with ReelCast, a reset link is on its way. The link
                expires in 30 minutes.
              </p>

              <div className="mt-6 w-full space-y-2">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={cooldown > 0 || loading}
                  onClick={handleResend}
                >
                  {cooldown > 0
                    ? `Resend email in ${cooldown}s`
                    : loading
                    ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Resending...
                      </>
                    )
                    : "Resend email"}
                </Button>
                <button
                  type="button"
                  onClick={handleTryDifferent}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Try a different email
                </button>
              </div>
            </motion.div>
          )}

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

export default ForgotPassword;

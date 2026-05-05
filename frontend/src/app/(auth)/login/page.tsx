"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Mail,
  Lock,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  ArrowLeft,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from "@/components/ui/input-otp";
import authHero from "@/assets/auth-hero-login.jpg";

const Login = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, verify2faLogin } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  // 2FA state
  const [show2fa, setShow2fa] = useState(false);
  const [tempToken, setTempToken] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [verifying2fa, setVerifying2fa] = useState(false);

  const searchParams = useSearchParams();
  const tokenFromUrl = searchParams.get("token");
  const verifyEmailSent = searchParams.get("verify_email_sent");

  useEffect(() => {
    if (verifyEmailSent === "1") {
      toast({
        title: "Verification email sent",
        description: "Please check your inbox and click the verification link.",
      });
    }
  }, [verifyEmailSent, toast]);
  useEffect(() => {
    if (tokenFromUrl) {
      setLoading(true);
      toast({
        title: "Completing social login...",
        description: "Authenticating and fetching your profile.",
      });
      // Store token and redirect
      localStorage.setItem("rf_token", tokenFromUrl);
      // Wait a moment for context to pick it up or just redirect
      setTimeout(() => {
        window.location.href = "/";
      }, 500);
    }
  }, [tokenFromUrl, toast]);

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    setLoading(true);
    toast({
      title: `Redirecting to ${provider === "google" ? "Google" : "Facebook"}...`,
      description: "Please wait while we redirect you to the authorization page.",
    });
    // Redirect to backend OAuth endpoint
    window.location.href = `http://localhost:8000/auth/${provider}/login`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    const result = await login(email, password);
    setLoading(false);

    if (result.ok) {
      if (result.requires2fa && result.tempToken) {
        // Show 2FA challenge screen
        setTempToken(result.tempToken);
        setShow2fa(true);
        setOtpCode("");
      } else {
        // Direct login success
        router.replace("/");
      }
    } else {
      setError("Login failed. Check your email and password.");
    }
  };

  const handle2faVerify = async () => {
    if (otpCode.length !== 6) {
      setError("Please enter a 6-digit code");
      return;
    }
    setError("");
    setVerifying2fa(true);
    const ok = await verify2faLogin(tempToken, otpCode);
    setVerifying2fa(false);
    if (ok) {
      router.replace("/");
    } else {
      setError("Invalid authentication code. Please try again.");
      setOtpCode("");
    }
  };

  // Auto-submit when 6 digits are entered
  useEffect(() => {
    if (show2fa && otpCode.length === 6) {
      handle2faVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [otpCode]);

  const handleBack = () => {
    setShow2fa(false);
    setTempToken("");
    setOtpCode("");
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
        className="relative z-10 w-full max-w-5xl"
      >
        <div className="grid overflow-hidden rounded-3xl border border-border glass-strong shadow-elevated lg:grid-cols-2">
          {/* VISUAL PANEL (left on desktop) */}
          <div className="relative hidden overflow-hidden border-r border-border bg-gradient-to-br from-card via-card to-muted/40 lg:order-1 lg:flex">
            <div className="absolute inset-0 gradient-glow opacity-80 pointer-events-none" />
            <img
              src={authHero.src}
              alt="ReelCast AI commerce reel preview"
              width={896}
              height={1216}
              className="absolute inset-0 h-full w-full object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent pointer-events-none" />

            {/* Floating LIVE pill */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="absolute left-6 top-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1 backdrop-blur-md"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
                Live
              </span>
            </motion.div>

            {/* Bottom tagline + wordmark */}
            <div className="relative z-10 mt-auto flex w-full items-end justify-between gap-4 p-8">
              <div>
                <p className="font-display text-2xl font-bold leading-tight text-foreground">
                  Reels that
                  <br />
                  sell themselves.
                </p>
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-widest">
                  ReelCast
                </span>
              </div>
            </div>
          </div>

          {/* FORM PANEL (right on desktop) */}
          <div className="relative p-6 sm:p-10 lg:order-2">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold text-foreground tracking-tight leading-none">
                  ReelCast
                </h1>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-1">
                  AI Commercial Studio
                </p>
              </div>
            </div>

            <AnimatePresence mode="wait">
              {!show2fa ? (
                <motion.div
                  key="login-form"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <h2 className="font-display text-2xl font-bold text-foreground mb-1">
                    Welcome back
                  </h2>
                  <p className="text-sm text-muted-foreground mb-6">
                    Sign in to continue creating reels that convert.
                  </p>

                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="pl-10"
                          placeholder="youremail@example.com"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pl-10 pr-10"
                          placeholder="password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((s) => !s)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                        <Checkbox
                          checked={remember}
                          onCheckedChange={(v) => setRemember(!!v)}
                        />
                        Remember me
                      </label>
                      <Link href="/forgot-password"
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        Forgot password?
                      </Link>
                    </div>

                    {error && <p className="text-sm text-destructive">{error}</p>}

                    <Button
                      type="submit"
                      className="w-full gradient-primary text-primary-foreground shadow-glow"
                      disabled={loading}
                    >
                      {loading ? "Signing in..." : "Sign in"}
                      {!loading && <ArrowRight className="h-4 w-4" />}
                    </Button>
                  </form>

                  <div className="relative my-5">
                    <div className="absolute inset-0 flex items-center">
                      <span className="w-full border-t border-border" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-card px-2 text-xs uppercase tracking-wider text-muted-foreground">
                        Or continue with
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSocialLogin("google")}
                      disabled={loading}
                      className="w-full"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#EA4335"
                          d="M12 10.2v3.9h5.5c-.2 1.4-1.6 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.4 14.6 2.5 12 2.5 6.8 2.5 2.6 6.7 2.6 12s4.2 9.5 9.4 9.5c5.4 0 9-3.8 9-9.2 0-.6-.1-1.1-.2-1.6H12z"
                        />
                      </svg>
                      Google
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleSocialLogin("facebook")}
                      disabled={loading}
                      className="w-full"
                    >
                      <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#1877F2"
                          d="M22 12a10 10 0 1 0-11.6 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.4v7A10 10 0 0 0 22 12z"
                        />
                      </svg>
                      Facebook
                    </Button>
                  </div>

                  <p className="mt-6 text-center text-sm text-muted-foreground">
                    New to ReelCast?{" "}
                    <Link href="/register"
                      className="text-primary hover:underline font-medium"
                    >
                      Create an account
                    </Link>
                  </p>
                </motion.div>
              ) : (
                /* ==================== 2FA CHALLENGE SCREEN ==================== */
                <motion.div
                  key="2fa-challenge"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.3 }}
                  className="flex flex-col items-center text-center"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-5">
                    <ShieldCheck className="h-8 w-8 text-primary" />
                  </div>

                  <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                    Two-Factor Authentication
                  </h2>
                  <p className="text-sm text-muted-foreground mb-8 max-w-xs">
                    Enter the 6-digit code from your authenticator app to complete sign in.
                  </p>

                  <div className="flex justify-center mb-6">
                    <InputOTP
                      maxLength={6}
                      value={otpCode}
                      onChange={setOtpCode}
                      disabled={verifying2fa}
                    >
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

                  {error && <p className="text-sm text-destructive mb-4">{error}</p>}

                  <Button
                    onClick={handle2faVerify}
                    className="w-full gradient-primary text-primary-foreground shadow-glow mb-4"
                    disabled={verifying2fa || otpCode.length !== 6}
                  >
                    {verifying2fa ? "Verifying..." : "Verify & Sign In"}
                    {!verifying2fa && <ShieldCheck className="h-4 w-4" />}
                  </Button>

                  <button
                    type="button"
                    onClick={handleBack}
                    className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to sign in
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
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

import { Suspense } from "react";

export default function LoginPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Login />
    </Suspense>
  );
}

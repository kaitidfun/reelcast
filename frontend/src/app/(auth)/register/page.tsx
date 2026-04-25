"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams, useParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Mail,
  Lock,
  User,
  ArrowRight,
  Store,
  TrendingUp,
  Briefcase,
  Eye,
  EyeOff,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import authHero from "@/assets/auth-hero-register.jpg";

const roles = [
  { id: "merchant", label: "Online Merchant", icon: Store, desc: "I sell on marketplaces" },
  { id: "affiliate", label: "Affiliate", icon: TrendingUp, desc: "I promote products" },
  { id: "brand", label: "Brand Owner", icon: Briefcase, desc: "I own a brand" },
];

function getStrength(pw: string) {
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const strengthLabels = ["Too weak", "Weak", "Fair", "Strong", "Excellent"];
const strengthColors = [
  "bg-destructive",
  "bg-destructive",
  "bg-yellow-500",
  "bg-primary",
  "bg-primary",
];

const Register = () => {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState("merchant");
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const { toast } = useToast();
  const router = useRouter();

  const strength = useMemo(() => getStrength(password), [password]);

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    setLoading(true);
    toast({
      title: `Connecting to ${provider === "google" ? "Google" : "Facebook"}...`,
      description: "Demo mode — creating an account with a mock profile.",
    });
    const ok = await login(`${provider}.user@reelcast.ai`, "oauth");
    setLoading(false);
    if (ok) router.replace("/");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!displayName || !email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    if (!acceptTerms) {
      setError("Please accept the Terms and Privacy Policy");
      return;
    }
    setLoading(true);
    const ok = await register(email, password, displayName);
    setLoading(false);
    if (ok) {
      router.replace("/");
    } else {
      setError("Registration failed. Email might already exist.");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background p-3 sm:p-4">
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
              alt="ReelCast creator community"
              width={896}
              height={1216}
              className="absolute inset-0 h-full w-full object-cover opacity-90"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-background/10 to-transparent pointer-events-none" />

            {/* Floating creator chip */}
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.5 }}
              className="absolute left-6 top-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5 backdrop-blur-md"
            >
              <Users className="h-3 w-3 text-primary" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground">
                +12k creators
              </span>
            </motion.div>

            {/* Bottom tagline + wordmark */}
            <div className="relative z-10 mt-auto flex w-full items-end justify-between gap-4 p-8">
              <div>
                <p className="font-display text-2xl font-bold leading-tight text-foreground">
                  Built for the
                  <br />
                  next-gen brand.
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
          <div className="p-5 sm:p-7 lg:order-2">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow">
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-base font-bold text-foreground tracking-tight leading-none">
                  ReelCast
                </h1>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-1">
                  Create your account
                </p>
              </div>
            </div>

            <h2 className="font-display text-xl font-bold text-foreground mb-1">
              Start creating in minutes
            </h2>
            <p className="text-xs text-muted-foreground mb-4">
              Free to try. No credit card required.
            </p>

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="name" className="text-xs">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10 h-9"
                    placeholder="Jane Doe"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Work email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10 h-9"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10 h-9"
                    placeholder="At least 6 characters"
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
                {password.length > 0 && (
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1 flex-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i < strength ? strengthColors[strength] : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {strengthLabels[strength]}
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10 h-9"
                    placeholder="Re-type your password"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={acceptTerms}
                  onCheckedChange={(v) => setAcceptTerms(!!v)}
                  className="mt-0.5"
                />
                <span className="leading-snug">
                  I agree to ReelCast's{" "}
                  <a href="#" className="text-primary hover:underline font-medium">
                    Terms
                  </a>{" "}
                  and{" "}
                  <a href="#" className="text-primary hover:underline font-medium">
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground shadow-glow h-9"
                disabled={loading}
              >
                {loading ? "Creating account..." : "Create account"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Sign in
              </Link>
            </p>
          </div>

        </div>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          © 2026 ReelCast ·{" "}
          <a href="#" className="hover:text-foreground transition-colors">Privacy</a>{" "}
          ·{" "}
          <a href="#" className="hover:text-foreground transition-colors">Terms</a>{" "}
          ·{" "}
          <a href="#" className="hover:text-foreground transition-colors">Support</a>
        </p>
      </motion.div>
    </div>
  );
};

export default Register;






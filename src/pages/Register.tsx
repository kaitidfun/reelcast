import { useState, useMemo } from "react";
import { useNavigate, Link } from "react-router-dom";
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
  ShieldCheck,
  Globe,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const roles = [
  { id: "merchant", label: "Online Merchant", icon: Store, desc: "I sell on marketplaces" },
  { id: "affiliate", label: "Affiliate", icon: TrendingUp, desc: "I promote products" },
  { id: "brand", label: "Brand Owner", icon: Briefcase, desc: "I own a brand" },
];

const benefits = [
  { icon: Sparkles, text: "Unlimited AI-generated commercial reels" },
  { icon: Globe, text: "One-click distribution to 7+ platforms" },
  { icon: ShieldCheck, text: "Brand-safe, on-message every time" },
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
  const { login } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const strength = useMemo(() => getStrength(password), [password]);

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    setLoading(true);
    toast({
      title: `Connecting to ${provider === "google" ? "Google" : "Facebook"}...`,
      description: "Demo mode — creating an account with a mock profile.",
    });
    const ok = await login(`${provider}.user@reelcast.ai`, "oauth");
    setLoading(false);
    if (ok) navigate("/", { replace: true });
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
    const ok = await login(email, password);
    setLoading(false);
    if (ok) {
      navigate("/", { replace: true });
    } else {
      setError("Registration failed");
    }
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
          {/* FORM PANEL */}
          <div className="p-6 sm:p-10">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-display text-lg font-bold text-foreground tracking-tight leading-none">
                  ReelCast
                </h1>
                <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mt-1">
                  Create your account
                </p>
              </div>
            </div>

            <h2 className="font-display text-2xl font-bold text-foreground mb-1">
              Start creating in minutes
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Free to try. No credit card required.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Role */}
              <div className="space-y-2">
                <Label>I am a…</Label>
                <div className="grid grid-cols-3 gap-2">
                  {roles.map((r) => {
                    const Icon = r.icon;
                    const active = selectedRole === r.id;
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => setSelectedRole(r.id)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          active
                            ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <Icon
                          className={`h-4 w-4 mb-2 ${
                            active ? "text-primary" : "text-muted-foreground"
                          }`}
                        />
                        <p className="text-xs font-semibold text-foreground leading-tight">
                          {r.label}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                          {r.desc}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="pl-10"
                    placeholder="Jane Doe"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Work email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    placeholder="you@company.com"
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
                  <div className="space-y-1.5">
                    <div className="flex gap-1">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1 flex-1 rounded-full transition-colors ${
                            i < strength
                              ? strengthColors[strength]
                              : "bg-muted"
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Password strength:{" "}
                      <span className="text-foreground font-medium">
                        {strengthLabels[strength]}
                      </span>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="pl-10"
                    placeholder="Re-type your password"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                <Checkbox
                  checked={acceptTerms}
                  onCheckedChange={(v) => setAcceptTerms(!!v)}
                  className="mt-0.5"
                />
                <span className="leading-snug">
                  I agree to ReelCast's{" "}
                  <a
                    href="#"
                    className="text-primary hover:underline font-medium"
                  >
                    Terms of Service
                  </a>{" "}
                  and{" "}
                  <a
                    href="#"
                    className="text-primary hover:underline font-medium"
                  >
                    Privacy Policy
                  </a>
                  .
                </span>
              </label>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button
                type="submit"
                className="w-full gradient-primary text-primary-foreground shadow-glow"
                disabled={loading}
              >
                {loading ? "Creating account..." : "Create account"}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>

            <div className="relative my-5">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-card px-2 text-xs uppercase tracking-wider text-muted-foreground">
                  Or sign up with
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleSocialLogin("google")}
                disabled={loading}
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
              Already have an account?{" "}
              <Link
                to="/login"
                className="text-primary hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>

          {/* BRAND PANEL */}
          <div className="relative hidden flex-col justify-between gap-8 border-l border-border bg-gradient-to-br from-card via-card to-muted/40 p-10 lg:flex">
            <div className="absolute inset-0 gradient-glow opacity-60 pointer-events-none" />

            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background/40 px-3 py-1 backdrop-blur">
                <Users className="h-3 w-3 text-primary" />
                <span className="text-xs font-medium text-foreground">
                  Join 10,000+ creators &amp; brands
                </span>
              </div>
              <h3 className="mt-5 font-display text-3xl font-bold leading-tight text-foreground">
                The fastest way to turn products into revenue-driving reels.
              </h3>
              <p className="mt-3 text-sm text-muted-foreground">
                Stop renting agencies. Spin up an in-house AI commercial studio
                that ships content while you sleep.
              </p>
            </div>

            <div className="relative space-y-3">
              {benefits.map((b) => {
                const Icon = b.icon;
                return (
                  <div key={b.text} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                    </div>
                    <p className="text-sm text-foreground">{b.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="relative flex flex-wrap gap-2">
              {["SOC 2 Type II", "GDPR ready", "99.9% uptime"].map((chip) => (
                <span
                  key={chip}
                  className="rounded-full border border-border bg-background/50 px-3 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur"
                >
                  {chip}
                </span>
              ))}
            </div>
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

export default Register;

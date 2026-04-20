import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  Store,
  TrendingUp,
  Briefcase,
  Eye,
  EyeOff,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAuth } from "@/contexts/AuthContext";
import AuthLayout from "@/components/auth/AuthLayout";

const roles = [
  {
    id: "merchant",
    label: "Online Merchant",
    icon: Store,
    desc: "Sell products on e-commerce",
  },
  {
    id: "affiliate",
    label: "Affiliate Marketer",
    icon: TrendingUp,
    desc: "Promote & earn commissions",
  },
  {
    id: "brand",
    label: "Brand Owner",
    icon: Briefcase,
    desc: "Build awareness at scale",
  },
];

const passwordChecks = (pw: string) => ({
  length: pw.length >= 8,
  number: /\d/.test(pw),
  letter: /[a-zA-Z]/.test(pw),
});

const Register = () => {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState("merchant");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const checks = passwordChecks(password);
  const allChecksPass = checks.length && checks.number && checks.letter;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!displayName || !email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (!allChecksPass) {
      setError("Password does not meet requirements");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!agreed) {
      setError("Please accept the Terms of Service");
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
    <AuthLayout
      headline="Start creating in minutes."
      subheadline="Join thousands of merchants, affiliates and brands automating their short-form video commerce with ReelCast."
    >
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
          Create your account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Already a member?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Sign in instead
          </Link>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Role Selection */}
        <div className="space-y-2">
          <Label>I'm joining as a…</Label>
          <div className="grid grid-cols-3 gap-2">
            {roles.map((r) => {
              const Icon = r.icon;
              const active = selectedRole === r.id;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedRole(r.id)}
                  className={`group rounded-xl border p-3 text-left transition-all ${
                    active
                      ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30 shadow-glow"
                      : "border-border bg-secondary/30 hover:border-primary/30 hover:bg-secondary/50"
                  }`}
                >
                  <Icon
                    className={`mb-2 h-4 w-4 ${
                      active ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  <p className="text-xs font-semibold text-foreground leading-tight">
                    {r.label}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight">
                    {r.desc}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Full name</Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="h-11 pl-10"
                placeholder="Jane Doe"
                autoComplete="name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Work email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 pl-10"
                placeholder="you@company.com"
                autoComplete="email"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 pl-10 pr-10"
              placeholder="Create a strong password"
              autoComplete="new-password"
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

          {/* Password requirements */}
          {password.length > 0 && (
            <ul className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
              {[
                { ok: checks.length, label: "8+ characters" },
                { ok: checks.letter, label: "1 letter" },
                { ok: checks.number, label: "1 number" },
              ].map((c) => (
                <li
                  key={c.label}
                  className={`flex items-center gap-1.5 ${
                    c.ok ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  <Check
                    className={`h-3 w-3 ${
                      c.ok ? "opacity-100" : "opacity-40"
                    }`}
                  />
                  {c.label}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="confirm"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-11 pl-10"
              placeholder="Re-enter your password"
              autoComplete="new-password"
            />
          </div>
        </div>

        <div className="flex items-start gap-2">
          <Checkbox
            id="terms"
            checked={agreed}
            onCheckedChange={(v) => setAgreed(!!v)}
            className="mt-0.5"
          />
          <Label
            htmlFor="terms"
            className="text-xs font-normal leading-relaxed text-muted-foreground cursor-pointer"
          >
            I agree to the{" "}
            <a href="#" className="text-primary hover:underline">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="text-primary hover:underline">
              Privacy Policy
            </a>
            .
          </Label>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className="h-11 w-full gradient-primary text-primary-foreground shadow-glow"
          disabled={loading}
        >
          {loading ? "Creating account..." : "Create account"}
          {!loading && <ArrowRight className="h-4 w-4" />}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Register;

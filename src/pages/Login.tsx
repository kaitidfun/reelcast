import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Sparkles, ArrowRight, Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const Login = () => {
  const [email, setEmail] = useState("creator@reelcast.ai");
  const [password, setPassword] = useState("demo123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSocialLogin = async (provider: "google" | "facebook") => {
    setLoading(true);
    toast({
      title: `Connecting to ${provider === "google" ? "Google" : "Facebook"}...`,
      description: "Demo mode — signing you in with a mock account.",
    });
    const ok = await login(`${provider}.user@reelcast.ai`, "oauth");
    setLoading(false);
    if (ok) navigate("/", { replace: true });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email || !password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) {
      navigate("/", { replace: true });
    } else {
      setError("Login failed");
    }
  };

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      {/* LEFT — Visual showcase */}
      <div className="relative hidden lg:flex w-[55%] items-center justify-center overflow-hidden p-12">
        {/* Ambient glows using brand colors */}
        <div className="pointer-events-none absolute -left-1/4 top-1/4 h-[800px] w-[800px] rounded-full bg-primary/20 blur-[140px] mix-blend-screen" />
        <div className="pointer-events-none absolute -right-1/4 bottom-1/4 h-[600px] w-[600px] rounded-full bg-accent/20 blur-[120px] mix-blend-screen" />
        <div className="pointer-events-none absolute inset-0 dot-pattern opacity-30" />

        {/* Phone mockup */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative z-10 flex aspect-[9/16] w-full max-w-[440px] flex-col rounded-[2.5rem] border border-border/60 bg-card/40 p-3 shadow-elevated backdrop-blur-2xl"
          style={{ boxShadow: "0 0 100px hsl(15 90% 58% / 0.15), 0 8px 32px hsl(0 0% 0% / 0.5)" }}
        >
          <div className="relative h-full w-full overflow-hidden rounded-[1.75rem] bg-secondary">
            <img
              src="https://picsum.photos/800/1420?random=12"
              loading="lazy"
              className="absolute inset-0 h-full w-full scale-105 object-cover"
              alt="ReelCast commercial preview"
            />

            {/* Editor overlay */}
            <div className="absolute inset-0 flex flex-col justify-between bg-gradient-to-b from-black/60 via-transparent to-black/85 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 backdrop-blur-md">
                  <div className="h-2 w-2 animate-pulse rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]" />
                  <span className="text-xs font-bold uppercase tracking-widest text-white/90">
                    Live Render
                  </span>
                </div>
                <div className="rounded-md bg-black/40 px-2 py-1 font-mono text-[10px] text-white/70 backdrop-blur-md">
                  00:14:23:09
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-display text-xl font-bold tracking-tight text-white drop-shadow-md">
                    Sneaker Drop // Hype Cut V2
                  </h3>
                  <p className="text-sm font-medium text-white/70">AI Generated • 4K • 60FPS</p>
                </div>

                {/* Scrub bar */}
                <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="absolute left-0 top-0 h-full w-[65%] gradient-primary"
                    style={{ boxShadow: "0 0 12px hsl(var(--accent) / 0.8)" }}
                  />
                </div>

                <div className="flex gap-2">
                  <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
                    SFX Layer
                  </div>
                  <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold text-white backdrop-blur-md">
                    Color Grade
                  </div>
                </div>
              </div>
            </div>

            {/* Center play badge */}
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md">
                <Play className="h-6 w-6 fill-white text-white" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Big brand statement */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="pointer-events-none absolute bottom-16 left-16 z-20"
        >
          <h2 className="font-display text-7xl font-bold uppercase leading-[0.9] tracking-tighter">
            <span className="block text-foreground">Speed.</span>
            <span className="block text-foreground/70">Scale.</span>
            <span className="block text-gradient">Viral.</span>
          </h2>
          <p className="mt-6 max-w-xs text-sm font-medium text-muted-foreground">
            AI-generated commercials, ready for every platform — in minutes, not days.
          </p>
        </motion.div>
      </div>

      {/* RIGHT — Form */}
      <div className="relative z-10 flex w-full flex-col justify-center border-l border-border bg-background px-6 sm:px-16 lg:w-[45%] lg:px-20 xl:px-28">
        {/* Mobile ambient glow */}
        <div className="pointer-events-none absolute left-0 top-0 h-80 w-full bg-primary/15 blur-[100px] lg:hidden" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 mx-auto w-full max-w-md"
        >
          {/* Brand */}
          <div className="mb-10">
            <div className="mb-8 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-primary shadow-glow">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <span className="font-display text-xl font-bold tracking-tight text-foreground">
                  ReelCast
                </span>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  AI Commercial Studio
                </p>
              </div>
            </div>
            <h1 className="font-display text-4xl font-bold tracking-tight text-foreground">
              Back on set.
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Sign in to resume your campaigns and pipelines.
            </p>
          </div>

          {/* OAuth */}
          <div className="mb-6 grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleSocialLogin("google")}
              disabled={loading}
              className="h-12 rounded-xl border-border bg-card text-sm font-semibold hover:bg-secondary"
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
              className="h-12 rounded-xl border-border bg-card text-sm font-semibold hover:bg-secondary"
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

          {/* Divider */}
          <div className="relative my-6 flex items-center">
            <div className="flex-grow border-t border-border" />
            <span className="shrink-0 px-4 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
              Or with email
            </span>
            <div className="flex-grow border-t border-border" />
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label
                htmlFor="email"
                className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
              >
                Studio Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 rounded-xl border-border bg-card px-4 text-base placeholder:text-muted-foreground/40"
                placeholder="director@agency.com"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="password"
                  className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
                >
                  Access Key
                </Label>
                <Link
                  to="/forgot-password"
                  className="text-xs font-semibold text-primary transition-colors hover:text-accent"
                >
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-12 rounded-xl border-border bg-card px-4 text-base tracking-widest placeholder:text-muted-foreground/40"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm font-medium text-destructive">{error}</p>}

            <Button
              type="submit"
              disabled={loading}
              className="group h-12 w-full rounded-xl gradient-primary text-base font-semibold text-primary-foreground shadow-glow-lg transition-all hover:opacity-95"
            >
              {loading ? "Signing in..." : "Sign in to Studio"}
              {!loading && (
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              )}
            </Button>
          </form>

          {/* Footer */}
          <div className="mt-8 space-y-2 text-center">
            <p className="text-sm text-muted-foreground">
              New to ReelCast?{" "}
              <Link
                to="/register"
                className="font-semibold text-foreground underline decoration-border underline-offset-4 transition-colors hover:text-primary hover:decoration-primary"
              >
                Create an account
              </Link>
            </p>
            <p className="text-xs text-muted-foreground/60">
              Demo mode — any email works. Use the prefilled credentials to sign in instantly.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;

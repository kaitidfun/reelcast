import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthLayout from "@/components/auth/AuthLayout";

const ForgotPassword = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setSubmitted(true);
  };

  return (
    <AuthLayout>
      {!submitted ? (
        <>
          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold text-foreground tracking-tight">
              Reset your password
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Enter your email and we'll send you a secure reset link.
            </p>
          </div>

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
                  placeholder="email@example.com"
                />
              </div>
            </div>

            <Button
              type="submit"
              className="w-full gradient-primary text-primary-foreground shadow-glow"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </Button>
          </form>
        </>
      ) : (
        <div className="flex flex-col items-center text-center py-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-4">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <h2 className="font-display text-2xl font-bold text-foreground tracking-tight mb-1.5">
            Check your inbox
          </h2>
          <p className="text-sm text-muted-foreground">
            If <span className="text-foreground font-medium">{email}</span> is registered,
            you'll receive a password reset link shortly.
          </p>
        </div>
      )}

      <Link
        to="/login"
        className="mt-6 inline-flex items-center justify-center gap-1 w-full text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-3 w-3" />
        Back to Sign In
      </Link>
    </AuthLayout>
  );
};

export default ForgotPassword;

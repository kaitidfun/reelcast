import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2, Send } from "lucide-react";
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
    <AuthLayout
      headline="We've got you covered."
      subheadline="Reset your password securely and get back to creating Reels in minutes."
    >
      {!submitted ? (
        <>
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
              Forgot password?
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              No worries — enter the email associated with your account and we'll
              send you a secure reset link.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  required
                />
              </div>
            </div>

            <Button
              type="submit"
              className="h-11 w-full gradient-primary text-primary-foreground shadow-glow"
              disabled={loading}
            >
              {loading ? (
                "Sending reset link..."
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send reset link
                </>
              )}
            </Button>
          </form>
        </>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 ring-4 ring-success/5">
            <CheckCircle2 className="h-7 w-7 text-success" />
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
            Check your inbox
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            If{" "}
            <span className="font-medium text-foreground">{email}</span>{" "}
            matches an account, you'll receive a password reset link within a few
            minutes.
          </p>
          <div className="mt-6 rounded-xl border border-border bg-secondary/40 p-4 text-left">
            <p className="text-xs font-semibold text-foreground">
              Didn't get the email?
            </p>
            <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
              <li>• Check your spam or promotions folder</li>
              <li>• Make sure the email address is correct</li>
              <li>
                •{" "}
                <button
                  onClick={() => setSubmitted(false)}
                  className="text-primary hover:underline"
                >
                  Try a different email
                </button>
              </li>
            </ul>
          </div>
        </div>
      )}

      <Link
        to="/login"
        className="mt-6 inline-flex w-full items-center justify-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to sign in
      </Link>
    </AuthLayout>
  );
};

export default ForgotPassword;

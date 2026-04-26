"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("Verifying your email address...");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Verification token is missing.");
      return;
    }

    const verifyEmail = async () => {
      try {
        const response = await fetch("http://localhost:8000/api/verify-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ token }),
        });

        const data = await response.json();

        if (response.ok) {
          setStatus("success");
          setMessage(data.message || "Email successfully verified!");
        } else {
          setStatus("error");
          setMessage(data.detail || "Verification failed. The link might be expired or invalid.");
        }
      } catch {
        setStatus("error");
        setMessage("An error occurred while connecting to the server.");
      }
    };

    verifyEmail();
  }, [token]);

  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold">Email Verification</CardTitle>
        <CardDescription>
          Secure your ReelCast account
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center justify-center space-y-6 pb-8 pt-4">
        {status === "loading" && (
          <>
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <p className="text-muted-foreground text-center">{message}</p>
          </>
        )}

        {status === "success" && (
          <>
            <CheckCircle2 className="h-16 w-16 text-green-500" />
            <p className="text-center font-medium text-green-600">{message}</p>
            <Button asChild className="w-full mt-4">
              <Link href="/login">Continue to Login</Link>
            </Button>
          </>
        )}

        {status === "error" && (
          <>
            <XCircle className="h-16 w-16 text-destructive" />
            <p className="text-center font-medium text-destructive">{message}</p>
            <div className="flex w-full gap-4 mt-4">
              <Button variant="outline" asChild className="w-full">
                <Link href="/register">Back to Register</Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/login">Go to Login</Link>
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center p-4">
      <Suspense fallback={<div className="flex flex-col items-center justify-center"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="mt-4">Loading verification...</p></div>}>
        <VerifyEmailContent />
      </Suspense>
    </div>
  );
}
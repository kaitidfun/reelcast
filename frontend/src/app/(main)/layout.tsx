"use client";

import { useAuth } from "@/contexts/AuthContext";
import AppSidebar, { MobileHeader } from "@/components/AppSidebar";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading || !isAuthenticated) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>; // Prevent render flash while redirecting
  }

  return (
    <div className="flex min-h-screen bg-sidebar">
      <AppSidebar />
      <div className="flex flex-1 p-0 md:p-2 md:pl-0 md:ml-20">
        <main className="relative flex-1 h-screen md:h-[calc(100vh-16px)] overflow-y-auto bg-background md:bg-card md:rounded-[24px] md:border md:border-border/50 md:shadow-2xl">
          <MobileHeader />
          <div className="gradient-glow pointer-events-none absolute inset-0" />
          <div className="relative z-10 p-4 sm:p-6 md:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}




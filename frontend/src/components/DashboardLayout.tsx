"use client";

import { useAuth } from "@/contexts/AuthContext";
import { GenerationQueueProvider } from "@/contexts/GenerationQueueContext";
import AppSidebar, { MobileHeader } from "@/components/AppSidebar";
import GenerationStatusBar from "@/components/GenerationStatusBar";
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
    // GenerationQueueProvider wraps entire dashboard so generation state persists
    // across page navigation — enables background polling and status bar on all pages
    <GenerationQueueProvider>
      <div className="flex min-h-screen min-w-0 bg-sidebar">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 p-0 md:ml-20 md:p-2 md:pl-0">
          <main className="relative h-screen min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background md:h-[calc(100vh-16px)] md:rounded-[24px] md:border md:border-border/50 md:bg-card md:shadow-2xl">
            <MobileHeader />
            {/* Background generation status bar — visible on all pages except /create */}
            <GenerationStatusBar />
            <div className="gradient-glow pointer-events-none absolute inset-0" />
            <div className="relative z-10 min-w-0 p-4 sm:p-6 md:p-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </GenerationQueueProvider>
  );
}




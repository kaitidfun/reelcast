import type { Metadata } from "next";
import DashboardLayout from "@/components/DashboardLayout";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = privateMetadata;

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

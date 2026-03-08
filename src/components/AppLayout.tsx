import { Outlet } from "react-router-dom";
import AppSidebar, { MobileHeader } from "./AppSidebar";

const AppLayout = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 md:ml-64">
        <MobileHeader />
        <div className="gradient-glow pointer-events-none fixed inset-0 md:ml-64" />
        <div className="relative z-10 p-4 sm:p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;

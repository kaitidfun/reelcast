import { Outlet } from "react-router-dom";
import AppSidebar, { MobileHeader } from "./AppSidebar";

const AppLayout = () => {
  return (
    <div className="flex min-h-screen bg-sidebar">
      <AppSidebar />
      <div className="flex flex-1 p-0 md:p-2 md:pl-0 md:ml-20">
        <main className="relative flex-1 h-screen md:h-[calc(100vh-16px)] overflow-y-auto bg-background md:bg-card md:rounded-[24px] md:border md:border-border/50 md:shadow-2xl">
          <MobileHeader />
          <div className="gradient-glow pointer-events-none absolute inset-0" />
          <div className="relative z-10 p-4 sm:p-6 md:p-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default AppLayout;

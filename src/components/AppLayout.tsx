import { Outlet } from "react-router-dom";
import AppSidebar from "./AppSidebar";

const AppLayout = () => {
  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="ml-64 flex-1">
        <div className="gradient-glow pointer-events-none fixed inset-0 ml-64" />
        <div className="relative z-10 p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default AppLayout;

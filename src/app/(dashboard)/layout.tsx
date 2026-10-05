"use client";

import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";
import { ProjectProvider } from "@/components/project-context";
import { AuthProvider, useAuth } from "@/components/auth-context";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen, LogOut, ShieldCheck } from "lucide-react";

function HeaderNav() {
  const { isSidebarHidden, toggleSidebar } = useSidebar();
  const { currentUser, isSuperAdmin, logoutUser } = useAuth();

  const displayName = currentUser?.name || currentUser?.username || "Admin";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "AD";

  return (
    <header className="h-14 bg-white dark:bg-card border-b border-border px-4 md:px-6 flex items-center justify-between shadow-xs z-50 relative">
      <div className="flex items-center gap-3">
        <MobileNav />
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleSidebar}
          className="hidden md:flex text-muted-foreground hover:text-foreground hover:bg-accent/60"
          title={isSidebarHidden ? "Show Sidebar" : "Hide Sidebar"}
        >
          {isSidebarHidden ? <PanelLeftOpen className="w-5 h-5 text-primary" /> : <PanelLeftClose className="w-5 h-5" />}
        </Button>
        {/* Quick switcher in header when sidebar is hidden or on wider screens */}
        <div className="hidden sm:flex items-center">
          <ProjectSwitcher variant="header" />
        </div>
      </div>
      <div className="flex-1" /> {/* Spacer */}
      <div className="flex items-center gap-3 sm:gap-4 text-sm font-medium">
        <ThemeToggle />
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-muted-foreground">
            Welcome, <strong className="text-foreground">{displayName}</strong>
          </span>
          {isSuperAdmin && (
            <span className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              <ShieldCheck className="w-3 h-3" />
              Admin
            </span>
          )}
        </div>
        <div 
          className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-xs" 
          title={displayName}
        >
          {initials}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={logoutUser}
          className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 h-8 px-2.5 gap-1.5"
          title="Sign out"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline text-xs">Logout</span>
        </Button>
      </div>
    </header>
  );
}

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <AuthProvider>
      <ProjectProvider>
        <SidebarProvider>
          <Sidebar />
          <main className="flex-1 flex flex-col min-h-screen min-w-0 w-full">
            <HeaderNav />
            {/* Main Content Area */}
            <div className="p-6 flex-1 flex flex-col min-h-0 min-w-0">
              {children}
            </div>
          </main>
        </SidebarProvider>
      </ProjectProvider>
    </AuthProvider>
  );
}

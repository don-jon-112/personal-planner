"use client";

import { Sidebar } from "@/components/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { SidebarProvider, useSidebar } from "@/components/sidebar-context";
import { ProjectProvider } from "@/components/project-context";
import { ProjectSwitcher } from "@/components/project-switcher";
import { Button } from "@/components/ui/button";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";

function HeaderNav() {
  const { isSidebarHidden, toggleSidebar } = useSidebar();

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
      <div className="flex items-center gap-4 text-sm font-medium">
        <ThemeToggle />
        <span className="text-muted-foreground hidden sm:inline">Welcome, <strong className="text-foreground">Admin</strong></span>
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white flex-shrink-0">
          AD
        </div>
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
  );
}

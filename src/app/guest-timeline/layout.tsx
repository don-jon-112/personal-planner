"use client";

import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function GuestLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main className="flex-1 flex flex-col min-h-screen min-w-0 w-full">
      {/* Header (Top Nav) */}
      <header className="h-14 bg-white dark:bg-card border-b border-border px-4 md:px-6 flex items-center justify-between shadow-sm z-50 relative">
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg text-primary tracking-tight">Personal Planner (Guest)</span>
        </div>
        <div className="flex items-center gap-4 text-sm font-medium">
          <ThemeToggle />
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-muted-foreground hover:text-foreground"
            onClick={() => {
              document.cookie = "site_password=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
              window.location.replace("/login");
            }}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Logout
          </Button>
        </div>
      </header>
      {/* Main Content Area */}
      <div className="p-6 flex-1 flex flex-col min-h-0 min-w-0">
        {children}
      </div>
    </main>
  );
}

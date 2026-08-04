"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, LayoutDashboard, CalendarDays, CheckSquare, FileText, CheckCircle, Bug, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Weekly Report", href: "/weekly-report", icon: CalendarDays },
  { name: "Todo Plan", href: "/todo", icon: CheckSquare },
  { name: "Notes", href: "/notes", icon: FileText },
  { name: "Go Live Check", href: "/golive", icon: CheckCircle },
  { name: "Bug & Report", href: "/bugs", icon: Bug },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="md:hidden flex items-center">
      <button 
        onClick={() => setOpen(true)}
        className="p-2 -ml-2 mr-2 text-foreground/70 hover:text-foreground focus:outline-none"
      >
        <Menu className="w-6 h-6" />
      </button>

      {/* Mobile Drawer */}
      {open && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div 
            className="fixed inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          
          {/* Sidebar */}
          <div className="relative w-64 max-w-[80%] bg-sidebar text-sidebar-foreground h-full shadow-2xl flex flex-col z-50 animate-in slide-in-from-left duration-300">
            <div className="p-4 flex items-center justify-between border-b border-sidebar-accent/50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-sidebar-foreground text-sidebar flex items-center justify-center font-bold">
                  <Bug className="w-5 h-5" />
                </div>
                <h1 className="text-xl font-bold tracking-wide">Planner</h1>
              </div>
              <button 
                onClick={() => setOpen(false)}
                className="p-2 text-sidebar-foreground/70 hover:text-white focus:outline-none"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="px-4 py-4 overflow-y-auto flex-1">
              <h3 className="text-xs uppercase font-bold text-sidebar-foreground/50 tracking-wider mb-2">Menu</h3>
              <nav className="space-y-1">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const isReallyActive = item.href === "/" ? pathname === "/" : isActive;

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-3 rounded transition-all duration-200 group relative",
                        isReallyActive
                          ? "bg-sidebar-accent text-white"
                          : "text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/50"
                      )}
                    >
                      {isReallyActive && (
                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l" />
                      )}
                      <item.icon className="w-5 h-5 opacity-80" />
                      <span className="text-base font-medium">{item.name}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>
            
            <div className="mt-auto p-4 border-t border-sidebar-accent/50">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/50 transition-all duration-200"
              >
                <Settings className="w-5 h-5 opacity-80" />
                <span className="text-base font-medium">Settings</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

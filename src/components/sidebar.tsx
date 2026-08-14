"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  CalendarDays, 
  CheckSquare, 
  FileText, 
  CheckCircle, 
  Bug, 
  Settings,
  CalendarClock
} from "lucide-react";
import { cn } from "@/lib/utils";

const menuItems = [
  { name: "Dashboard", href: "/", icon: LayoutDashboard },
  { name: "Weekly Report", href: "/weekly-report", icon: CalendarDays },
  { name: "Todo Plan", href: "/todo", icon: CheckSquare },
  { name: "Notes", href: "/notes", icon: FileText },
  { name: "Timeline", href: "/timeline", icon: CalendarClock },
  { name: "Go Live Check", href: "/golive", icon: CheckCircle },
  { name: "Bug & Report", href: "/bugs", icon: Bug },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-64 bg-sidebar text-sidebar-foreground flex-col h-screen sticky top-0 shadow-xl z-20">
      {/* Site Title */}
      <div className="p-4 flex items-center gap-3 border-b border-sidebar-accent/50">
        <div className="w-8 h-8 rounded-full bg-sidebar-foreground text-sidebar flex items-center justify-center font-bold">
          <Bug className="w-5 h-5" />
        </div>
        <h1 className="text-xl font-bold tracking-wide">Planner Web</h1>
      </div>
      
      {/* Profile Quick Info */}
      <div className="p-4 flex items-center gap-4 border-b border-sidebar-accent/50">
        <div className="w-12 h-12 rounded-full border-2 border-sidebar-accent/50 p-0.5 overflow-hidden flex items-center justify-center bg-primary">
          <span className="text-white font-bold">JO</span>
        </div>
        <div>
          <p className="text-xs text-sidebar-foreground/70">Welcome,</p>
          <h2 className="text-sm font-semibold">Jonathan</h2>
        </div>
      </div>

      <div className="px-4 py-4">
        <h3 className="text-xs uppercase font-bold text-sidebar-foreground/50 tracking-wider mb-2">General</h3>
        <nav className="space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const isReallyActive = item.href === "/" ? pathname === "/" : isActive;

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded transition-all duration-200 group relative",
                  isReallyActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/50"
                )}
              >
                {/* Active Indicator Bar (Gentelella style) */}
                {isReallyActive && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l" />
                )}
                <item.icon className="w-4 h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                <span className="text-sm font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="mt-auto p-4 border-t border-sidebar-accent/50">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/50 transition-all duration-200"
        >
          <Settings className="w-4 h-4 opacity-80" />
          <span className="text-sm font-medium">Settings</span>
        </Link>
      </div>
    </aside>
  );
}

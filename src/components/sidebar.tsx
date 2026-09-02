"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  Bug, 
  Settings,
  Cloud,
  CloudOff,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

import { menuItems, MenuItem, SubMenuItem } from "@/config/menu";
import { useDocument } from "@/hooks/use-firestore";
import { useEffect, useState } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const { data: menuSettings } = useDocument<any>("appSettings", "menu");
  
  const [isOnline, setIsOnline] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "Project Plan": true,
  });

  useEffect(() => {
    const checkMode = () => {
      setIsOnline(localStorage.getItem('syncMode') === 'online');
    };
    checkMode();
    window.addEventListener('storage', checkMode);
    window.addEventListener('syncModeChanged', checkMode);
    return () => {
      window.removeEventListener('storage', checkMode);
      window.removeEventListener('syncModeChanged', checkMode);
    };
  }, []);

  // Auto-expand group if a child item is active
  useEffect(() => {
    menuItems.forEach((item) => {
      if (item.children) {
        const hasActiveChild = item.children.some(
          (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
        );
        if (hasActiveChild) {
          setOpenGroups((prev) => ({ ...prev, [item.name]: true }));
        }
      }
    });
  }, [pathname]);

  const toggleGroup = (name: string) => {
    setOpenGroups((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const hiddenMenus = menuSettings?.hiddenMenus || [];

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
          <span className="text-white font-bold">AD</span>
        </div>
        <div>
          <p className="text-xs text-sidebar-foreground/70 flex items-center gap-1">
            Welcome,
            {isOnline ? (
              <span title="Online Mode"><Cloud className="w-3 h-3 text-green-500" /></span>
            ) : (
              <span title="Offline Mode"><CloudOff className="w-3 h-3 text-muted-foreground" /></span>
            )}
          </p>
          <h2 className="text-sm font-semibold">Admin</h2>
        </div>
      </div>

      <div className="px-4 py-4 overflow-y-auto flex-1">
        <h3 className="text-xs uppercase font-bold text-sidebar-foreground/50 tracking-wider mb-2">General</h3>
        <nav className="space-y-1">
          {menuItems.map((item) => {
            // Case 1: Group with Submenu
            if (item.children) {
              const visibleChildren = item.children.filter((c) => !hiddenMenus.includes(c.href));
              if (visibleChildren.length === 0) return null;

              const isGroupActive = visibleChildren.some(
                (c) => pathname === c.href || pathname.startsWith(`${c.href}/`)
              );
              const isOpen = openGroups[item.name] ?? isGroupActive;

              return (
                <div key={item.name} className="space-y-1">
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.name)}
                    className={cn(
                      "w-full flex items-center justify-between px-3 py-2.5 rounded transition-all duration-200 group text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/50",
                      isGroupActive && "text-white font-semibold"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-4 h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-sidebar-foreground/50 group-hover:text-white transition-colors" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-sidebar-foreground/50 group-hover:text-white transition-colors" />
                    )}
                  </button>

                  {/* Submenu items */}
                  {isOpen && (
                    <div className="pl-4 space-y-1 border-l border-sidebar-accent/40 ml-4 my-1">
                      {visibleChildren.map((subItem) => {
                        const isSubActive =
                          pathname === subItem.href || pathname.startsWith(`${subItem.href}/`);
                        const SubIcon = subItem.icon;

                        return (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            className={cn(
                              "flex items-center gap-2.5 px-3 py-2 rounded text-xs transition-all duration-200 group relative",
                              isSubActive
                                ? "bg-sidebar-accent text-white font-semibold"
                                : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/40"
                            )}
                          >
                            {isSubActive && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l" />
                            )}
                            {SubIcon && <SubIcon className="w-3.5 h-3.5 opacity-80 group-hover:opacity-100" />}
                            <span>{subItem.name}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // Case 2: Standard Single Menu Item
            if (hiddenMenus.includes(item.href || "")) return null;

            const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
            const isReallyActive = item.href === "/" ? pathname === "/" : isActive;

            return (
              <Link
                key={item.name}
                href={item.href || "/"}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded transition-all duration-200 group relative",
                  isReallyActive
                    ? "bg-sidebar-accent text-white"
                    : "text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/50"
                )}
              >
                {/* Active Indicator Bar */}
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

"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Bug, Settings, Cloud, CloudOff, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

import { menuItems } from "@/config/menu";
import { useDocument } from "@/hooks/use-firestore";

export function MobileNav() {
  const [open, setOpen] = useState(false);
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

  // Auto-expand group if child is active
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
                <div className="flex flex-col">
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-bold tracking-wide">Planner</h1>
                    {isOnline ? (
                      <span title="Online Mode"><Cloud className="w-4 h-4 text-green-500" /></span>
                    ) : (
                      <span title="Offline Mode"><CloudOff className="w-4 h-4 text-muted-foreground" /></span>
                    )}
                  </div>
                </div>
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
                            "w-full flex items-center justify-between px-3 py-3 rounded transition-all duration-200 group text-sidebar-foreground/80 hover:text-white hover:bg-sidebar-accent/50",
                            isGroupActive && "text-white font-semibold"
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className="w-5 h-5 opacity-80 group-hover:opacity-100 transition-opacity" />
                            <span className="text-base font-medium">{item.name}</span>
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
                                  onClick={() => setOpen(false)}
                                  className={cn(
                                    "flex items-center gap-2.5 px-3 py-2.5 rounded text-sm transition-all duration-200 group relative",
                                    isSubActive
                                      ? "bg-sidebar-accent text-white font-semibold"
                                      : "text-sidebar-foreground/70 hover:text-white hover:bg-sidebar-accent/40"
                                  )}
                                >
                                  {isSubActive && (
                                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-l" />
                                  )}
                                  {SubIcon && <SubIcon className="w-4 h-4 opacity-80 group-hover:opacity-100" />}
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

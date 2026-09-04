"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

interface SidebarContextType {
  isSidebarHidden: boolean;
  toggleSidebar: () => void;
  setSidebarHidden: (hidden: boolean) => void;
}

const SidebarContext = createContext<SidebarContextType>({
  isSidebarHidden: false,
  toggleSidebar: () => {},
  setSidebarHidden: () => {},
});

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isSidebarHidden, setIsSidebarHidden] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar_hidden");
    if (saved === "true") setIsSidebarHidden(true);
  }, []);

  const toggleSidebar = () => {
    setIsSidebarHidden((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar_hidden", String(next));
      return next;
    });
  };

  const setSidebarHidden = (hidden: boolean) => {
    setIsSidebarHidden(hidden);
    localStorage.setItem("sidebar_hidden", String(hidden));
  };

  return (
    <SidebarContext.Provider value={{ isSidebarHidden, toggleSidebar, setSidebarHidden }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarContext);
}

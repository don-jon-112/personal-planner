"use client";

import { useEffect, useState } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Settings as SettingsIcon, Eye, EyeOff } from "lucide-react";
import { useDocument, useSetDocument } from "@/hooks/use-firestore";
import { menuItems } from "@/config/menu";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const { data: menuSettings, isLoading } = useDocument<any>("appSettings", "menu");
  const { mutate: setMenuSettings } = useSetDocument("appSettings");
  
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);

  useEffect(() => {
    if (menuSettings?.hiddenMenus) {
      setHiddenMenus(menuSettings.hiddenMenus);
    }
  }, [menuSettings]);

  const toggleMenu = (href: string) => {
    const newHidden = hiddenMenus.includes(href)
      ? hiddenMenus.filter(h => h !== href)
      : [...hiddenMenus, href];
      
    setHiddenMenus(newHidden);
    setMenuSettings({ id: "menu", data: { hiddenMenus: newHidden } });
  };

  return (
    <Panel className="h-full border-t-4 border-t-primary flex flex-col">
      <PanelHeader className="flex flex-row items-start justify-between border-b-0 pb-2">
        <div>
          <PanelTitle className="text-2xl font-bold text-secondary-foreground flex items-center gap-2">
            <SettingsIcon className="w-6 h-6 text-primary" /> Settings
          </PanelTitle>
          <PanelDescription className="mt-1">Manage your application preferences and menu visibility.</PanelDescription>
        </div>
      </PanelHeader>

      <PanelContent className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-8">
          
          <section className="bg-card border rounded-xl p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Menu Visibility
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Choose which menus you want to display in the sidebar and mobile navigation.
              </p>
            </div>

            {isLoading ? (
              <p className="text-sm text-muted-foreground">Loading settings...</p>
            ) : (
              <div className="space-y-4">
                {menuItems.map((item) => {
                  const isHidden = hiddenMenus.includes(item.href);
                  // Cannot hide dashboard
                  const isDisabled = item.href === "/";
                  
                  return (
                    <div key={item.href} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded bg-background shadow-sm border">
                          <item.icon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.href}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <span className="text-xs font-medium flex items-center gap-1 min-w-[60px] justify-end">
                          {isHidden ? (
                            <><EyeOff className="w-3 h-3 text-muted-foreground" /> <span className="text-muted-foreground">Hidden</span></>
                          ) : (
                            <><Eye className="w-3 h-3 text-primary" /> <span className="text-primary">Visible</span></>
                          )}
                        </span>
                        <Switch 
                          checked={!isHidden} 
                          onCheckedChange={() => toggleMenu(item.href)}
                          disabled={isDisabled}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </PanelContent>
    </Panel>
  );
}

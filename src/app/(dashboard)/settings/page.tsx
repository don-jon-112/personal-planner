"use client";

import { useEffect, useState } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Settings as SettingsIcon, Eye, EyeOff } from "lucide-react";
import { useDocument, useSetDocument } from "@/hooks/use-firestore";
import { menuItems } from "@/config/menu";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CloudUpload, CloudDownload, Server, ServerOff } from "lucide-react";
import { enableNetwork, disableNetwork, waitForPendingWrites } from "firebase/firestore";
import { db } from "@/firebase/config";
import { useQueryClient } from "@tanstack/react-query";

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: menuSettings, isLoading } = useDocument<any>("appSettings", "menu");
  const { mutate: setMenuSettings } = useSetDocument("appSettings");
  
  const [hiddenMenus, setHiddenMenus] = useState<string[]>([]);
  const [isSyncingUp, setIsSyncingUp] = useState(false);
  const [isSyncingDown, setIsSyncingDown] = useState(false);
  const [isOnline, setIsOnline] = useState(false);

  useEffect(() => {
    if (menuSettings?.hiddenMenus) {
      setHiddenMenus(menuSettings.hiddenMenus);
    }
    const mode = localStorage.getItem('syncMode');
    setIsOnline(mode === 'online');
  }, [menuSettings]);

  const toggleNetworkMode = async () => {
    try {
      if (isOnline) {
        await disableNetwork(db);
        localStorage.setItem('syncMode', 'local');
        window.dispatchEvent(new Event('syncModeChanged'));
        setIsOnline(false);
      } else {
        await enableNetwork(db);
        localStorage.setItem('syncMode', 'online');
        window.dispatchEvent(new Event('syncModeChanged'));
        setIsOnline(true);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to change network mode.");
    }
  };

  const handleSyncToFirebase = async () => {
    try {
      setIsSyncingUp(true);
      await enableNetwork(db);
      await waitForPendingWrites(db);
      // Brief delay to ensure connections settle
      await new Promise(r => setTimeout(r, 1000));
      if (!isOnline) await disableNetwork(db);
      alert("Successfully synced local changes TO Firebase!");
    } catch (e) {
      console.error(e);
      alert("Error syncing to Firebase.");
    } finally {
      setIsSyncingUp(false);
    }
  };

  const handleSyncFromFirebase = async () => {
    try {
      setIsSyncingDown(true);
      await enableNetwork(db);
      // Wait for network to establish
      await new Promise(r => setTimeout(r, 1000));
      await queryClient.invalidateQueries();
      // Wait for React Query to fetch the new data
      await new Promise(r => setTimeout(r, 2000));
      if (!isOnline) await disableNetwork(db);
      alert("Successfully downloaded latest data FROM Firebase!");
    } catch (e) {
      console.error(e);
      alert("Error fetching from Firebase.");
    } finally {
      setIsSyncingDown(false);
    }
  };

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

          <section className="bg-card border rounded-xl p-6 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                Data Synchronization
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Your app is designed to work completely offline to save Firebase quota.
                Use the buttons below to manually sync your data with the cloud.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                <div>
                  <p className="font-medium text-sm">Upload Local Changes</p>
                  <p className="text-xs text-muted-foreground">Push all changes you made while offline to Firebase.</p>
                </div>
                <Button 
                  onClick={handleSyncToFirebase} 
                  disabled={isSyncingUp || isSyncingDown}
                  size="sm"
                >
                  <CloudUpload className="w-4 h-4 mr-2" />
                  {isSyncingUp ? "Uploading..." : "Sync TO Firebase"}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                <div>
                  <p className="font-medium text-sm">Download Cloud Data</p>
                  <p className="text-xs text-muted-foreground">Pull the latest data from Firebase to this device.</p>
                </div>
                <Button 
                  onClick={handleSyncFromFirebase} 
                  disabled={isSyncingUp || isSyncingDown}
                  variant="outline"
                  size="sm"
                >
                  <CloudDownload className="w-4 h-4 mr-2" />
                  {isSyncingDown ? "Downloading..." : "Sync FROM Firebase"}
                </Button>
              </div>

              <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/20">
                <div>
                  <p className="font-medium text-sm">Always Online Mode</p>
                  <p className="text-xs text-muted-foreground">If enabled, the app will always sync in the background (uses Firebase quota).</p>
                </div>
                <Button 
                  onClick={toggleNetworkMode}
                  variant={isOnline ? "default" : "secondary"}
                  size="sm"
                >
                  {isOnline ? <Server className="w-4 h-4 mr-2" /> : <ServerOff className="w-4 h-4 mr-2" />}
                  {isOnline ? "Online Mode" : "Offline Mode"}
                </Button>
              </div>
            </div>
          </section>

        </div>
      </PanelContent>
    </Panel>
  );
}

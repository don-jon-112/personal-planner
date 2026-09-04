"use client";

import { useEffect, useState } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Settings as SettingsIcon, Eye, EyeOff } from "lucide-react";
import { useDocument, useSetDocument } from "@/hooks/use-firestore";
import { menuItems } from "@/config/menu";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CloudUpload, CloudDownload, Server, ServerOff } from "lucide-react";
import { enableNetwork, disableNetwork, waitForPendingWrites, getDocs, collection, terminate, clearIndexedDbPersistence } from "firebase/firestore";
import { db } from "@/firebase/config";
import { useQueryClient } from "@tanstack/react-query";
import { useConfirm, useAlertModal } from "@/components/confirm-dialog-provider";

const ALL_COLLECTIONS = [
  "appSettings",
  "projects",
  "todos",
  "notes",
  "bugReports",
  "timelineHolidays",
  "timelineEpics",
  "timelineTasks",
  "timelinePics",
  "weeklyReports"
];

export default function SettingsPage() {
  const confirm = useConfirm();
  const alertModal = useAlertModal();
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

  useEffect(() => {
    const checkPendingSync = async () => {
      if (localStorage.getItem('pendingSyncDown') === 'true') {
        localStorage.removeItem('pendingSyncDown');
        setIsSyncingDown(true);
        try {
          await enableNetwork(db);
          const fetchPromises = ALL_COLLECTIONS.map(col => getDocs(collection(db, col)));
          await Promise.all(fetchPromises);
          await queryClient.invalidateQueries();
          if (localStorage.getItem('syncMode') !== 'online') {
            await disableNetwork(db);
          }
          await alertModal({
            title: "Download Berhasil",
            description: "Berhasil mengunduh data terbaru dari Firebase. Data lokal telah diperbarui!",
            variant: "success",
          });
        } catch (e) {
          console.error(e);
          await alertModal({
            title: "Gagal Mengunduh",
            description: "Terjadi kesalahan saat mengambil data dari Firebase.",
            variant: "error",
          });
        } finally {
          setIsSyncingDown(false);
        }
      }
    };
    checkPendingSync();
  }, [queryClient, alertModal]);

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
      await alertModal({
        title: "Gagal Mengubah Mode",
        description: "Gagal mengubah mode jaringan.",
        variant: "error",
      });
    }
  };

  const handleSyncToFirebase = async () => {
    const ok = await confirm({
      title: "Push Data ke Cloud Firebase?",
      description: "Apakah Anda yakin ingin mengirim semua perubahan lokal ke Firebase? Data konflik di server akan ditimpa dengan data lokal.",
      confirmText: "Push ke Firebase",
      cancelText: "Batal",
      variant: "warning",
      icon: "warning",
    });

    if (!ok) return;

    try {
      setIsSyncingUp(true);
      await enableNetwork(db);
      await waitForPendingWrites(db);
      // Brief delay to ensure connections settle
      await new Promise(r => setTimeout(r, 1000));
      if (!isOnline) await disableNetwork(db);
      await alertModal({
        title: "Sinkronisasi Berhasil",
        description: "Perubahan lokal berhasil disinkronkan ke Firebase!",
        variant: "success",
      });
    } catch (e) {
      console.error(e);
      await alertModal({
        title: "Gagal Sinkronisasi",
        description: "Terjadi kesalahan saat sinkronisasi ke Firebase.",
        variant: "error",
      });
    } finally {
      setIsSyncingUp(false);
    }
  };

  const handleSyncFromFirebase = async () => {
    const ok = await confirm({
      title: "Overwrite Data dari Cloud?",
      description: "Apakah Anda yakin ingin menimpa seluruh data lokal dengan data dari Cloud? Database lokal Anda akan dibersihkan dan perubahan lokal yang belum disinkronkan akan hilang.",
      confirmText: "Timpa Data Lokal",
      cancelText: "Batal",
      variant: "destructive",
      icon: "warning",
    });

    if (!ok) return;

    try {
      setIsSyncingDown(true);
      
      // Terminate and clear local database
      await terminate(db);
      await clearIndexedDbPersistence(db);
      
      // Set flag and reload to re-initialize safely
      localStorage.setItem('pendingSyncDown', 'true');
      window.location.reload();
    } catch (e) {
      console.error(e);
      await alertModal({
        title: "Gagal Membersihkan Database",
        description: "Terjadi kesalahan saat membersihkan database lokal.",
        variant: "error",
      });
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
      <PanelHeader className="flex flex-col sm:flex-row items-start justify-between border-b-0 pb-2 gap-4">
        <div className="w-full sm:w-auto">
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
                  if (item.children) {
                    return (
                      <div key={item.name} className="space-y-2">
                        <div className="flex items-center gap-2 px-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          <item.icon className="w-3.5 h-3.5" />
                          <span>{item.name}</span>
                        </div>
                        <div className="space-y-2 pl-3 border-l-2 border-primary/30">
                          {item.children.map((subItem) => {
                            const isHidden = hiddenMenus.includes(subItem.href);
                            const SubIcon = subItem.icon || item.icon;

                            return (
                              <div key={subItem.href} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
                                <div className="flex items-center gap-3">
                                  <div className="p-2 rounded bg-background shadow-sm border">
                                    <SubIcon className="w-4 h-4 text-primary" />
                                  </div>
                                  <div>
                                    <p className="font-medium text-sm">{subItem.name}</p>
                                    <p className="text-xs text-muted-foreground">{subItem.href}</p>
                                  </div>
                                </div>
                                
                                <div className="flex items-center gap-4">
                                  <span className="text-xs font-medium flex items-center gap-1 sm:min-w-[60px] justify-end">
                                    {isHidden ? (
                                      <><EyeOff className="w-4 h-4 sm:w-3 sm:h-3 text-muted-foreground" /> <span className="text-muted-foreground hidden sm:inline">Hidden</span></>
                                    ) : (
                                      <><Eye className="w-4 h-4 sm:w-3 sm:h-3 text-primary" /> <span className="text-primary hidden sm:inline">Visible</span></>
                                    )}
                                  </span>
                                  <Switch 
                                    checked={!isHidden} 
                                    onCheckedChange={() => toggleMenu(subItem.href)}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  }

                  const isHidden = hiddenMenus.includes(item.href || "");
                  // Cannot hide dashboard
                  const isDisabled = item.href === "/";
                  
                  return (
                    <div key={item.href || item.name} className="flex items-center justify-between p-3 rounded-lg border bg-muted/20 hover:bg-muted/40 transition-colors">
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
                        <span className="text-xs font-medium flex items-center gap-1 sm:min-w-[60px] justify-end">
                          {isHidden ? (
                            <><EyeOff className="w-4 h-4 sm:w-3 sm:h-3 text-muted-foreground" /> <span className="text-muted-foreground hidden sm:inline">Hidden</span></>
                          ) : (
                            <><Eye className="w-4 h-4 sm:w-3 sm:h-3 text-primary" /> <span className="text-primary hidden sm:inline">Visible</span></>
                          )}
                        </span>
                        <Switch 
                          checked={!isHidden} 
                          onCheckedChange={() => toggleMenu(item.href || "")}
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
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border bg-muted/20 gap-4">
                <div>
                  <p className="font-medium text-sm">Upload Local Changes</p>
                  <p className="text-xs text-muted-foreground">Push all changes you made while offline to Firebase.</p>
                </div>
                <Button 
                  onClick={handleSyncToFirebase} 
                  disabled={isSyncingUp || isSyncingDown}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <CloudUpload className="w-4 h-4 mr-2" />
                  {isSyncingUp ? "Uploading..." : "Sync TO Firebase"}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border bg-muted/20 gap-4">
                <div>
                  <p className="font-medium text-sm">Download Cloud Data</p>
                  <p className="text-xs text-muted-foreground">Pull the latest data from Firebase to this device.</p>
                </div>
                <Button 
                  onClick={handleSyncFromFirebase} 
                  disabled={isSyncingUp || isSyncingDown}
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  <CloudDownload className="w-4 h-4 mr-2" />
                  {isSyncingDown ? "Downloading..." : "Sync FROM Firebase"}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-lg border bg-muted/20 gap-4">
                <div>
                  <p className="font-medium text-sm">Always Online Mode</p>
                  <p className="text-xs text-muted-foreground">If enabled, the app will always sync in the background (uses Firebase quota).</p>
                </div>
                <Button 
                  onClick={toggleNetworkMode}
                  variant={isOnline ? "default" : "secondary"}
                  size="sm"
                  className="w-full sm:w-auto"
                >
                  {isOnline ? <Server className="w-4 h-4 mr-2" /> : <ServerOff className="w-4 h-4 mr-2" />}
                  {isOnline ? "Online Mode" : "Offline Mode"}
                </Button>
              </div>
            </div>
          </section>

          {/* Application Credit Section */}
          <section className="bg-card border rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center font-extrabold text-base shrink-0">
                JA
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Application Credit</p>
                <p className="text-base font-bold text-foreground mt-0.5">
                  Created by <span className="text-primary">Jonathan Alva</span>
                </p>
                <a 
                  href="mailto:jonathan.alva97@yahoo.com" 
                  className="text-xs text-muted-foreground hover:text-primary transition-colors font-mono inline-block mt-0.5"
                >
                  jonathan.alva97@yahoo.com
                </a>
              </div>
            </div>
          </section>

        </div>
      </PanelContent>
    </Panel>
  );
}

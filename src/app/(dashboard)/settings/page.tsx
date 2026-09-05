"use client";

import { useEffect, useState, useRef } from "react";
import { Panel, PanelHeader, PanelTitle, PanelDescription, PanelContent } from "@/components/ui/panel";
import { Settings as SettingsIcon, Eye, EyeOff } from "lucide-react";
import { useDocument, useSetDocument } from "@/hooks/use-firestore";
import { menuItems } from "@/config/menu";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { CloudUpload, CloudDownload, Server, ServerOff, Database, FileDown, FileUp, Loader2 } from "lucide-react";
import { enableNetwork, disableNetwork, waitForPendingWrites, getDocs, collection, doc, writeBatch, terminate, clearIndexedDbPersistence } from "firebase/firestore";
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

// Helper to sanitize undefined values so Firestore never throws unsupported field errors
function cleanUndefined(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(cleanUndefined);
  if (obj.constructor && obj.constructor.name !== 'Object') return obj;
  
  const clean: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      clean[key] = cleanUndefined(val);
    }
  }
  return clean;
}

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
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
      title: "Push Data to Cloud Firebase?",
      description: "Are you sure you want to push all local changes to Firebase? Server conflicts will be overwritten with local data.",
      confirmText: "Push to Firebase",
      cancelText: "Cancel",
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
        title: "Sync Successful",
        description: "Local changes have been successfully synced to Firebase!",
        variant: "success",
      });
    } catch (e) {
      console.error(e);
      await alertModal({
        title: "Sync Failed",
        description: "An error occurred while syncing to Firebase.",
        variant: "error",
      });
    } finally {
      setIsSyncingUp(false);
    }
  };

  const handleSyncFromFirebase = async () => {
    const ok = await confirm({
      title: "Overwrite Data from Cloud?",
      description: "Are you sure you want to overwrite all local data with data from Cloud? Your local database will be cleared and unsynced local changes will be lost.",
      confirmText: "Overwrite Local Data",
      cancelText: "Cancel",
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

  const handleBackupToFile = async () => {
    try {
      setIsBackingUp(true);

      const backupCollections: Record<string, any[]> = {};
      let totalCount = 0;
      const stats: Record<string, number> = {};

      for (const col of ALL_COLLECTIONS) {
        const snap = await getDocs(collection(db, col));
        const items: any[] = [];
        snap.forEach((d) => {
          items.push({ id: d.id, ...d.data() });
        });
        backupCollections[col] = items;
        stats[col] = items.length;
        totalCount += items.length;
      }

      const backupPayload = {
        appName: "Personal Planner",
        version: "1.0",
        exportedAt: new Date().toISOString(),
        totalDocuments: totalCount,
        summary: stats,
        collections: backupCollections,
      };

      const jsonStr = JSON.stringify(backupPayload, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const dateStr = now.toISOString().split("T")[0];
      const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;

      const link = document.createElement("a");
      link.href = url;
      link.download = `personal-planner-backup-${dateStr}-${timeStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await alertModal({
        title: "Backup Berhasil!",
        description: `Berhasil mengekspor ${totalCount} dokumen ke file "${link.download}". Simpan file ini di tempat yang aman sebagai arsip cadangan Anda.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("Backup error:", err);
      await alertModal({
        title: "Gagal Backup",
        description: err?.message || "Terjadi kesalahan saat mengekspor database.",
        variant: "error",
      });
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch (jsonErr) {
        await alertModal({
          title: "File Tidak Valid",
          description: "File yang Anda pilih bukan format JSON yang valid.",
          variant: "error",
        });
        return;
      }

      // Check format: support parsed.collections, parsed.data, or direct object
      const collections = parsed.collections || parsed.data || parsed;
      if (!collections || typeof collections !== "object") {
        await alertModal({
          title: "Unrecognized Backup Format",
          description: "This JSON file does not have a valid backup structure.",
          variant: "error",
        });
        return;
      }

      // Count items per collection
      const stats: string[] = [];
      let totalDocs = 0;

      for (const col of ALL_COLLECTIONS) {
        const items = collections[col];
        if (Array.isArray(items) && items.length > 0) {
          stats.push(`${col}: ${items.length}`);
          totalDocs += items.length;
        }
      }

      if (totalDocs === 0) {
        await alertModal({
          title: "Empty File",
          description: "No valid documents found in this backup file.",
          variant: "warning",
        });
        return;
      }

      const ok = await confirm({
        title: "Restore Data to Firebase?",
        description: `Found a total of ${totalDocs} document(s) (${stats.join(", ")}) from file "${file.name}". All of this data will be uploaded and saved to Firebase Cloud. Are you sure you want to proceed?`,
        confirmText: "Yes, Restore to Firebase",
        cancelText: "Cancel",
        variant: "warning",
        icon: "warning",
      });

      if (!ok) return;

      setIsRestoring(true);

      // 1. Enable network to push to Firebase Cloud
      await enableNetwork(db);

      // 2. Commit in safe batches (<= 400 ops per commit)
      let batch = writeBatch(db);
      let opCount = 0;
      let committedDocs = 0;

      for (const col of ALL_COLLECTIONS) {
        const items = collections[col];
        if (!Array.isArray(items)) continue;

        for (const item of items) {
          if (!item || typeof item !== "object") continue;
          const { id, ...data } = item;
          const sanitized = cleanUndefined(data);
          const docRef = id ? doc(db, col, id) : doc(collection(db, col));
          batch.set(docRef, sanitized, { merge: true });
          opCount++;

          if (opCount >= 400) {
            await batch.commit();
            committedDocs += opCount;
            batch = writeBatch(db);
            opCount = 0;
          }
        }
      }

      if (opCount > 0) {
        await batch.commit();
        committedDocs += opCount;
      }

      await waitForPendingWrites(db);

      // 3. Invalidate queries so all pages update immediately
      await queryClient.invalidateQueries();

      // 4. If user was in offline mode, restore offline state
      if (localStorage.getItem("syncMode") !== "online") {
        await disableNetwork(db);
      }

      await alertModal({
        title: "Restore Successful!",
        description: `Successfully restored ${committedDocs} document(s) from file to Firebase Cloud! All your project, task, and timeline data have been updated.`,
        variant: "success",
      });
    } catch (err: any) {
      console.error("Restore error:", err);
      await alertModal({
        title: "Restore Failed",
        description: err?.message || "An error occurred while restoring data to Firebase.",
        variant: "error",
      });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
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

          {/* Local File Backup & Restore Section */}
          <section className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
            <div>
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Database className="w-5 h-5 text-primary" />
                Local Backup & Restore (.JSON)
              </h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Simpan salinan database lengkap ke file JSON di komputer Anda (offline backup), atau pulihkan data dari file backup ke Firebase kapan saja.
              </p>
            </div>

            <div className="space-y-4">
              {/* Backup to File */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors gap-4">
                <div className="space-y-1">
                  <p className="font-semibold text-sm flex items-center gap-2 text-foreground">
                    <FileDown className="w-4 h-4 text-primary" />
                    Backup Database ke File JSON
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Unduh file JSON yang memuat seluruh project, task, timeline, PIC, catatan, dan bug Anda.
                  </p>
                </div>
                <Button 
                  onClick={handleBackupToFile} 
                  disabled={isBackingUp || isRestoring}
                  size="sm"
                  className="w-full sm:w-auto shrink-0 gap-2"
                >
                  {isBackingUp ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Mengekspor...
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4" />
                      Backup ke File (.json)
                    </>
                  )}
                </Button>
              </div>

              {/* Restore from File */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-xl border bg-muted/20 hover:bg-muted/30 transition-colors gap-4">
                <div className="space-y-1">
                  <p className="font-semibold text-sm flex items-center gap-2 text-foreground">
                    <FileUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Restore dari File JSON ke Firebase
                  </p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Pilih file backup JSON dari komputer untuk mengunggah dan memulihkan seluruh data langsung ke Cloud Firebase.
                  </p>
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".json,application/json"
                    onChange={handleFileSelected}
                    className="hidden"
                  />
                  <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={isBackingUp || isRestoring}
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto shrink-0 gap-2 border-emerald-500/40 hover:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium"
                  >
                    {isRestoring ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Memulihkan...
                      </>
                    ) : (
                      <>
                        <FileUp className="w-4 h-4" />
                        Pilih File & Restore
                      </>
                    )}
                  </Button>
                </div>
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

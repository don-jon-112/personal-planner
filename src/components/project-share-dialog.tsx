"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Share2,
  Copy,
  Check,
  RotateCw,
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Lock,
  Loader2,
  CloudUpload,
} from "lucide-react";
import { Project, ProjectShareSettings } from "@/types/project";
import { useProject } from "./project-context";
import { useConfirm } from "./confirm-dialog-provider";
import { enableNetwork, disableNetwork, waitForPendingWrites } from "firebase/firestore";
import { db } from "@/firebase/config";

interface ProjectShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function generateRandomToken() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "shr_";
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function ProjectShareDialog({ open, onOpenChange }: ProjectShareDialogProps) {
  const { activeProject, updateProject } = useProject();
  const confirm = useConfirm();

  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [syncedSuccess, setSyncedSuccess] = useState(false);

  const shareSettings: ProjectShareSettings = activeProject?.shareSettings || {
    isEnabled: false,
    shareToken: "",
    expiresAt: null,
  };

  const isEnabled = shareSettings.isEnabled;
  const shareToken = shareSettings.shareToken;

  const syncToCloud = async () => {
    try {
      await enableNetwork(db);
      await waitForPendingWrites(db);
    } catch (e) {
      console.warn("Auto-sync to cloud error:", e);
    } finally {
      if (typeof window !== "undefined" && localStorage.getItem("syncMode") !== "online") {
        await disableNetwork(db).catch(() => {});
      }
    }
  };

  const handleManualSync = async () => {
    setIsSyncingCloud(true);
    try {
      await enableNetwork(db);
      await waitForPendingWrites(db);
      await new Promise((r) => setTimeout(r, 500));
      setSyncedSuccess(true);
      setTimeout(() => setSyncedSuccess(false), 3000);
    } catch (err) {
      console.error("Manual sync error:", err);
    } finally {
      if (typeof window !== "undefined" && localStorage.getItem("syncMode") !== "online") {
        await disableNetwork(db).catch(() => {});
      }
      setIsSyncingCloud(false);
    }
  };

  // Auto-generate token if not set yet
  useEffect(() => {
    if (open && activeProject && !activeProject.shareSettings?.shareToken) {
      const initialToken = generateRandomToken();
      updateProject(activeProject.id, {
        shareSettings: {
          isEnabled: true,
          shareToken: initialToken,
          expiresAt: null,
        },
      }).then(() => syncToCloud());
    }
  }, [open, activeProject, updateProject]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = shareToken ? `${origin}/guest-timeline?token=${shareToken}` : "";

  const handleToggleActive = async () => {
    if (!activeProject) return;
    setIsUpdating(true);
    try {
      await updateProject(activeProject.id, {
        shareSettings: {
          ...shareSettings,
          isEnabled: !isEnabled,
          shareToken: shareToken || generateRandomToken(),
        },
      });
      await syncToCloud();
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerateToken = async () => {
    if (!activeProject) return;
    const ok = await confirm({
      title: "Reset Public Link?",
      description:
        "Tautan lama akan langsung hangus dan tidak bisa diakses siapapun lagi. Apakah Anda yakin ingin membuat link baru?",
      confirmText: "Reset Link",
      cancelText: "Batal",
      variant: "destructive",
    });

    if (ok) {
      setIsUpdating(true);
      try {
        const newToken = generateRandomToken();
        await updateProject(activeProject.id, {
          shareSettings: {
            ...shareSettings,
            shareToken: newToken,
          },
        });
        await syncToCloud();
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] w-[calc(100vw-2rem)] max-w-full overflow-hidden">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Share2 className="w-5 h-5 text-primary" /> Share Link
          </DialogTitle>
          <DialogDescription className="break-words">
            Bagikan akses pantau jadwal & timeline untuk project{" "}
            <span className="font-semibold text-foreground">
              {activeProject?.name || "ini"}
            </span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0">
          {/* Status Banner */}
          <div
            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
              isEnabled
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-muted/40 border-border text-muted-foreground"
            }`}
          >
            <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
              {isEnabled ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
              ) : (
                <ShieldAlert className="w-5 h-5 opacity-70 shrink-0 mt-0.5 sm:mt-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold uppercase tracking-wider">
                  Status Link: {isEnabled ? "Aktif (Public)" : "Nonaktif (Dimatikan)"}
                </p>
                <p className="text-[11px] opacity-80 leading-relaxed break-words">
                  {isEnabled
                    ? "Siapa saja yang memiliki link dapat langsung melihat timeline tanpa password (View-Only)"
                    : "Akses dinonaktifkan. Tautan tidak dapat dibuka"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant={isEnabled ? "default" : "outline"}
              onClick={handleToggleActive}
              disabled={isUpdating}
              className="text-xs h-8 px-3 shrink-0 self-start sm:self-auto"
            >
              {isUpdating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : isEnabled ? (
                "Matikan Link"
              ) : (
                "Aktifkan Link"
              )}
            </Button>
          </div>

          {/* Public Link Box */}
          {isEnabled && (
            <div className="space-y-2 min-w-0">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Tautan Akses Timeline</span>
                <span className="text-[10px] text-primary flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Read-Only Secure
                </span>
              </Label>
              <div className="flex items-center gap-2 min-w-0">
                <div className="flex-1 min-w-0 bg-muted/40 border rounded-lg px-3 py-2 text-xs font-mono truncate select-all overflow-hidden text-ellipsis">
                  {shareUrl}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyLink}
                  className="h-9 gap-1.5 shrink-0 px-3"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Copied!
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span className="text-xs">Copy</span>
                    </>
                  )}
                </Button>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 font-medium truncate"
                >
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  Pratinjau Tampilan Link
                </a>

                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  disabled={isUpdating}
                  className="text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 text-[11px] cursor-pointer self-start sm:self-auto"
                >
                  <RotateCw className="w-3 h-3 shrink-0" />
                  Reset / Ganti Link Baru
                </button>
              </div>
            </div>
          )}

          {/* Cloud Sync Helper */}
          <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl flex items-center justify-between gap-3 text-xs">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <CloudUpload className="w-3.5 h-3.5 text-primary shrink-0" />
                Sinkronisasi Cloud
              </p>
              <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                Kirim data project & task terbaru ke server Cloud agar bisa dibuka oleh penerima link.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleManualSync}
              disabled={isSyncingCloud}
              className="h-8 px-2.5 text-xs shrink-0"
            >
              {isSyncingCloud ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  Syncing...
                </>
              ) : syncedSuccess ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 mr-1.5" />
                  Tersinkron!
                </>
              ) : (
                <>
                  <CloudUpload className="w-3.5 h-3.5 mr-1.5" />
                  Push ke Cloud
                </>
              )}
            </Button>
          </div>

          {/* Privacy Notice Card */}
          <div className="p-3 bg-muted/20 border border-border/80 rounded-xl space-y-1.5 text-xs text-muted-foreground min-w-0">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              🛡️ Privasi & Keamanan Data:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed break-words">
              <li>
                Penerima link <strong>langsung dapat melihat jadwal tanpa perlu login atau password</strong>, khusus untuk project ini saja (View-Only).
              </li>
              <li>
                Penerima link <strong>tidak bisa mengedit, menghapus, atau melihat</strong> project lainnya.
              </li>
              <li>
                Jika Anda klik <strong>Reset / Ganti Link Baru</strong>, link lama otomatis langsung mati seketika.
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Tutup
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
} from "lucide-react";
import { Project, ProjectShareSettings } from "@/types/project";
import { useProject } from "./project-context";
import { useConfirm } from "./confirm-dialog-provider";

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

  const shareSettings: ProjectShareSettings = activeProject?.shareSettings || {
    isEnabled: false,
    shareToken: "",
    expiresAt: null,
  };

  const isEnabled = shareSettings.isEnabled;
  const shareToken = shareSettings.shareToken;

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
      });
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
      } finally {
        setIsUpdating(false);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg font-bold">
            <Share2 className="w-5 h-5 text-primary" /> Share Project with Client
          </DialogTitle>
          <DialogDescription>
            Berikan akses pantau jadwal & timeline khusus untuk klien pada project{" "}
            <span className="font-semibold text-foreground">
              {activeProject?.name || "ini"}
            </span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Status Banner */}
          <div
            className={`p-3 rounded-xl border flex items-center justify-between transition-colors ${
              isEnabled
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                : "bg-muted/40 border-border text-muted-foreground"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {isEnabled ? (
                <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <ShieldAlert className="w-5 h-5 opacity-70" />
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">
                  Status Link: {isEnabled ? "Aktif (Public)" : "Nonaktif (Dimatikan)"}
                </p>
                <p className="text-[11px] opacity-80">
                  {isEnabled
                    ? "Klien yang memiliki link dapat melihat timeline (View-Only)"
                    : "Akses dinonaktifkan. Klien tidak dapat membuka timeline"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              size="sm"
              variant={isEnabled ? "default" : "outline"}
              onClick={handleToggleActive}
              disabled={isUpdating}
              className="text-xs h-8 px-3"
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
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                <span>Tautan Khusus Klien</span>
                <span className="text-[10px] text-primary flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Read-Only Secure
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted/40 border rounded-lg px-3 py-2 text-xs font-mono truncate select-all">
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

              <div className="flex items-center justify-between pt-1 text-xs">
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline flex items-center gap-1 font-medium"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Pratinjau Tampilan Klien
                </a>

                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  disabled={isUpdating}
                  className="text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 text-[11px] cursor-pointer"
                >
                  <RotateCw className="w-3 h-3" />
                  Reset / Ganti Link Baru
                </button>
              </div>
            </div>
          )}

          {/* Privacy Notice Card */}
          <div className="p-3 bg-muted/20 border border-border/80 rounded-xl space-y-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground flex items-center gap-1.5">
              🛡️ Privasi & Keamanan Data:
            </p>
            <ul className="list-disc list-inside space-y-1 text-[11px] leading-relaxed">
              <li>
                Klien <strong>hanya dapat melihat</strong> task dan timeline project ini saja.
              </li>
              <li>
                Klien <strong>tidak bisa mengedit, menghapus, atau melihat</strong> project klien lain.
              </li>
              <li>
                Jika Anda klik <strong>Reset Link</strong>, link lama otomatis langsung mati dan tidak bisa dibuka lagi.
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

"use client";

import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Lock,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { ProjectShareSettings } from "@/types/project";
import { useProject } from "@/components/project-context";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { enableNetwork, disableNetwork, waitForPendingWrites } from "firebase/firestore";
import { db } from "@/firebase/config";

interface SecretShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasSecrets?: boolean;
}

function generateRandomToken() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "sec_";
  for (let i = 0; i < 12; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return token;
}

export function SecretShareDialog({ open, onOpenChange, hasSecrets = true }: SecretShareDialogProps) {
  const { activeProject, updateProject } = useProject();
  const confirm = useConfirm();

  const [copied, setCopied] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const shareSettings: ProjectShareSettings = activeProject?.shareSettings || {
    isEnabled: false,
    shareToken: "",
    isSecretsEnabled: false,
    secretsShareToken: "",
  };

  const isSecretsEnabled = !!shareSettings.isSecretsEnabled;
  const secretsShareToken = shareSettings.secretsShareToken || "";

  const syncToCloud = async () => {
    try {
      await enableNetwork(db);
      await waitForPendingWrites(db);
    } catch (e) {
      console.warn("Auto-sync error:", e);
    } finally {
      if (typeof window !== "undefined" && localStorage.getItem("syncMode") !== "online") {
        await disableNetwork(db).catch(() => {});
      }
    }
  };

  // Auto-generate secrets token if missing when modal opens & project has secrets
  useEffect(() => {
    if (open && hasSecrets && activeProject && !activeProject.shareSettings?.secretsShareToken) {
      const initialToken = generateRandomToken();
      updateProject(activeProject.id, {
        shareSettings: {
          ...shareSettings,
          isSecretsEnabled: true,
          secretsShareToken: initialToken,
        },
      }).then(() => syncToCloud());
    }
  }, [open, hasSecrets, activeProject, updateProject]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const shareUrl = secretsShareToken ? `${origin}/guest-secrets?token=${secretsShareToken}` : "";

  const handleToggleActive = async () => {
    if (!activeProject || !hasSecrets) return;
    setIsUpdating(true);
    try {
      await updateProject(activeProject.id, {
        shareSettings: {
          ...shareSettings,
          isSecretsEnabled: !isSecretsEnabled,
          secretsShareToken: secretsShareToken || generateRandomToken(),
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
      title: "Reset Secret Key Link?",
      description:
        "The current public link for Secret Keys will immediately expire and will no longer grant access. Are you sure you want to generate a new link?",
      confirmText: "Reset Secret Link",
      cancelText: "Cancel",
      variant: "destructive",
    });

    if (ok) {
      setIsUpdating(true);
      try {
        const newToken = generateRandomToken();
        await updateProject(activeProject.id, {
          shareSettings: {
            ...shareSettings,
            secretsShareToken: newToken,
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
      <DialogContent className="sm:max-w-[500px] w-[calc(100vw-2rem)] max-w-full overflow-hidden p-4 sm:p-6">
        <DialogHeader className="space-y-1 min-w-0 max-w-full">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg font-bold text-foreground">
            <Share2 className="w-5 h-5 text-primary shrink-0" />
            <span className="truncate">Share Secret Keys</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed break-words max-w-full">
            Share read-only lower environment secret key vault access for{" "}
            <span className="font-semibold text-foreground break-all">
              {activeProject?.name || "this project"}
            </span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 min-w-0 max-w-full overflow-hidden">
          {!hasSecrets ? (
            <div className="p-4 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-xs sm:text-sm text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Secret Key Data Not Available</span>
              </div>
              <p className="text-xs leading-relaxed opacity-90 break-words">
                This project does not have any Secret Key data yet. Please add at least 1 Secret Key before enabling or sharing a public link.
              </p>
            </div>
          ) : (
            <>
              {/* Status Banner */}
              <div
                className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors min-w-0 max-w-full ${
                  isSecretsEnabled
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                    : "bg-muted/40 border-border text-muted-foreground"
                }`}
              >
                <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  {isSecretsEnabled ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 opacity-70 shrink-0 mt-0.5 sm:mt-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider">
                      Link Status: {isSecretsEnabled ? "Active (Public)" : "Disabled (Off)"}
                    </p>
                    <p className="text-[11px] opacity-80 leading-relaxed break-words">
                      {isSecretsEnabled
                        ? "Anyone with this link can view Secret Keys (Read-Only)"
                        : "Access disabled. The secret link cannot be viewed"}
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  size="sm"
                  variant={isSecretsEnabled ? "default" : "outline"}
                  onClick={handleToggleActive}
                  disabled={isUpdating}
                  className="text-xs h-8 px-3 shrink-0 self-start sm:self-auto"
                >
                  {isUpdating ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isSecretsEnabled ? (
                    "Disable Link"
                  ) : (
                    "Enable Link"
                  )}
                </Button>
              </div>

              {/* Public Link Box */}
              {isSecretsEnabled && (
                <div className="space-y-2 min-w-0 max-w-full">
                  <Label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                    <span>Secret Key Access Link</span>
                    <span className="text-[10px] text-primary flex items-center gap-1">
                      <Lock className="w-3 h-3 shrink-0" /> Read-Only Secure
                    </span>
                  </Label>
                  <div className="flex items-center gap-2 min-w-0 max-w-full">
                    <div className="flex-1 min-w-0 bg-muted/40 border rounded-lg px-2.5 py-2 text-[11px] sm:text-xs font-mono truncate select-all overflow-hidden text-ellipsis whitespace-nowrap">
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

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 text-xs min-w-0 max-w-full">
                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 font-medium truncate min-w-0"
                    >
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Preview Secret View</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleRegenerateToken}
                      disabled={isUpdating}
                      className="text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1 text-[11px] cursor-pointer self-start sm:self-auto shrink-0"
                    >
                      <RotateCw className="w-3 h-3 shrink-0" />
                      Reset / Generate New Link
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

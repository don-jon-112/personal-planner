"use client";

import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Trash2, Info, AlertCircle, HelpCircle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title?: string;
  description?: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: "destructive" | "warning" | "primary" | "default";
  icon?: "trash" | "warning" | "info" | "question" | "error" | "success";
}

export interface AlertModalOptions {
  title?: string;
  description?: string | React.ReactNode;
  buttonText?: string;
  variant?: "info" | "warning" | "error" | "success";
}

type ConfirmFunction = (options: ConfirmOptions | string) => Promise<boolean>;
type AlertModalFunction = (options: AlertModalOptions | string) => Promise<void>;

interface ConfirmContextType {
  confirm: ConfirmFunction;
  alertModal: AlertModalFunction;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  // State for Confirmation Dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmConfig, setConfirmConfig] = useState<ConfirmOptions>({});
  const confirmResolveRef = useRef<((value: boolean) => void) | null>(null);

  // State for Alert Dialog
  const [alertOpen, setAlertOpen] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertModalOptions>({});
  const alertResolveRef = useRef<(() => void) | null>(null);

  const confirm = useCallback<ConfirmFunction>((options) => {
    return new Promise<boolean>((resolve) => {
      confirmResolveRef.current = resolve;
      if (typeof options === "string") {
        setConfirmConfig({
          title: "Confirmation",
          description: options,
          confirmText: "Yes, Proceed",
          cancelText: "Cancel",
          variant: "destructive",
          icon: "warning",
        });
      } else {
        setConfirmConfig({
          title: options.title || "Confirmation",
          description: options.description || "Are you sure you want to proceed?",
          confirmText: options.confirmText || "Proceed",
          cancelText: options.cancelText || "Cancel",
          variant: options.variant || "destructive",
          icon: options.icon || (options.variant === "destructive" ? "trash" : "warning"),
        });
      }
      setConfirmOpen(true);
    });
  }, []);

  const alertModal = useCallback<AlertModalFunction>((options) => {
    return new Promise<void>((resolve) => {
      alertResolveRef.current = resolve;
      if (typeof options === "string") {
        setAlertConfig({
          title: "Information",
          description: options,
          buttonText: "Got it",
          variant: "info",
        });
      } else {
        setAlertConfig({
          title: options.title || "Information",
          description: options.description || "",
          buttonText: options.buttonText || "OK",
          variant: options.variant || "info",
        });
      }
      setAlertOpen(true);
    });
  }, []);

  const handleConfirmAction = (result: boolean) => {
    setConfirmOpen(false);
    if (confirmResolveRef.current) {
      confirmResolveRef.current(result);
      confirmResolveRef.current = null;
    }
  };

  const handleAlertClose = () => {
    setAlertOpen(false);
    if (alertResolveRef.current) {
      alertResolveRef.current();
      alertResolveRef.current = null;
    }
  };

  const renderIcon = (iconType?: string, variant?: string) => {
    if (iconType === "trash" || variant === "destructive") {
      return (
        <div className="w-11 h-11 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
          <Trash2 className="w-5 h-5" />
        </div>
      );
    }
    if (iconType === "warning" || variant === "warning") {
      return (
        <div className="w-11 h-11 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
      );
    }
    if (iconType === "error") {
      return (
        <div className="w-11 h-11 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
          <AlertCircle className="w-5 h-5" />
        </div>
      );
    }
    if (iconType === "success") {
      return (
        <div className="w-11 h-11 rounded-full bg-green-500/15 text-green-600 dark:text-green-400 flex items-center justify-center shrink-0">
          <CheckCircle2 className="w-5 h-5" />
        </div>
      );
    }
    if (iconType === "question") {
      return (
        <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <HelpCircle className="w-5 h-5" />
        </div>
      );
    }
    return (
      <div className="w-11 h-11 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
        <Info className="w-5 h-5" />
      </div>
    );
  };

  return (
    <ConfirmContext.Provider value={{ confirm, alertModal }}>
      {children}

      {/* Confirmation Dialog */}
      <Dialog
        open={confirmOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleConfirmAction(false);
        }}
      >
        <DialogContent className="sm:max-w-[420px] p-6 gap-5">
          <div className="flex items-start gap-4">
            {renderIcon(confirmConfig.icon, confirmConfig.variant)}
            <div className="space-y-1.5 flex-1 min-w-0">
              <DialogTitle className="text-base font-bold text-foreground">
                {confirmConfig.title}
              </DialogTitle>
              <div className="text-sm text-muted-foreground leading-relaxed">
                {confirmConfig.description}
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleConfirmAction(false)}
              className="flex-1 sm:flex-none"
            >
              {confirmConfig.cancelText || "Batal"}
            </Button>
            <Button
              type="button"
              variant={confirmConfig.variant === "destructive" ? "destructive" : "default"}
              size="sm"
              onClick={() => handleConfirmAction(true)}
              className={cn(
                "flex-1 sm:flex-none",
                confirmConfig.variant === "warning" && "bg-amber-600 hover:bg-amber-700 text-white"
              )}
            >
              {confirmConfig.confirmText || "Lanjutkan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Alert Modal Dialog */}
      <Dialog
        open={alertOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleAlertClose();
        }}
      >
        <DialogContent className="sm:max-w-[420px] p-6 gap-5">
          <div className="flex items-start gap-4">
            {renderIcon(alertConfig.variant, alertConfig.variant)}
            <div className="space-y-1.5 flex-1 min-w-0">
              <DialogTitle className="text-base font-bold text-foreground">
                {alertConfig.title}
              </DialogTitle>
              <div className="text-sm text-muted-foreground leading-relaxed">
                {alertConfig.description}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleAlertClose}
              className="w-full sm:w-auto min-w-[80px]"
            >
              {alertConfig.buttonText || "OK"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context.confirm;
}

export function useAlertModal() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useAlertModal must be used within a ConfirmProvider");
  }
  return context.alertModal;
}

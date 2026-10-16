"use client";

import React, { useState } from "react";
import { RotateCcw, Sparkles, UserCheck, Shield, Edit3, Eye, Check } from "lucide-react";
import { useConfirm, useAlertModal } from "@/components/confirm-dialog-provider";
import { resetDemoData } from "@/lib/demo-storage";
import { useAuth } from "@/components/auth-context";
import { setAuthSession } from "@/app/login/actions";
import { cn } from "@/lib/utils";

interface DemoAccount {
  roleName: string;
  username: string;
  name: string;
  isSuperAdmin: boolean;
  icon: any;
  badgeColor: string;
  projectIds: string[];
  projectRoles: Record<string, string[]>;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    roleName: "Super Admin",
    username: "admin",
    name: "Jonathan Alva (Lead)",
    isSuperAdmin: true,
    icon: Shield,
    badgeColor: "text-amber-500 bg-amber-500/10 border-amber-500/20",
    projectIds: ["proj-core", "proj-mobile"],
    projectRoles: {
      "proj-core": ["role-superadmin"],
      "proj-mobile": ["role-superadmin"],
    },
  },
  {
    roleName: "Contributor",
    username: "inal.mahpud",
    name: "Inal Mahpud (Dev)",
    isSuperAdmin: false,
    icon: Edit3,
    badgeColor: "text-blue-500 bg-blue-500/10 border-blue-500/20",
    projectIds: ["proj-core", "proj-mobile"],
    projectRoles: {
      "proj-core": ["role-contributor"],
      "proj-mobile": ["role-contributor"],
    },
  },
  {
    roleName: "Viewer",
    username: "viewer",
    name: "Demo Guest (Viewer)",
    isSuperAdmin: false,
    icon: Eye,
    badgeColor: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
    projectIds: ["proj-core"],
    projectRoles: {
      "proj-core": ["role-viewer"],
    },
  },
];

export function DemoBanner({ className }: { className?: string }) {
  const confirm = useConfirm();
  const alertModal = useAlertModal();
  const { currentUser } = useAuth();
  const [isResetting, setIsResetting] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const handleReset = async () => {
    const ok = await confirm({
      title: "Reset Demo Data?",
      description:
        "Semua data project, task timeline, kanban, bugs, notes, dan roles akan dikembalikan ke kondisi dummy awal. Data modifikasi Anda saat ini akan di-reset.",
      confirmText: "Ya, Reset Demo",
      cancelText: "Batal",
      variant: "warning",
      icon: "warning",
    });

    if (ok) {
      setIsResetting(true);
      try {
        resetDemoData();
        await alertModal({
          title: "Demo Berhasil Direset",
          description: "Database lokal sandbox telah diperbarui kembali ke data dummy awal.",
          variant: "success",
        });
        window.location.reload();
      } catch (e: any) {
        console.error(e);
      } finally {
        setIsResetting(false);
      }
    }
  };

  const handleSwitchUser = async (acc: (typeof DEMO_ACCOUNTS)[0]) => {
    setIsSwitching(true);
    try {
      const session = {
        userId: `user-${acc.username}`,
        username: acc.username,
        name: acc.name,
        isSuperAdmin: acc.isSuperAdmin,
        projectIds: acc.projectIds,
        projectRoles: acc.projectRoles,
      };
      await setAuthSession(session);
      if (typeof window !== "undefined") {
        localStorage.setItem("planner_auth_session", JSON.stringify(session));
      }
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-primary/20 bg-primary/5 p-3 text-sidebar-foreground space-y-2.5",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs font-bold text-primary tracking-wide">
          <Sparkles className="w-3.5 h-3.5" />
          <span>DEMO SANDBOX</span>
        </div>
        <span className="text-[10px] text-muted-foreground bg-background/50 px-1.5 py-0.5 rounded border border-border/50">
          Browser Isolated
        </span>
      </div>

      <p className="text-[11px] text-muted-foreground leading-snug">
        Data tersimpan mandiri di browser Anda. Firebase Cloud aman & tidak tersentuh.
      </p>

      {/* Quick Switch Persona Buttons */}
      <div className="space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-1">
          <UserCheck className="w-3 h-3" />
          <span>Switch Demo Role</span>
        </div>
        <div className="grid grid-cols-3 gap-1">
          {DEMO_ACCOUNTS.map((acc) => {
            const isActive =
              currentUser?.username?.toLowerCase() === acc.username.toLowerCase();
            const Icon = acc.icon;
            return (
              <button
                key={acc.username}
                type="button"
                onClick={() => handleSwitchUser(acc)}
                disabled={isSwitching}
                title={`Switch to ${acc.roleName} (${acc.name})`}
                className={cn(
                  "flex flex-col items-center justify-center p-1.5 rounded-lg border text-[10px] transition-all font-medium text-center relative",
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-xs"
                    : "bg-background/80 hover:bg-background border-border/80 text-foreground/80 hover:text-foreground"
                )}
              >
                {isActive && (
                  <Check className="w-2.5 h-2.5 absolute top-1 right-1 opacity-90" />
                )}
                <Icon className="w-3.5 h-3.5 mb-0.5" />
                <span className="truncate w-full">{acc.roleName}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Reset Demo Data Button */}
      <button
        type="button"
        onClick={handleReset}
        disabled={isResetting}
        className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
      >
        <RotateCcw className={cn("w-3.5 h-3.5", isResetting && "animate-spin")} />
        <span>{isResetting ? "Mereset..." : "Reset Demo Data"}</span>
      </button>
    </div>
  );
}

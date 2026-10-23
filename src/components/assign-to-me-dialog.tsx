"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/components/auth-context";
import { useProject } from "@/components/project-context";
import { useCollection, useUpdateDocument, useAddDocument } from "@/hooks/use-firestore";
import { getTaskEndDate } from "@/lib/overlap-utils";
import { 
  UserCheck, 
  Calendar, 
  Clock, 
  FolderKanban, 
  Layers, 
  CheckCircle2, 
  ArrowRight,
  AlertCircle
} from "lucide-react";
import { serverTimestamp } from "firebase/firestore";
import { appendAssignmentLogToRedis } from "@/lib/cache-client";

interface AssignToMeDialogProps {
  task: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (updatedTask: any) => void;
}

export function AssignToMeDialog({
  task,
  open,
  onOpenChange,
  onSuccess,
}: AssignToMeDialogProps) {
  const { currentUser } = useAuth();
  const { activeProject, projects } = useProject();

  const { data: epics = [] } = useCollection<any>("timelineEpics");
  const { data: holidays = [] } = useCollection<any>("timelineHolidays");
  const { data: pics = [] } = useCollection<any>("timelinePics");

  const { mutateAsync: updateTask, isPending: isUpdatingTask } = useUpdateDocument("timelineTasks");
  const { mutateAsync: addPic } = useAddDocument("timelinePics");
  const { mutateAsync: addAssignmentLog, isPending: isLogging } = useAddDocument("assignmentLogs");

  // Editable Fields: MD, Start Date, and Overtime
  const [md, setMd] = useState<number>(1);
  const [startDate, setStartDate] = useState<string>("");
  const [isOvertime, setIsOvertime] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Initialize values when dialog opens
  useEffect(() => {
    if (open && task) {
      setErrorMsg(null);
      // Default MD: existing task MD (at least 1) or fallback to 1
      const rawMd = typeof task.md === "number" ? task.md : parseFloat(task.md);
      const initialMd = !isNaN(rawMd) && rawMd >= 1 ? rawMd : 1;
      setMd(initialMd);

      // Default Start Date: existing task startDate (if valid & not TBD) or today
      if (task.startDate && task.startDate !== "TBD" && !isNaN(new Date(task.startDate).getTime())) {
        setStartDate(task.startDate);
      } else {
        const todayStr = new Date().toISOString().split("T")[0];
        setStartDate(todayStr);
      }

      setIsOvertime(Boolean(task.isOvertime || task.overtime));
    }
  }, [open, task]);

  // Find associated Epic & Project
  const taskEpic = useMemo(() => {
    if (!task?.epicId) return null;
    return (epics || []).find((e: any) => e.id === task.epicId);
  }, [epics, task?.epicId]);

  const taskProject = useMemo(() => {
    const pId = task?.projectId || activeProject?.id;
    return (projects || []).find((p: any) => p.id === pId) || activeProject;
  }, [projects, activeProject, task?.projectId]);

  const viewerName = currentUser?.name || currentUser?.username || "Viewer";

  // Calculate live End Date based on Start Date + MD (skipping weekends & holidays unless overtime)
  const calculatedEndDateInfo = useMemo(() => {
    const numericMd = Number(md);
    if (!startDate || isNaN(new Date(startDate).getTime()) || isNaN(numericMd) || numericMd <= 0) {
      return { endDateStr: "", formattedDate: "-" };
    }
    const startObj = new Date(startDate);
    const endObj = getTaskEndDate(startObj, Math.max(1, numericMd), holidays, isOvertime);

    const yyyy = endObj.getFullYear();
    const mm = String(endObj.getMonth() + 1).padStart(2, "0");
    const dd = String(endObj.getDate()).padStart(2, "0");
    const endDateStr = `${yyyy}-${mm}-${dd}`;

    const formattedDate = endObj.toLocaleDateString("id-ID", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });

    return { endDateStr, formattedDate };
  }, [startDate, md, holidays, isOvertime]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    const taskId = task.id || task._id || task.taskId;
    if (!taskId) {
      setErrorMsg("ID Task tidak ditemukan.");
      return;
    }

    if (!startDate || startDate === "TBD" || isNaN(new Date(startDate).getTime())) {
      setErrorMsg("Start Date wajib diisi dengan tanggal yang valid.");
      return;
    }

    const numericMd = typeof md === "number" ? md : parseFloat(md as any);
    if (isNaN(numericMd) || numericMd < 1) {
      setErrorMsg("MD (Man Days) minimal 1.");
      return;
    }

    setErrorMsg(null);

    try {
      const targetProjectId = taskProject?.id || activeProject?.id || task?.projectId || "_global_";

      // 1. Auto-register PIC if not present in project
      const picExists = (pics || []).some((p: any) => {
        const pName = (p?.name || "").trim().toLowerCase();
        const vName = (viewerName || "").trim().toLowerCase();
        const pProj = p?.projectId;
        return pName === vName && (pProj === targetProjectId || pProj === "_global_" || !pProj);
      });

      if (!picExists && targetProjectId && targetProjectId !== "_global_") {
        try {
          await addPic({
            name: viewerName,
            color: "#3b82f6",
            projectId: targetProjectId,
            showInAnalytics: true,
          });
        } catch (picErr) {
          console.warn("Failed to auto-register PIC:", picErr);
        }
      }

      const safeMd = Math.max(1, numericMd);
      const calculatedEndDate = calculatedEndDateInfo.endDateStr || startDate;

      // 2. Update task in Firestore
      const updatedPayload = {
        status: "ON PROGRESS",
        pic: viewerName,
        md: safeMd,
        startDate: startDate,
        endDate: calculatedEndDate,
        isOvertime: isOvertime,
        updatedAt: serverTimestamp(),
      };

      await updateTask({
        id: taskId,
        data: updatedPayload,
      });

      // 3. Record Audit Log in "assignmentLogs" and sync Redis
      try {
        const logPayload = {
          category: "task" as const,
          action: "CLAIM_TASK",
          taskId: taskId,
          taskName: task.name || "Untitled Task",
          epicId: task.epicId || null,
          epicName: taskEpic?.name || "-",
          projectId: targetProjectId,
          projectName: taskProject?.name || "-",
          userId: currentUser?.id || "unknown",
          username: currentUser?.username || "-",
          userName: viewerName,
          md: safeMd,
          startDate: startDate,
          endDate: calculatedEndDate,
          previousPic: task.pic || "Unassigned",
          previousStatus: task.status || "TODO",
          previousMd: task.md !== undefined ? task.md : null,
          previousStartDate: task.startDate || null,
          status: "ON PROGRESS",
          isOvertime: isOvertime,
          details: `Mengambil task "${task.name || "Untitled"}" via Assign To Me (${safeMd} MD${isOvertime ? ", Lembur/OT" : ""})`,
          changes: [
            { field: "status", label: "Status Task", oldValue: task.status || "TODO", newValue: "ON PROGRESS" },
            { field: "pic", label: "PIC", oldValue: task.pic || "Unassigned", newValue: viewerName },
            { field: "md", label: "MD", oldValue: String(task.md || "-"), newValue: String(safeMd) },
            { field: "startDate", label: "Tanggal Mulai", oldValue: task.startDate || "-", newValue: startDate },
          ],
          claimedAt: serverTimestamp(),
          timestamp: new Date().toISOString(),
        };

        const newLogDoc = await addAssignmentLog(logPayload);
        appendAssignmentLogToRedis({
          ...logPayload,
          id: (newLogDoc as any)?.id || `log-${Date.now()}`,
        }).catch(console.warn);
      } catch (logErr) {
        console.error("Failed to create assignment log:", logErr);
      }

      onSuccess?.({ ...task, id: taskId, ...updatedPayload });
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to assign task:", err);
      setErrorMsg(err?.message || "Gagal mengklaim task. Silakan coba lagi.");
    }
  };

  const isSaving = isUpdatingTask || isLogging;
  const isSubmitDisabled = isSaving || !startDate || !md || Number(md) < 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md w-[calc(100vw-2rem)] p-0 overflow-hidden">
        {/* Modal Header */}
        <div className="bg-primary/10 border-b border-primary/20 p-5 pb-4">
          <DialogHeader>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg font-bold text-foreground">
                  Assign To Me
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Tentukan estimasi MD (minimal 1 MD) dan Tanggal Mulai pengerjaan task ini.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Read-Only Context Summary */}
          <div className="p-3.5 rounded-lg border bg-muted/30 space-y-2.5 text-xs">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground uppercase font-semibold tracking-wider">
                  Task Target
                </span>
                <p className="font-semibold text-sm text-foreground line-clamp-2">
                  {task?.name || "-"}
                </p>
              </div>
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                {task?.status || "TODO"} ➔ ON PROGRESS
              </span>
            </div>

            <div className="flex items-center gap-3 pt-1 border-t border-border/60 text-muted-foreground text-[11px]">
              {taskEpic && (
                <div className="flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5 text-primary" />
                  <span className="truncate max-w-[130px] font-medium text-foreground">
                    {taskEpic.name}
                  </span>
                </div>
              )}
              {taskProject && (
                <div className="flex items-center gap-1">
                  <FolderKanban className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[130px]">{taskProject.name}</span>
                </div>
              )}
              <div className="ml-auto font-medium text-foreground flex items-center gap-1">
                <span className="text-muted-foreground">Assignee:</span>
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold">
                  {viewerName}
                </span>
              </div>
            </div>
          </div>

          {/* THE 2 EDITABLE FIELDS */}
          <div className="space-y-3.5">
            {/* 1. Man Days (MD) */}
            <div className="space-y-1.5">
              <Label htmlFor="assign-md" className="text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-primary" />
                  Man Days (MD)
                  <span className="text-destructive">*</span>
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Minimal 1 hari kerja
                </span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="assign-md"
                  type="number"
                  step="0.5"
                  min="1"
                  max="365"
                  required
                  value={md}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setMd(isNaN(val) ? ("" as any) : val);
                  }}
                  placeholder="Minimal 1 MD"
                  className="font-semibold text-sm"
                  autoFocus
                />
                <div className="flex items-center gap-1 shrink-0">
                  {[1, 2, 3, 5].map((preset) => (
                    <Button
                      key={preset}
                      type="button"
                      variant={Number(md) === preset ? "default" : "outline"}
                      size="sm"
                      onClick={() => setMd(preset)}
                      className="h-9 px-2 text-xs font-medium"
                    >
                      {preset}d
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* 2. Start Date */}
            <div className="space-y-1.5">
              <Label htmlFor="assign-start-date" className="text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  Start Date
                  <span className="text-destructive">*</span>
                </span>
                <span className="text-[11px] font-normal text-muted-foreground">
                  Tanggal mulai pengerjaan
                </span>
              </Label>
              <Input
                id="assign-start-date"
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-sm font-medium"
              />
              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => setStartDate(new Date().toISOString().split("T")[0])}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Hari Ini
                </button>
                <span className="text-muted-foreground/40 text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => {
                    const tom = new Date();
                    tom.setDate(tom.getDate() + 1);
                    setStartDate(tom.toISOString().split("T")[0]);
                  }}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Besok
                </button>
                <span className="text-muted-foreground/40 text-[10px]">•</span>
                <button
                  type="button"
                  onClick={() => {
                    const nextMon = new Date();
                    const day = nextMon.getDay();
                    const diff = (day === 0 ? 1 : 8 - day);
                    nextMon.setDate(nextMon.getDate() + diff);
                    setStartDate(nextMon.toISOString().split("T")[0]);
                  }}
                  className="text-[11px] text-primary hover:underline font-medium"
                >
                  Senin Depan
                </button>
              </div>
            </div>
          </div>

            {/* Overtime Toggle */}
            <div className="flex items-center space-x-2 pt-1 pb-1">
              <input
                type="checkbox"
                id="assign-is-overtime"
                checked={isOvertime}
                onChange={(e) => setIsOvertime(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer"
              />
              <label
                htmlFor="assign-is-overtime"
                className="text-xs font-semibold cursor-pointer text-foreground flex items-center gap-1.5 select-none"
              >
                <span>Task Overtime (Lembur)</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.2 rounded">
                  {isOvertime ? "Weekend & libur dihitung" : "OT"}
                </span>
              </label>
            </div>

          {/* Live End Date Calculation Preview */}
          <div className="p-3 rounded-lg border border-primary/20 bg-primary/5 flex items-center justify-between text-xs">
            <div className="space-y-0.5">
              <span className="text-[11px] text-muted-foreground font-medium">Estimasi Selesai (End Date):</span>
              <p className="font-semibold text-foreground text-sm flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{calculatedEndDateInfo.formattedDate}</span>
              </p>
            </div>
            <div className="text-right text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">{Number(md) >= 1 ? md : 1}</span> {isOvertime ? "Hari Kalender (OT)" : "Hari Kerja"}
              <p className="text-[10px] text-muted-foreground/80">{isOvertime ? "(Weekend & libur tidak di-skip)" : "(Lewati libur & weekend)"}</p>
            </div>
          </div>

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Batal
            </Button>
            <Button
              type="submit"
              disabled={isSubmitDisabled}
              className="gap-1.5 font-semibold"
            >
              <UserCheck className="w-4 h-4" />
              <span>{isSaving ? "Menyimpan..." : "Konfirmasi & Ambil Task"}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

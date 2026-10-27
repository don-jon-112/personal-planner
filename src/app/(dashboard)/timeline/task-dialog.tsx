"use client";

import { useEffect, useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument, useDeleteDocument, useCollection } from "@/hooks/use-firestore";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, ListPlus, AlertCircle, ArrowRight, AlertTriangle, Calendar, Layers, Clock, CheckCircle2, FileText, ExternalLink, Trash2 } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { checkTaskOverlap, getTaskEndDate, formatDateString, OverlapResult } from "@/lib/overlap-utils";
import { useProject } from "@/components/project-context";
import { useAuth } from "@/components/auth-context";
import { serverTimestamp } from "firebase/firestore";
import { appendAssignmentLogToRedis, saveProjectCacheToRedis } from "@/lib/cache-client";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface TaskNoteItem {
  id: string;
  text: string;
  url?: string;
}

const formSchema = z.object({
  name: z.string().min(1, "Task name is required"),
  epicId: z.string(),
  pic: z.string().min(1, "PIC is required (select TBD if not yet decided)"),
  status: z.string().min(1, "Status is required"),
  priority: z.union([z.number(), z.string(), z.nan(), z.null()]).optional(),
  md: z.number().min(0.01, "MD must be greater than 0"),
  startDate: z.string().min(1, "Start Date is required"),
  isOvertime: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export function TaskDialog({ 
  taskToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  fromTimeline = false,
  readOnly = false,
}: { 
  taskToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void,
  fromTimeline?: boolean,
  readOnly?: boolean,
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { activeProjectId, activeProject, isItemInActiveProject } = useProject();
  const { currentUser, session } = useAuth();
  const { mutateAsync: addAssignmentLog } = useAddDocument("assignmentLogs");

  const { data: epics = [] } = useCollection<any>("timelineEpics");
  const { data: pics = [] } = useCollection<any>("timelinePics");
  const { data: allTasks = [] } = useCollection<any>("timelineTasks");
  const { data: holidays = [] } = useCollection<any>("timelineHolidays");
  const { statuses: taskStatuses } = useTaskStatuses();

  const filteredEpics = useMemo(() => {
    return epics.filter((e: any) => isItemInActiveProject(e.projectId));
  }, [epics, isItemInActiveProject]);

  const filteredPics = useMemo(() => {
    return pics.filter((p: any) => isItemInActiveProject(p.projectId));
  }, [pics, isItemInActiveProject]);

  const { mutateAsync: addTask, isPending: isAdding } = useAddDocument("timelineTasks");
  const { mutateAsync: updateTask, isPending: isUpdating } = useUpdateDocument("timelineTasks");
  const { mutateAsync: deleteTask, isPending: isDeleting } = useDeleteDocument("timelineTasks");
  const confirm = useConfirm();

  const [mode, setMode] = useState<"create" | "backlog">("create");
  const [selectedBacklogId, setSelectedBacklogId] = useState<string>("");
  const [isTbdDate, setIsTbdDate] = useState(false);

  // Notes state
  const [notes, setNotes] = useState<TaskNoteItem[]>([]);
  const [newNoteText, setNewNoteText] = useState("");
  const [newNoteUrl, setNewNoteUrl] = useState("");

  // Overlap confirmation states
  const [showOverlapConfirm, setShowOverlapConfirm] = useState(false);
  const [pendingSubmitData, setPendingSubmitData] = useState<FormValues | null>(null);
  const [activeOverlapData, setActiveOverlapData] = useState<OverlapResult | null>(null);

  // Filter tasks that do not have an epic assigned (Backlog items) in the active project
  const backlogTasks = useMemo(() => {
    return allTasks.filter((t: any) => (!t.epicId || t.epicId === "") && isItemInActiveProject(t.projectId));
  }, [allTasks, isItemInActiveProject]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      epicId: "",
      pic: "TBD",
      status: "TODO",
      priority: "",
      md: 1,
      startDate: new Date().toISOString().split("T")[0],
      isOvertime: false,
    },
  });

  useEffect(() => {
    if (open) {
      setShowOverlapConfirm(false);
      setPendingSubmitData(null);
      setActiveOverlapData(null);
      setNewNoteText("");
      setNewNoteUrl("");

      if (taskToEdit && taskToEdit.id) {
        // Editing an existing task
        setMode("create");
        setSelectedBacklogId("");
        form.reset({
          name: taskToEdit.name || "",
          epicId: taskToEdit.epicId || "",
          pic: taskToEdit.pic || "TBD",
          status: taskToEdit.status || "TODO",
          priority: taskToEdit.priority !== undefined && taskToEdit.priority !== null ? taskToEdit.priority : "",
          md: taskToEdit.md || 1,
          startDate: taskToEdit.startDate || new Date().toISOString().split("T")[0],
          isOvertime: Boolean(taskToEdit.isOvertime || taskToEdit.overtime),
        });
        setIsTbdDate(taskToEdit.startDate === "TBD");

        // Populate notes
        const rawNotes = Array.isArray(taskToEdit.notes) ? taskToEdit.notes : [];
        setNotes(
          rawNotes.map((n: any, idx: number) => {
            if (typeof n === "string") {
              const isUrl = /^https?:\/\//i.test(n.trim());
              return {
                id: `note-${idx}-${Date.now()}`,
                text: n.trim(),
                url: isUrl ? n.trim() : undefined,
              };
            }
            return {
              id: n.id || `note-${idx}-${Date.now()}`,
              text: n.text || n.content || "",
              url: n.url || undefined,
            };
          })
        );
      } else {
        // Adding a new task
        setNotes([]);
        setMode("create");
        setSelectedBacklogId("");
        form.reset({
          name: "",
          epicId: taskToEdit?.epicId || "",
          pic: "TBD",
          status: "TODO",
          priority: "",
          md: 1,
          startDate: new Date().toISOString().split("T")[0],
          isOvertime: false,
        });
        setIsTbdDate(false);
      }
    }
  }, [taskToEdit, open, form, fromTimeline, backlogTasks]);

  const handleBacklogSelect = (backlogId: string) => {
    setSelectedBacklogId(backlogId);
    if (!backlogId) return;

    const chosen = backlogTasks.find((t: any) => t.id === backlogId);
    if (chosen) {
      form.setValue("name", chosen.name || "");
      if (chosen.pic) form.setValue("pic", chosen.pic);
      if (chosen.status) form.setValue("status", chosen.status);
      if (chosen.priority !== undefined && chosen.priority !== null) {
        form.setValue("priority", chosen.priority);
      } else {
        form.setValue("priority", "");
      }
      if (chosen.md) form.setValue("md", chosen.md);
      if (chosen.startDate) {
        form.setValue("startDate", chosen.startDate);
        setIsTbdDate(chosen.startDate === "TBD");
      }
      form.setValue("isOvertime", Boolean(chosen.isOvertime || chosen.overtime));
      if (Array.isArray(chosen.notes)) {
        setNotes(
          chosen.notes.map((n: any, idx: number) => ({
            id: n.id || `note-${idx}-${Date.now()}`,
            text: typeof n === "string" ? n : n.text || n.content || "",
            url: typeof n === "string" && /^https?:\/\//i.test(n) ? n : n.url,
          }))
        );
      }
    }
  };

  const handleAddNote = () => {
    const trimmedText = newNoteText.trim();
    let trimmedUrl = newNoteUrl.trim();

    if (!trimmedText && !trimmedUrl) return;

    let finalText = trimmedText;
    let finalUrl = trimmedUrl;

    // If text looks like a URL and URL input is empty, treat text as URL
    if (!finalUrl && /^https?:\/\//i.test(trimmedText)) {
      finalUrl = trimmedText;
    } else if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }

    if (!finalText && finalUrl) {
      finalText = finalUrl;
    }

    const newNote: TaskNoteItem = {
      id: `note-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      text: finalText,
      url: finalUrl || undefined,
    };

    setNotes((prev) => [...prev, newNote]);
    setNewNoteText("");
    setNewNoteUrl("");
  };

  const handleDeleteNote = async (noteId: string) => {
    const ok = await confirm({
      title: "Hapus Catatan?",
      description: "Apakah Anda yakin ingin menghapus catatan ini?",
      confirmText: "Hapus",
      cancelText: "Batal",
      variant: "destructive",
    });
    if (ok) {
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    }
  };

  const currentTargetId = taskToEdit?.id || (mode === "backlog" ? selectedBacklogId : null);

  // Live Overlap detection based on current form values
  const watchedPic = form.watch("pic");
  const watchedStartDate = form.watch("startDate");
  const watchedMd = form.watch("md");
  const watchedName = form.watch("name");
  const watchedIsOvertime = form.watch("isOvertime");

  const estimatedEndDate = useMemo(() => {
    if (isTbdDate || !watchedStartDate || watchedStartDate === "TBD") return null;
    const start = new Date(watchedStartDate);
    if (isNaN(start.getTime())) return null;
    const validMd = Math.max(1, Math.ceil(Number(watchedMd) || 1));
    const end = getTaskEndDate(start, validMd, holidays, watchedIsOvertime);
    return {
      dateStr: formatDateString(end),
      formatted: end.toLocaleDateString("id-ID", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      }),
    };
  }, [isTbdDate, watchedStartDate, watchedMd, holidays, watchedIsOvertime]);

  const liveOverlap = useMemo(() => {
    if (!open) return { hasOverlap: false, overlappingTasks: [] };
    return checkTaskOverlap(
      {
        id: currentTargetId,
        pic: watchedPic,
        startDate: isTbdDate ? "TBD" : watchedStartDate,
        md: watchedMd,
        name: watchedName,
        isOvertime: watchedIsOvertime,
      },
      allTasks,
      holidays,
      epics
    );
  }, [open, currentTargetId, watchedPic, isTbdDate, watchedStartDate, watchedMd, watchedName, watchedIsOvertime, allTasks, holidays, epics]);

  const executeSave = async (data: FormValues) => {
    try {
      const targetId = taskToEdit?.id || (mode === "backlog" ? selectedBacklogId : null);
      const projId = activeProjectId || taskToEdit?.projectId || "_global_";
      const projName = activeProject?.name || "Global / Shared";

      let parsedPriority: number | null = null;
      if (data.priority !== undefined && data.priority !== null && data.priority !== "") {
        const pNum = Number(data.priority);
        if (!isNaN(pNum) && pNum > 0) {
          parsedPriority = Math.round(pNum);
        }
      }
      const taskDataToSave = {
        ...data,
        priority: parsedPriority,
        notes,
      };

      if (targetId) {
        const existingTask = taskToEdit || allTasks.find((t: any) => t.id === targetId);
        const oldStatus = existingTask?.status || "TODO";
        const newStatus = data.status;
        const statusChanged = oldStatus !== newStatus;

        // Update existing task (or assign backlog task to epic)
        await updateTask({ id: targetId, data: taskDataToSave });

        // If status changed, record audit log & sync Redis immediately
        if (statusChanged) {
          try {
            const currentUserName = currentUser?.name || session?.name || currentUser?.username || session?.username || "User";
            const currentUserId = currentUser?.id || session?.userId || "unknown";
            const currentUsername = currentUser?.username || session?.username || "-";
            const targetEpic = epics.find((e: any) => e.id === (data.epicId || existingTask?.epicId));

            const logPayload = {
              category: "task" as const,
              action: "STATUS_CHANGE",
              taskId: targetId,
              taskName: data.name || existingTask?.name || "Untitled Task",
              epicId: data.epicId || existingTask?.epicId || null,
              epicName: targetEpic?.name || "-",
              projectId: projId,
              projectName: projName,
              userId: currentUserId,
              username: currentUsername,
              userName: currentUserName,
              previousStatus: oldStatus,
              status: newStatus,
              priority: parsedPriority,
              previousPriority: existingTask?.priority ?? null,
              previousPic: existingTask?.pic || "-",
              md: data.md,
              startDate: isTbdDate ? "TBD" : data.startDate,
              details: `Mengubah status task dari "${oldStatus}" menjadi "${newStatus}"`,
              changes: [
                {
                  field: "status",
                  label: "Status Task",
                  oldValue: oldStatus,
                  newValue: newStatus,
                },
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
            console.warn("Failed to create status change audit log:", logErr);
          }
        }

        // Auto-update Redis timeline project cache
        const updatedTasks = allTasks.map((t: any) =>
          t.id === targetId ? { ...t, ...taskDataToSave, id: targetId } : t
        );
        saveProjectCacheToRedis(projId, { tasks: updatedTasks, epics: filteredEpics }).catch(console.warn);
      } else {
        // Create brand new task
        const newDoc = await addTask({ ...taskDataToSave, order: Date.now(), projectId: activeProjectId || undefined });
        const newId = (newDoc as any)?.id;
        const updatedTasks = [...allTasks, { ...taskDataToSave, order: Date.now(), projectId: activeProjectId || undefined, id: newId }];
        saveProjectCacheToRedis(projId, { tasks: updatedTasks, epics: filteredEpics }).catch(console.warn);
      }
      setShowOverlapConfirm(false);
      setPendingSubmitData(null);
      setActiveOverlapData(null);
      setOpen(false);
      if (!taskToEdit) {
        form.reset();
        setSelectedBacklogId("");
        setNotes([]);
      }
    } catch (error) {
      console.error(error);
    }
  };

  async function onSubmit(data: FormValues) {
    if (fromTimeline && !data.epicId) {
      form.setError("epicId", { message: "Silakan pilih Epic untuk menampilkan task di Timeline" });
      return;
    }

    const targetId = taskToEdit?.id || (mode === "backlog" ? selectedBacklogId : null);

    // Check overlap for submitted data
    const overlapResult = checkTaskOverlap(
      {
        id: targetId,
        pic: data.pic,
        startDate: data.startDate,
        md: data.md,
        name: data.name,
        isOvertime: data.isOvertime,
      },
      allTasks,
      holidays,
      epics
    );

    if (overlapResult.hasOverlap) {
      // Prompt user with confirmation modal
      setPendingSubmitData(data);
      setActiveOverlapData(overlapResult);
      setShowOverlapConfirm(true);
      return;
    }

    // No overlap -> save directly
    await executeSave(data);
  }

  const isPending = isAdding || isUpdating;
  const isEditing = Boolean(taskToEdit && taskToEdit.id);

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {readOnly
                ? "Task Details"
                : isEditing 
                ? "Edit Task" 
                : mode === "backlog" 
                ? "Assign Task from Backlog" 
                : "Create New Task"}
            </DialogTitle>
          </DialogHeader>

          {/* Mode Selector for New Task (shown when backlog tasks exist) */}
          {!readOnly && !isEditing && backlogTasks.length > 0 && (
            <div className="flex bg-muted/60 p-1 rounded-lg gap-1 mb-2">
              <button
                type="button"
                onClick={() => {
                  setMode("create");
                  setSelectedBacklogId("");
                  form.setValue("name", "");
                  form.setValue("pic", "TBD");
                  form.setValue("status", "TODO");
                  form.setValue("md", 1);
                  form.setValue("startDate", new Date().toISOString().split("T")[0]);
                  form.setValue("isOvertime", false);
                  setIsTbdDate(false);
                  setNotes([]);
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all",
                  mode === "create"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Plus className="w-3.5 h-3.5" />
                Create New
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("backlog");
                  if (backlogTasks.length > 0) {
                    const targetId = selectedBacklogId || backlogTasks[0].id;
                    handleBacklogSelect(targetId);
                  }
                }}
                className={cn(
                  "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-semibold transition-all",
                  mode === "backlog"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <ListPlus className="w-3.5 h-3.5 text-primary" />
                <span>Select from Backlog</span>
                <span className="ml-1 px-1.5 py-0.2 bg-primary/10 text-primary rounded-full text-[10px] font-bold">
                  {backlogTasks.length}
                </span>
              </button>
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Backlog Dropdown if mode is backlog */}
            {mode === "backlog" && !isEditing && (
              <div className="space-y-2 p-3 bg-muted/30 border rounded-lg">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <ListPlus className="w-3.5 h-3.5 text-primary" /> Pilih Task dari Backlog
                </Label>
                <select
                  value={selectedBacklogId}
                  onChange={(e) => handleBacklogSelect(e.target.value)}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {backlogTasks.map((t: any) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.status || "TODO"}, {t.md || 1} MD)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Task Name */}
            <div className="space-y-2">
              <Label>
                Task Name {!readOnly && <span className="text-destructive">*</span>}
              </Label>
              <Input
                {...form.register("name")}
                placeholder="e.g., Design Database Schema"
                disabled={readOnly || mode === "backlog"}
                className={cn((mode === "backlog" || readOnly) && "bg-muted text-foreground font-semibold")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>

            {/* Epic Selection */}
            <div className="space-y-2">
              <Label>Epic {fromTimeline && !readOnly && <span className="text-destructive">*</span>}</Label>
              <select
                {...form.register("epicId")}
                disabled={readOnly}
                className={cn(
                  "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring",
                  readOnly && "bg-muted text-muted-foreground cursor-not-allowed opacity-90"
                )}
              >
                <option value="">{fromTimeline ? "Select an Epic" : "None (Backlog)"}</option>
                {filteredEpics?.map((epic: any) => (
                  <option key={epic.id} value={epic.id}>
                    {epic.name}
                  </option>
                ))}
              </select>
              {form.formState.errors.epicId && (
                <p className="text-xs text-destructive">{form.formState.errors.epicId.message}</p>
              )}
            </div>

            {/* PIC & Status */}
                <div className="flex gap-3">
                  <div className="space-y-2 flex-1">
                    <Label>
                      PIC {!readOnly && <span className="text-destructive">*</span>}
                    </Label>
                    <select
                      {...form.register("pic")}
                      disabled={readOnly}
                      className={cn(
                        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring",
                        readOnly && "bg-muted text-muted-foreground cursor-not-allowed opacity-90"
                      )}
                    >
                      <option value="">Select PIC</option>
                      <option value="TBD">TBD</option>
                      {filteredPics
                        ?.sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""))
                        .map((pic: any) => (
                          <option key={pic.id} value={pic.name}>
                            {pic.name}
                          </option>
                        ))}
                    </select>
                    {form.formState.errors.pic && (
                      <p className="text-xs text-destructive">{form.formState.errors.pic.message}</p>
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label>Status</Label>
                    <select
                      {...form.register("status")}
                      disabled={readOnly}
                      className={cn(
                        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring",
                        readOnly && "bg-muted text-muted-foreground cursor-not-allowed opacity-90"
                      )}
                    >
                      {taskStatuses.map((s) => (
                        <option key={s.id} value={s.name}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 w-[110px] shrink-0">
                    <Label title="Priority (P1, P2, ...)">Priority (P)</Label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      placeholder="e.g. 1"
                      disabled={readOnly}
                      className={cn(readOnly && "bg-muted text-muted-foreground cursor-not-allowed")}
                      {...form.register("priority")}
                    />
                  </div>
                </div>

                {/* Start Date & MD */}
                <div className="flex gap-3">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center justify-between h-[20px]">
                      <Label>Start Date</Label>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id="tbdDate"
                          checked={isTbdDate}
                          disabled={readOnly}
                          onChange={(e) => {
                            if (readOnly) return;
                            setIsTbdDate(e.target.checked);
                            if (e.target.checked) form.setValue("startDate", "TBD");
                            else form.setValue("startDate", new Date().toISOString().split("T")[0]);
                          }}
                          className="rounded border-input text-primary focus:ring-primary h-3.5 w-3.5"
                        />
                        <label htmlFor="tbdDate" className={cn("text-xs select-none", readOnly ? "cursor-not-allowed text-muted-foreground/70" : "cursor-pointer text-muted-foreground")}>
                          TBD
                        </label>
                      </div>
                    </div>
                    {!isTbdDate ? (
                      <Input type="date" disabled={readOnly} {...form.register("startDate")} className={cn(readOnly && "bg-muted text-muted-foreground cursor-not-allowed")} />
                    ) : (
                      <Input type="text" value="TBD" disabled className="bg-muted text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-2 flex-1">
                    <div className="h-[20px] flex items-end">
                      <Label>MD (Man Days)</Label>
                    </div>
                    <Input type="number" step="any" min="0.01" placeholder="e.g. 0.5 or 1.5" disabled={readOnly} className={cn(readOnly && "bg-muted text-muted-foreground cursor-not-allowed")} {...form.register("md", { valueAsNumber: true })} />
                  </div>
                </div>

                {/* Overtime (Lembur) Toggle & Schedule Summary */}
                <div className="p-3 rounded-lg border border-border/80 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="taskIsOvertime"
                        checked={form.watch("isOvertime")}
                        disabled={readOnly}
                        onChange={(e) => {
                          if (readOnly) return;
                          form.setValue("isOvertime", e.target.checked, { shouldValidate: true });
                        }}
                        className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                      />
                      <label
                        htmlFor="taskIsOvertime"
                        className={cn(
                          "text-xs font-semibold select-none flex items-center gap-1.5",
                          readOnly ? "cursor-not-allowed text-muted-foreground" : "cursor-pointer text-foreground"
                        )}
                      >
                        <span>Overtime Task (Lembur)</span>
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30">
                          OT
                        </span>
                      </label>
                    </div>
                    {form.watch("isOvertime") ? (
                      <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Weekend & libur dihitung
                      </span>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        Lewati weekend & hari libur
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {form.watch("isOvertime")
                      ? "Task lembur: dikerjakan di akhir pekan atau hari libur (hari libur tidak di-skip, dihitung kalender berurutan)."
                      : "Task normal: otomatis melewati hari Sabtu, Minggu, dan hari libur nasional."}
                  </p>

                  {/* Estimated End Date info */}
                  {estimatedEndDate && (
                    <div className="flex items-center justify-between pt-1.5 border-t border-border/50 text-[11px]">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        Estimasi Selesai (End Date):
                      </span>
                      <span className="font-semibold text-foreground">
                        {estimatedEndDate.formatted} ({estimatedEndDate.dateStr})
                      </span>
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div className="space-y-2.5 pt-2 border-t border-border/70">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-primary" />
                      Notes
                    </Label>
                    {notes.length > 0 && (
                      <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                        {notes.length} {notes.length === 1 ? "note" : "notes"}
                      </span>
                    )}
                  </div>

                  {/* Add Note Inputs */}
                  {!readOnly && (
                    <div className="space-y-1.5 p-2.5 rounded-lg bg-muted/30 border border-border/60">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Input
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                          placeholder="Note / Jira link (e.g. PROJ-123 or https://jira...)"
                          className="text-xs h-8 bg-background"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAddNote();
                            }
                          }}
                        />
                        <Input
                          value={newNoteUrl}
                          onChange={(e) => setNewNoteUrl(e.target.value)}
                          placeholder="URL (optional, https://...)"
                          className="text-xs h-8 sm:w-[170px] bg-background"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              e.stopPropagation();
                              handleAddNote();
                            }
                          }}
                        />
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleAddNote}
                          disabled={!newNoteText.trim() && !newNoteUrl.trim()}
                          className="h-8 px-3 text-xs shrink-0"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1" /> Add
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Tip: Kamu bisa langsung paste link Jira di Note atau cantumkan URL terpisah. Tekan Enter untuk menambah.
                      </p>
                    </div>
                  )}

                  {/* Notes Table */}
                  <div className="border border-border/60 rounded-md overflow-hidden bg-card">
                    <Table className="table-fixed w-full">
                      <TableHeader className="bg-muted/40">
                        <TableRow className="h-8 hover:bg-transparent">
                          <TableHead className="w-[36px] py-1 text-center text-xs font-semibold">#</TableHead>
                          <TableHead className="py-1 text-xs font-semibold">Note</TableHead>
                          <TableHead className="py-1 text-xs font-semibold w-[130px]">Link</TableHead>
                          {!readOnly && <TableHead className="w-[38px] py-1 text-right text-xs"></TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {notes.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={readOnly ? 3 : 4} className="text-center py-4 text-xs text-muted-foreground">
                              {readOnly ? "Tidak ada notes atau link Jira." : "Belum ada notes atau link Jira. Tambahkan di atas."}
                            </TableCell>
                          </TableRow>
                        ) : (
                          notes.map((note, idx) => (
                            <TableRow key={note.id || idx} className="hover:bg-muted/20 transition-colors">
                              <TableCell className="text-center text-xs text-muted-foreground py-2 align-top">
                                {idx + 1}
                              </TableCell>
                              <TableCell className="text-xs font-medium py-2 align-top whitespace-normal break-words [overflow-wrap:anywhere] leading-relaxed">
                                {note.text}
                              </TableCell>
                              <TableCell className="text-xs py-2 align-top">
                                {note.url ? (
                                  <a
                                    href={note.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-primary hover:underline font-medium text-[11px] max-w-[120px] truncate"
                                    title={note.url}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-3 h-3 shrink-0" />
                                    <span className="truncate">{note.url.replace(/^https?:\/\//, "")}</span>
                                  </a>
                                ) : (
                                  <span className="text-muted-foreground text-[11px]">-</span>
                                )}
                              </TableCell>
                              {!readOnly && (
                                <TableCell className="text-right py-2 pr-2 align-top">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDeleteNote(note.id)}
                                    title="Hapus note"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Live Overlap Warning Preview inside Dialog */}
                {!readOnly && liveOverlap.hasOverlap && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-1.5 animate-in fade-in-50">
                    <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <span>Peringatan Jadwal Overlap ({liveOverlap.overlappingTasks.length} task)</span>
                    </div>
                    <p className="text-muted-foreground text-[11px]">
                      PIC <strong>{watchedPic}</strong> memiliki task lain yang bertabrakan di tanggal ini:
                    </p>
                    <div className="space-y-1 max-h-24 overflow-y-auto pr-1">
                      {liveOverlap.overlappingTasks.map((ot) => (
                        <div key={ot.id} className="bg-background/80 dark:bg-muted/40 p-1.5 rounded border border-amber-500/20 text-[11px] flex justify-between items-center gap-2">
                          <div className="min-w-0">
                            <span className="font-semibold text-foreground truncate block">{ot.name}</span>
                            <span className="text-[10px] text-muted-foreground">{ot.startDate} s/d {ot.endDateStr} ({ot.md} MD)</span>
                          </div>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 bg-muted text-muted-foreground uppercase">
                            {ot.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

            <div className="flex justify-between items-center pt-3 gap-2">
              {readOnly ? (
                <>
                  <div />
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Close
                  </Button>
                </>
              ) : (
                <>
                  {isEditing ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="gap-1.5"
                      onClick={async () => {
                        if (!taskToEdit?.id) return;
                        const ok = await confirm({
                          title: "Hapus Task?",
                          description: `Apakah Anda yakin ingin menghapus task "${taskToEdit.name}"? Tindakan ini tidak dapat dibatalkan.`,
                          confirmText: "Hapus Task",
                          cancelText: "Batal",
                          variant: "destructive",
                        });
                        if (ok) {
                          await deleteTask(taskToEdit.id);
                          setOpen(false);
                        }
                      }}
                      disabled={isPending || isDeleting}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Task</span>
                    </Button>
                  ) : (
                    <div />
                  )}
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={isPending || isDeleting}>
                      {isPending || isDeleting
                        ? "Saving..."
                        : isEditing
                        ? "Save Changes"
                        : mode === "backlog"
                        ? "Assign Backlog to Epic"
                        : "Save Task"}
                    </Button>
                  </div>
                </>
              )}
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Overlap Confirmation Dialog */}
      <Dialog open={showOverlapConfirm} onOpenChange={setShowOverlapConfirm}>
        <DialogContent className="sm:max-w-[480px] border-amber-500/30">
          <DialogHeader>
            <div className="w-12 h-12 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2 mx-auto sm:mx-0">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              Konfirmasi Overlap Jadwal PIC
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              PIC <strong className="text-foreground">{pendingSubmitData?.pic}</strong> sudah memiliki {activeOverlapData?.overlappingTasks.length} task lain pada rentang tanggal tersebut.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
            <p className="text-xs font-semibold text-foreground">Daftar task yang bertabrakan:</p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {activeOverlapData?.overlappingTasks.map((ot) => (
                <div key={ot.id} className="p-2.5 rounded-lg bg-muted/40 border border-border/80 flex flex-col gap-1 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-foreground truncate">{ot.name}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 bg-primary/10 text-primary">
                      {ot.epicName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground text-[11px]">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-muted-foreground" />
                      {ot.startDate} s/d {ot.endDateStr}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      {ot.md} MD
                    </span>
                    <span className="font-medium text-foreground">
                      [{ot.status}]
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground pt-1">
              Apakah Anda ingin tetap menugaskan task ini kepada <strong>{pendingSubmitData?.pic}</strong>?
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowOverlapConfirm(false);
              }}
              disabled={isPending}
            >
              Ubah Jadwal
            </Button>
            <Button
              type="button"
              className="bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-600 dark:hover:bg-amber-700"
              onClick={() => {
                if (pendingSubmitData) {
                  executeSave(pendingSubmitData);
                }
              }}
              disabled={isPending}
            >
              {isPending ? "Menyimpan..." : "Tetap Assign & Simpan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

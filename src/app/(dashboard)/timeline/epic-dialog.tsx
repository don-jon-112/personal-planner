"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useAddDocument, useUpdateDocument, useCollection } from "@/hooks/use-firestore";
import { useProject } from "@/components/project-context";
import { useTaskStatuses } from "@/hooks/use-task-statuses";
import { useConfirm } from "@/components/confirm-dialog-provider";
import { useAuth } from "@/components/auth-context";
import { serverTimestamp } from "firebase/firestore";
import { saveProjectCacheToRedis } from "@/lib/cache-client";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Layers, CheckSquare, Clock, ArrowRight, FileText, User, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
});

type FormValues = z.infer<typeof formSchema>;

function getPicColor(name: string, pics: any[] = []) {
  const pic = pics.find((p: any) => p.name === name);
  if (pic && pic.color) return pic.color;
  if (!name || name === "TBD") return "#64748b";
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 50%)`;
}

export function EpicDialog({ 
  epicToEdit, 
  open: controlledOpen,
  onOpenChange: setControlledOpen,
  onSelectTask,
  readOnly = false,
}: { 
  epicToEdit?: any, 
  open?: boolean,
  onOpenChange?: (open: boolean) => void,
  onSelectTask?: (task: any) => void,
  readOnly?: boolean,
}) {
  const { activeProjectId, isItemInActiveProject } = useProject();
  const { currentUser } = useAuth();
  const confirm = useConfirm();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = setControlledOpen || setUncontrolledOpen;

  const { data: allTasks = [], isLoading: isTasksLoading } = useCollection<any>("timelineTasks");
  const { data: pics = [] } = useCollection<any>("timelinePics");
  const { getStatusBadgeStyle } = useTaskStatuses();

  const { mutateAsync: addEpic, isPending: isAdding } = useAddDocument("timelineEpics");
  const { mutateAsync: updateEpic, isPending: isUpdating } = useUpdateDocument("timelineEpics");
  const { mutateAsync: updateTaskDoc } = useUpdateDocument("timelineTasks");
  const { mutateAsync: addAssignmentLog } = useAddDocument("assignmentLogs");

  const [taskSearchQuery, setTaskSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const isEditing = Boolean(epicToEdit && epicToEdit.id);

  // Filter tasks belonging to this epic in active project
  const epicTasks = useMemo(() => {
    if (!epicToEdit?.id) return [];
    return allTasks
      .filter((t: any) => t.epicId === epicToEdit.id && isItemInActiveProject(t.projectId))
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
  }, [allTasks, epicToEdit, isItemInActiveProject]);

  const totalTasks = epicTasks.length;
  const doneTasks = epicTasks.filter((t) => t.status === "DONE" || t.status === "COMPLETED").length;
  const totalMd = epicTasks.reduce((sum, t) => sum + (Number(t.md) || 0), 0);
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Filtered tasks by search and status inside dialog
  const filteredTasks = useMemo(() => {
    return epicTasks.filter((t) => {
      const taskStatus = (t.status || "TODO").trim().toUpperCase();
      if (statusFilter !== "ALL" && taskStatus !== statusFilter) {
        return false;
      }
      if (taskSearchQuery.trim()) {
        const q = taskSearchQuery.toLowerCase().trim();
        const matchName = (t.name || "").toLowerCase().includes(q);
        const matchPic = (t.pic || "").toLowerCase().includes(q);
        return matchName || matchPic;
      }
      return true;
    });
  }, [epicTasks, statusFilter, taskSearchQuery]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: epicToEdit ? { name: epicToEdit.name || "" } : { name: "" },
  });

  useEffect(() => {
    if (open) {
      form.reset(epicToEdit ? { name: epicToEdit.name || "" } : { name: "" });
      setTaskSearchQuery("");
      setStatusFilter("ALL");
    }
  }, [epicToEdit, open, form]);

  async function onSubmit(data: FormValues) {
    try {
      if (epicToEdit?.id) {
        await updateEpic({ id: epicToEdit.id, data });
      } else {
        await addEpic({ ...data, order: Date.now(), projectId: activeProjectId || undefined });
      }
      setOpen(false);
      if (!epicToEdit) form.reset();
    } catch (error) {
      console.error(error);
    }
  }

  const handleBackToTodo = async (task: any) => {
    const taskId = task.id || task._id || task.taskId;
    if (!taskId) return;

    const ok = await confirm({
      title: "Kembalikan ke TODO?",
      description: `Apakah Anda yakin ingin mengembalikan task "${task.name}" ke status TODO? PIC dan Start Date akan direset menjadi TBD.`,
      confirmText: "Ya, Kembalikan ke TODO",
      cancelText: "Batal",
      variant: "default",
    });
    if (!ok) return;

    try {
      const updatedData = {
        status: "TODO",
        pic: "TBD",
        startDate: "TBD",
        endDate: "",
        updatedAt: serverTimestamp(),
      };

      await updateTaskDoc({
        id: taskId,
        data: updatedData,
      });

      // Audit log in assignmentLogs
      try {
        await addAssignmentLog({
          taskId: taskId,
          taskName: task.name || "Untitled Task",
          epicId: epicToEdit?.id || null,
          epicName: epicToEdit?.name || "-",
          projectId: task.projectId || activeProjectId || "_global_",
          userId: currentUser?.id || "unknown",
          username: currentUser?.username || "-",
          userName: currentUser?.name || currentUser?.username || "User",
          action: "BACK_TODO",
          previousStatus: task.status || "ON PROGRESS",
          previousPic: task.pic || "-",
          previousStartDate: task.startDate || "-",
          status: "TODO",
          pic: "TBD",
          startDate: "TBD",
          claimedAt: serverTimestamp(),
          timestamp: new Date().toISOString(),
        });
      } catch (logErr) {
        console.warn("Failed to create assignment log:", logErr);
      }

      // Sync Redis cache
      const currentTasks = allTasks.filter((t: any) => isItemInActiveProject(t.projectId));
      const nextTasks = currentTasks.map((t: any) =>
        t.id === taskId ? { ...t, ...updatedData } : t
      );
      saveProjectCacheToRedis(activeProjectId || "_global_", {
        tasks: nextTasks,
      }).catch(console.warn);
    } catch (err) {
      console.error("Failed to return task to TODO:", err);
    }
  };

  const isPending = isAdding || isUpdating;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent 
        className={
          isEditing 
            ? "w-[94vw] max-w-5xl xl:max-w-6xl h-[88vh] max-h-[90vh] flex flex-col p-0 overflow-hidden" 
            : "sm:max-w-[480px] p-6"
        }
      >
        {/* Header */}
        <div className="p-5 pb-4 border-b border-border/60 bg-primary/5 shrink-0">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/20 text-primary shrink-0">
                <Layers className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-lg font-bold text-foreground">
                  {readOnly ? "Epic Details" : isEditing ? "Edit Epic" : "Create New Epic"}
                </DialogTitle>
                {isEditing && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {readOnly ? "Tinjau nama epic dan daftar task yang terkait." : "Update nama epic dan tinjau daftar task yang terkait."}
                  </p>
                )}
              </div>
            </div>
          </DialogHeader>
        </div>

        {/* Epic Name Form */}
        <div className="px-5 py-3 border-b border-border/40 bg-card shrink-0">
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-2">
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="space-y-1.5 flex-1 w-full">
                <Label className="text-xs font-semibold">Epic Name</Label>
                <Input 
                  {...form.register("name")} 
                  placeholder="e.g., Auth Module Revamp" 
                  disabled={readOnly}
                  className={cn("h-9 text-sm", readOnly && "bg-muted text-muted-foreground cursor-not-allowed")}
                />
                {form.formState.errors.name && (
                  <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              {!readOnly && (
                <Button type="submit" disabled={isPending} className="h-9 shrink-0 font-semibold gap-1.5">
                  {isPending ? "Saving..." : isEditing ? "Save Epic Name" : "Create Epic"}
                </Button>
              )}
            </div>
          </form>
        </div>

        {/* Epic Stats & Tasks Section (shown only when editing an existing epic) */}
        {isEditing && (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            {/* Toolbar: Stats & Search & Status Filter */}
            <div className="px-5 py-2.5 bg-muted/20 border-b border-border/40 flex flex-wrap items-center justify-between gap-3 shrink-0">
              {/* Left: Search & Filter */}
              <div className="flex items-center gap-2 flex-1 min-w-[280px]">
                <div className="relative flex-1 max-w-xs">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={taskSearchQuery}
                    onChange={(e) => setTaskSearchQuery(e.target.value)}
                    placeholder="Cari task atau PIC di epic ini..."
                    className="h-8 pl-8 pr-7 text-xs bg-background"
                  />
                  {taskSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setTaskSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Quick Status Filters */}
                <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                  {["ALL", "TODO", "ON PROGRESS", "IN REVIEW", "DONE"].map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatusFilter(st)}
                      className={cn(
                        "px-2 py-1 rounded text-[11px] font-semibold transition-all whitespace-nowrap",
                        statusFilter === st
                          ? "bg-primary text-primary-foreground shadow-2xs"
                          : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                      )}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Stats Summary */}
              <div className="flex items-center gap-3 shrink-0 text-xs">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-primary/10 text-primary font-semibold border border-primary/20">
                  <CheckSquare className="w-3.5 h-3.5" />
                  {doneTasks} / {totalTasks} Done ({completionPct}%)
                </span>
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted text-muted-foreground font-semibold border border-border/60">
                  <Clock className="w-3.5 h-3.5 opacity-70" />
                  {totalMd} Total MD
                </span>
              </div>
            </div>

            {/* Table Container */}
            <div className="flex-1 min-h-0 overflow-y-auto px-5 py-3">
              <div className="border border-border/60 rounded-lg overflow-hidden bg-card shadow-2xs">
                <Table>
                  <TableHeader className="bg-muted/50 sticky top-0 z-10 backdrop-blur-xs border-b">
                    <TableRow className="h-9 hover:bg-transparent">
                      <TableHead className="w-12 py-1.5 text-center text-xs font-semibold">#</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold min-w-[260px]">Task Name</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-32">PIC</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-32">Status</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-28">Start Date</TableHead>
                      <TableHead className="py-1.5 text-xs font-semibold w-16 text-center">MD</TableHead>
                      <TableHead className="w-44 py-1.5 text-right text-xs font-semibold pr-3">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isTasksLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                          Loading tasks...
                        </TableCell>
                      </TableRow>
                    ) : filteredTasks.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-xs text-muted-foreground">
                          <p className="font-semibold text-sm">Tidak ada task yang cocok</p>
                          <p className="text-[11px] text-muted-foreground/70 mt-1">
                            {taskSearchQuery || statusFilter !== "ALL"
                              ? "Coba ubah kata kunci pencarian atau filter status."
                              : "Belum ada task di epic ini. Kamu bisa menugaskan task dari Task Plan atau Timeline."}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredTasks.map((task, idx) => {
                        const picColor = getPicColor(task.pic, pics);
                        const statusStyle = getStatusBadgeStyle(task.status);
                        const hasNotes = Array.isArray(task.notes) && task.notes.length > 0;
                        const formattedDate = task.startDate && task.startDate !== "TBD"
                          ? new Date(task.startDate).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : task.startDate || "TBD";

                        const isTaskOnProgress = (task.status || "").trim().toUpperCase() === "ON PROGRESS" || (task.status || "").trim().toUpperCase() === "IN PROGRESS";

                        return (
                          <TableRow 
                            key={task.id || idx}
                            className="h-10 hover:bg-muted/40 cursor-pointer group transition-colors"
                            onClick={() => {
                              if (onSelectTask) {
                                onSelectTask(task);
                              }
                            }}
                          >
                            <TableCell className="text-center text-xs text-muted-foreground py-1.5">
                              {idx + 1}
                            </TableCell>
                            <TableCell className="py-1.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1" title={task.name}>
                                  {task.name}
                                </span>
                                {hasNotes && (
                                  <span 
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] bg-muted text-muted-foreground border border-border/60 shrink-0 select-none"
                                    title={`${task.notes.length} note(s)`}
                                  >
                                    <FileText className="w-2.5 h-2.5 text-primary" />
                                    <span>{task.notes.length}</span>
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <span 
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white max-w-[120px] truncate"
                                style={{ backgroundColor: picColor }}
                              >
                                <User className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{task.pic || "TBD"}</span>
                              </span>
                            </TableCell>
                            <TableCell className="py-1.5">
                              <span 
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                style={statusStyle}
                              >
                                {task.status || "TODO"}
                              </span>
                            </TableCell>
                            <TableCell className="py-1.5 text-xs text-muted-foreground whitespace-nowrap">
                              {formattedDate}
                            </TableCell>
                            <TableCell className="py-1.5 text-xs font-semibold text-center text-foreground font-mono">
                              {task.md || 1}
                            </TableCell>
                            <TableCell className="py-1.5 text-right pr-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-end gap-1.5">
                                {isTaskOnProgress && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11px] font-bold text-amber-600 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/10 hover:text-amber-700 hover:border-amber-500/50"
                                    onClick={() => handleBackToTodo(task)}
                                    title="Kembalikan status task ke TODO dan reset PIC & Start Date ke TBD"
                                  >
                                    <RotateCcw className="w-3 h-3 mr-1" />
                                    BACK TODO
                                  </Button>
                                )}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary group-hover:bg-background"
                                  onClick={() => {
                                    if (onSelectTask) {
                                      onSelectTask(task);
                                    }
                                  }}
                                  title="Buka detail task"
                                >
                                  Detail <ArrowRight className="w-3 h-3 ml-0.5" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-2.5 border-t border-border/60 bg-muted/20 flex items-center justify-between text-xs text-muted-foreground shrink-0">
              <span>
                Menampilkan <strong>{filteredTasks.length}</strong> dari <strong>{totalTasks}</strong> task
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={() => setOpen(false)}
              >
                Tutup
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

